// TEL.SCORE · o "vigia" das notificações
//
//   GET /api/avisos?acao=vigiar   → roda a cada minuto (agendado no Supabase, veja supabase/06_vigia_cron.sql).
//                                   Olha os jogos dos times seguidos por quem ligou os avisos e manda:
//                                   lembrete (30 min antes), escalações, início, gol, VAR, vermelho,
//                                   pênalti perdido, intervalo, fim (e, se a pessoa quiser, amarelo e substituições).
//
// Precisa do cabeçalho Authorization: Bearer <CRON_SECRET>.
// Gasta requisições da API-Football só quando alguém tem avisos ligados e há jogo dos times seguidos
// perto do horário: 1 lista do dia a cada 30 minutos + 1 consulta por minuto para cada 20 jogos em andamento.

const { cfg, sb, sbAll, apiFootball, send, cronOk, contar } = require('./_db');
const { limpaAvisos, enviaVarios } = require('./_fcm');

const MIN = 60000, HOUR = 60 * MIN;
const TZ = 'America/Sao_Paulo';
const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP']);
const FIM = new Set(['FT', 'AET', 'PEN']);
const VOID = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO']);
const PRE = new Set(['NS', 'TBD']);

// nome pelo qual o jogador é conhecido: o da escalação ("Rayan"); tira só a inicial ("B. Saka" → "Saka")
function nomes(f) {
  const M = {};
  (f.lineups || []).forEach(L => [...(L.startXI || []), ...(L.substitutes || [])].forEach(x => { const p = x && x.player; if (p && p.id && p.name) M[p.id] = p.name; }));
  (f.players || []).forEach(t => (t.players || []).forEach(p => { if (p.player && p.player.id && !M[p.player.id] && p.player.name) M[p.player.id] = p.player.name; }));
  return pl => {
    if (!pl) return '';
    const n = String((pl.id && M[pl.id]) || pl.name || '').trim();
    const m = n.match(/^[A-ZÀ-Ý]\.\s*(.+)$/);
    return m ? m[1] : n;
  };
}
const minuto = e => `${e.time && e.time.elapsed != null ? e.time.elapsed : '?'}${e.time && e.time.extra ? '+' + e.time.extra : ''}'`;
const dataSP = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const horaSP = (d) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);
const VAR_PT = d => /goal cancelled|goal disallowed/i.test(d) ? 'gol anulado' + (/offside/i.test(d) ? ' por impedimento' : /handball/i.test(d) ? ' por mão na bola' : /foul/i.test(d) ? ' por falta' : '')
  : /penalty confirmed/i.test(d) ? 'pênalti confirmado' : /penalty cancelled/i.test(d) ? 'pênalti cancelado' : /goal confirmed/i.test(d) ? 'gol confirmado'
  : /card upgrade/i.test(d) ? 'cartão alterado' : /card reviewed|card cancelled/i.test(d) ? 'cartão revisado' : 'revisão do VAR';

// Compara o que já foi avisado (linha do banco) com o jogo agora e devolve os avisos novos.
function processa(row, f, agora) {
  const out = [], upd = {};
  const st = f.fixture.status.short, el = f.fixture.status.elapsed || 0;
  const H = f.teams.home, A = f.teams.away;
  const gh = f.goals.home == null ? 0 : f.goals.home, ga = f.goals.away == null ? 0 : f.goals.away;
  const nm = nomes(f);
  const placar = `${H.name} ${gh}×${ga} ${A.name}`;
  // jeito Sofascore: título com os times, corpo com minuto + lance e, embaixo, quem fez; escudo de quem fez o lance
  const titulo = `${H.name} x ${A.name}`;
  const pl = (h, a, lado) => lado === 'h' ? `[${h}] - ${a}` : lado === 'a' ? `${h} - [${a}]` : `${h} - ${a}`;
  const esc = t => (t && t.id === H.id ? H.logo : t && t.id === A.id ? A.logo : null) || (f.league && f.league.logo) || null;
  const escLiga = (f.league && f.league.logo) || H.logo || null;
  const liga = (f.league && f.league.name) || '';
  const id = f.fixture.id;
  const inicio = Date.parse(f.fixture.date);
  const primeira = row.status == null;
  // começamos a olhar com o jogo já andando: só registra o que já aconteceu, sem avisar coisa velha
  const boot = primeira && (FIM.has(st) || (LIVE.has(st) && el > 10));
  const vistos = new Set(Array.isArray(row.vistos) ? row.vistos : []);
  const add = (tipo, title, body, tag, img) => out.push({ tipo, title, body, fixture: id, tag: tag || `${id}-${tipo}`, img: img || escLiga });

  // lembrete 30 minutos antes
  if (PRE.has(st) && !row.lembrete && agora >= inicio - 30 * MIN && agora < inicio) {
    add('lembrete', titulo, `⏰ Começa às ${horaSP(new Date(inicio))}\n${liga}`);
    upd.lembrete = true;
  }
  // escalações
  const lu = f.lineups || [];
  if (!row.escalacao && lu.length >= 2 && (lu[0].startXI || []).length && (lu[1].startXI || []).length) {
    if (!boot && !FIM.has(st)) add('escalacao', titulo, `📋 Escalações confirmadas\n${H.name} ${lu[0].formation || ''} · ${A.name} ${lu[1].formation || ''}`.replace(/ +·/g, ' ·').trim());
    upd.escalacao = true;
  }
  // começou
  if (!row.inicio_ok && (LIVE.has(st) || FIM.has(st))) {
    if (!boot && LIVE.has(st) && el <= 20) add('inicio', titulo, `▶️ Começou! ${pl(gh, ga)}\n${liga}`);
    upd.inicio_ok = true;
  }
  // gols: pelo placar (a API às vezes corrige o minuto do gol; o placar não engana)
  const ph = row.gols_casa, pa = row.gols_fora;
  const golEv = (f.events || []).filter(e => e.type === 'Goal' && e.detail !== 'Missed Penalty');
  const golKey = e => `G|${e.team && e.team.id}|${(e.player && (e.player.id || e.player.name)) || ''}|${e.time && e.time.elapsed}|${(e.time && e.time.extra) || 0}`;
  if (boot || ph == null) { golEv.forEach(e => vistos.add(golKey(e))); upd.gols_casa = gh; upd.gols_fora = ga; upd.espera = 0; }
  else {
    const dh = Math.max(0, gh - ph), da = Math.max(0, ga - pa);
    if (dh + da > 0) {
      const novos = golEv.filter(e => !vistos.has(golKey(e))).sort((x, y) => (x.time.elapsed - y.time.elapsed) || ((x.time.extra || 0) - (y.time.extra || 0)));
      // distribui os gols novos entre os lados que marcaram (gol contra vale para o rival)
      const need = { h: dh, a: da }, eh = [], ea = [];
      for (const e of novos) {
        const tid = e.team && e.team.id;
        let s = null;
        if (e.detail === 'Own Goal') { const s1 = tid === H.id ? 'a' : 'h', s2 = s1 === 'h' ? 'a' : 'h'; s = need[s1] > 0 ? s1 : need[s2] > 0 ? s2 : null; }
        else { const s0 = tid === H.id ? 'h' : tid === A.id ? 'a' : null; s = s0 && need[s0] > 0 ? s0 : null; }
        if (!s) continue;
        need[s]--; (s === 'h' ? eh : ea).push(e);
      }
      const falta = (dh - eh.length) + (da - ea.length);
      if (falta > 0 && (row.espera || 0) < 2) {
        // placar mudou antes de a API registrar quem marcou: espera até 2 minutos pelo nome
        upd.espera = (row.espera || 0) + 1;
      } else {
        // placar corrido: com 2 gols no mesmo minuto, cada aviso mostra o placar daquele gol
        const todos = [...Array(dh).keys()].map(i => ({ e: eh[i], lado: 'h' })).concat([...Array(da).keys()].map(i => ({ e: ea[i], lado: 'a' })))
          .sort((x, y) => (x.e && y.e) ? ((x.e.time.elapsed - y.e.time.elapsed) || ((x.e.time.extra || 0) - (y.e.time.extra || 0))) : 0);
        let ch = ph, ca = pa;
        for (const { e, lado } of todos) {
          if (e) vistos.add(golKey(e));
          if (lado === 'h') ch++; else ca++;
          const team = lado === 'h' ? H : A;
          const quem = e ? nm(e.player) : '';
          const extra = e && e.detail === 'Penalty' ? ' (pênalti)' : e && e.detail === 'Own Goal' ? ' (contra)' : '';
          add('gol', titulo, `${e ? minuto(e) + ' ' : ''}⚽ Gol do ${team.name}! ${pl(ch, ca, lado)}\n${quem ? quem + extra : 'Autor do gol a confirmar'}`, `${id}-gol-${ch}-${ca}`, team.logo);
        }
        upd.gols_casa = gh; upd.gols_fora = ga; upd.espera = 0;
      }
    } else if (gh !== ph || ga !== pa) { upd.gols_casa = gh; upd.gols_fora = ga; upd.espera = 0; }
  }
  // VAR, vermelho, pênalti perdido, amarelo, substituição
  for (const e of f.events || []) {
    const tn = (e.team && (e.team.name || (e.team.id === H.id ? H.name : e.team.id === A.id ? A.name : ''))) || '', quem = nm(e.player), t = e.time && e.time.elapsed;
    let k = null, tipo = null, title = '', body = '';
    const pq = [quem || 'Jogador', tn].filter(Boolean).join(' · '), agoraPl = pl(gh, ga);
    if (e.type === 'Card' && /red|second/i.test(e.detail || '')) { k = `C|${(e.player && e.player.id) || quem}`; tipo = 'vermelho'; body = `${minuto(e)} 🟥 Expulso! ${/second/i.test(e.detail) ? '(2º amarelo) ' : ''}${agoraPl}\n${pq}`; }
    else if (e.type === 'Card' && /yellow/i.test(e.detail || '')) { k = `Y|${(e.player && e.player.id) || quem}|${t}`; tipo = 'amarelo'; body = `${minuto(e)} 🟨 Cartão amarelo ${agoraPl}\n${pq}`; }
    else if (e.type === 'Var') { k = `V|${e.detail}|${e.team && e.team.id}|${t}`; tipo = 'var'; const d = VAR_PT(e.detail || ''); body = `${minuto(e)} 📺 VAR: ${d} ${agoraPl}\n${quem ? pq : tn}`; }
    else if (e.type === 'Goal' && e.detail === 'Missed Penalty') { k = `P|${(e.player && e.player.id) || quem}|${t}`; tipo = 'penalti'; body = `${minuto(e)} ❌ Pênalti perdido! ${agoraPl}\n${pq}`; }
    else if (e.type === 'subst') { k = `S|${(e.player && e.player.id) || quem}|${(e.assist && e.assist.id) || ''}`; tipo = 'substituicao'; const ent = nm(e.assist); body = `${minuto(e)} 🔁 Substituição · ${tn}\n${ent ? `Entra ${ent}` : ''}${ent && quem ? ', sai ' : (!ent && quem ? 'Sai ' : '')}${quem || ''}`; }
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    if (!boot) add(tipo, titulo, body, `${id}-${k}`, esc(e.team));
  }
  // intervalo
  if (!row.intervalo && (st === 'HT' || ['2H', 'ET', 'BT', 'P'].includes(st) || FIM.has(st))) {
    if (st === 'HT' && !boot) add('intervalo', titulo, `⏸️ Intervalo: ${pl(gh, ga)}\n${liga}`);
    upd.intervalo = true;
  }
  // fim
  if (!row.fim && FIM.has(st)) {
    if (!(primeira && boot && agora - inicio > 4 * HOUR)) add('fim', titulo, `🏁 Fim de jogo: ${pl(gh, ga)}\n${st === 'PEN' && f.score && f.score.penalty ? `Pênaltis: ${f.score.penalty.home} - ${f.score.penalty.away} · ${liga}` : liga}`);
    upd.fim = true;
  }
  if (VOID.has(st)) upd.fim = true;
  upd.status = st;
  upd.vistos = [...vistos].slice(-300);
  return { out, upd };
}

async function estado(c, chave) {
  const { data } = await sb(c, `avisos_estado?chave=eq.${encodeURIComponent(chave)}&select=valor,atualizado_em`);
  return data && data[0] ? data[0] : null;
}
async function salvaEstado(c, chave, valor) {
  await sb(c, 'avisos_estado', { method: 'POST', body: { chave, valor, atualizado_em: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal' });
}

async function vigiar(c, q) {
  const agora = Date.now();
  // 1) quem ligou os avisos e tem pelo menos um celular ou navegador cadastrado
  const perfis = await sbAll(c, 'perfis?select=user_id,times,ligas,avisos&avisos->>on=eq.true');
  if (!perfis.length) return { ok: true, motivo: 'Ninguém com avisos ligados.' };
  const disp = await sbAll(c, 'dispositivos?select=token,user_id');
  const toks = new Map();
  disp.forEach(d => { if (!toks.has(d.user_id)) toks.set(d.user_id, []); toks.get(d.user_id).push(d.token); });
  const users = perfis.filter(p => toks.has(p.user_id)).map(p => ({ id: p.user_id, times: new Set((p.times || []).map(t => +t.id)), ligas: new Set((p.ligas || []).map(Number)), av: limpaAvisos(p.avisos) }));
  if (!users.length) return { ok: true, motivo: 'Nenhum aparelho cadastrado.' };
  const T = new Set(), Lg = new Set();
  users.forEach(u => { u.times.forEach(t => T.add(t)); if (u.av.ligas) u.ligas.forEach(l => Lg.add(l)); });
  const quer = f => T.has(f.teams.home.id) || T.has(f.teams.away.id) || Lg.has(f.league.id);

  // 2) lista dos jogos do dia (a cada 30 minutos, ou quando mudam os times seguidos)
  const assinatura = [...T].sort((a, b) => a - b).join(',') + '|' + [...Lg].sort((a, b) => a - b).join(',');
  const est = await estado(c, 'lista');
  let chamadas = 0;
  if (q.forcar === '1' || !est || agora - Date.parse(est.atualizado_em) > 30 * MIN || (est.valor && est.valor.assinatura) !== assinatura) {
    const hoje = new Date(agora);
    const dias = [dataSP(hoje)];
    const horaLocal = +new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(hoje);
    if (horaLocal >= 21) dias.push(dataSP(new Date(agora + 6 * HOUR)));
    const porId = new Map();
    for (const d of dias) {
      const lista = await apiFootball(`fixtures?date=${d}&timezone=${encodeURIComponent(TZ)}`); chamadas++;
      lista.filter(quer).forEach(f => porId.set(f.fixture.id, { fixture_id: f.fixture.id, inicio: f.fixture.date, liga_id: f.league.id, liga: f.league.name, mandante_id: f.teams.home.id, visitante_id: f.teams.away.id, mandante: f.teams.home.name, visitante: f.teams.away.name }));
    }
    const linhas = [...porId.values()]; // o mesmo jogo pode vir nas duas datas
    if (linhas.length) await sb(c, 'avisos_jogos', { method: 'POST', body: linhas, prefer: 'resolution=merge-duplicates,return=minimal' });
    await salvaEstado(c, 'lista', { assinatura, jogos: linhas.length });
    // limpeza: jogos de mais de 3 dias
    await sb(c, `avisos_jogos?inicio=lt.${new Date(agora - 72 * HOUR).toISOString()}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {});
  }

  // 3) jogos na janela: de 35 minutos antes até o fim (no máximo 4 horas depois do início)
  const de = new Date(agora - 4 * HOUR).toISOString(), ate = new Date(agora + 35 * MIN).toISOString();
  const rows = (await sbAll(c, `avisos_jogos?select=*&inicio=gte.${de}&inicio=lte.${ate}&fim=eq.false`))
    .filter(r => T.has(r.mandante_id) || T.has(r.visitante_id) || Lg.has(r.liga_id));
  if (!rows.length) { if (chamadas && q.seco !== '1') await contar(c, { requisicoes_avisos: chamadas }); return { ok: true, jogos: 0, chamadas }; }

  // 4) detalhes dos jogos (eventos, escalações), de 20 em 20
  const det = new Map();
  for (let i = 0; i < rows.length; i += 20) {
    const ids = rows.slice(i, i + 20).map(r => r.fixture_id).join('-');
    const L = await apiFootball(`fixtures?ids=${ids}&timezone=${encodeURIComponent(TZ)}`); chamadas++;
    L.forEach(f => det.set(f.fixture.id, f));
  }

  // 5) o que mudou e para quem mandar
  const fila = [];
  let avisos = 0;
  const porTipo = {};
  for (const row of rows) {
    const f = det.get(row.fixture_id);
    if (!f) continue;
    const { out, upd } = processa(row, f, agora);
    if (out.length) {
      const H = f.teams.home.id, A = f.teams.away.id, lg = f.league.id;
      const alvo = users.filter(u => u.times.has(H) || u.times.has(A) || (u.av.ligas && u.ligas.has(lg)));
      out.forEach(n => {
        avisos++; porTipo['lances:' + n.tipo] = (porTipo['lances:' + n.tipo] || 0) + 1;
        const vistos = new Set();
        alvo.filter(u => u.av.tipos.includes(n.tipo)).forEach(u => toks.get(u.id).forEach(token => { if (!vistos.has(token)) { vistos.add(token); fila.push({ token, n }); } }));
      });
    }
    upd.atualizado_em = new Date().toISOString();
    await sb(c, `avisos_jogos?fixture_id=eq.${row.fixture_id}`, { method: 'PATCH', body: upd, prefer: 'return=minimal' });
  }
  const r = q.seco === '1' ? { ok: true, enviados: 0, mortos: [], erros: [], seco: true } : await enviaVarios(fila);
  if (q.seco !== '1') await contar(c, { avisos: r.enviados || 0, lances: avisos, ...porTipo, requisicoes_avisos: chamadas });
  if (r.mortos && r.mortos.length) {
    for (const t of r.mortos) await sb(c, `dispositivos?token=eq.${encodeURIComponent(t)}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {});
  }
  return { ok: true, jogos: rows.length, chamadas, avisos, mensagens: fila.length, enviados: r.enviados, removidos: (r.mortos || []).length, erros: r.erros, motivo: r.motivo, ...(q.seco === '1' ? { fila: fila.map(x => x.n.title + ' | ' + x.n.body) } : {}) };
}

module.exports = async (req, res) => {
  const q = req.query || {};
  if (!cronOk(req)) return send(res, 401, { ok: false, error: 'Não autorizado.' });
  const c = cfg();
  if (!c) return send(res, 200, { ok: false, error: 'Supabase não configurado.' });
  try {
    if (String(q.acao || '') === 'vigiar') return send(res, 200, await vigiar(c, q));
    return send(res, 400, { ok: false, error: 'Ação desconhecida.' });
  } catch (e) {
    return send(res, 500, { ok: false, error: String((e && e.message) || e).slice(0, 300) });
  }
};

module.exports._test = { processa, nomes, VAR_PT };
