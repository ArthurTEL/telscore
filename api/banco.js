// TEL.SCORE · banco de jogos (partes 2 e 3)
//
// Guarda no Supabase todos os jogos encerrados das ligas acompanhadas, com estatísticas,
// e devolve leituras prontas para o site:
//
//   GET /api/banco?acao=coletar          → tarefa agendada (cron da Vercel): busca jogos novos e completa a temporada
//   GET /api/banco?acao=liga&id=71       → xG, xG sofrido e pontos esperados (xPts) de cada time na temporada
//   GET /api/banco?acao=arbitro&nome=X   → perfil do árbitro: cartões, faltas, pênaltis e resultados
//   GET /api/banco?acao=h2h&a=1&b=2      → confrontos guardados entre dois times, com estatísticas
//   GET /api/banco?acao=resumo           → quantos jogos já estão guardados por liga
//
// A coleta respeita a cota da API-Football: usa no máximo COLETA_MAX requisições por vez (padrão 15)
// e para quando sobram menos de COLETA_RESERVA no dia (padrão 35), para o site nunca ficar sem.

const { cfg, sb, sbAll, apiFootball, norm, refName, send, cronOk } = require('./_db');

const TZ = 'America/Sao_Paulo';
const FINISHED = new Set(['FT', 'AET', 'PEN']);
// ordem de prioridade da coleta
const LIGAS = [
  { id: 71, sa: true }, { id: 39 }, { id: 140 }, { id: 135 }, { id: 78 }, { id: 61 },
  { id: 72, sa: true }, { id: 13, sa: true }, { id: 11, sa: true }, { id: 2 }, { id: 3 }, { id: 73, sa: true }
];
const LIGA_IDS = new Set(LIGAS.map(l => l.id));
const HOUR = 3600 * 1000, DAY = 24 * HOUR;

const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
function ymd(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
// temporada atual: ligas sul-americanas usam o ano; europeias trocam em julho
function seasonOf(id, now = new Date()) {
  const [y, m] = ymd(now).split('-').map(Number);
  const L = LIGAS.find(l => l.id === id);
  return L && L.sa ? y : m >= 7 ? y : y - 1;
}

/* ---------------- montar a linha de um jogo ---------------- */
const num = v => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace('%', '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
function rowOf(f) {
  const H = f.teams.home.id, A = f.teams.away.id;
  const S = { h: {}, a: {} };
  (f.statistics || []).forEach(s => {
    const side = s.team && s.team.id === H ? 'h' : s.team && s.team.id === A ? 'a' : null;
    if (!side) return;
    (s.statistics || []).forEach(x => { S[side][x.type] = x.value; });
  });
  const hasStats = Object.keys(S.h).length > 0 && Object.keys(S.a).length > 0;
  const g = (side, k) => num(S[side][k]);
  // a API manda null no lugar de zero em contagens (cartões, escanteios) quando o jogo tem estatísticas
  const cnt = (side, k) => (hasStats ? Math.round(g(side, k) || 0) : null);

  let xh = g('h', 'expected_goals'), xa = g('a', 'expected_goals'), fonte = null;
  if (xh != null && xa != null && xh + xa > 0) fonte = 'xg';
  else {
    const ts = [g('h', 'Total Shots'), g('a', 'Total Shots')], so = [g('h', 'Shots on Goal'), g('a', 'Shots on Goal')];
    if (hasStats && ts[0] != null && ts[1] != null && ts[0] + ts[1] > 0) {
      const est = i => 0.3 * (so[i] || 0) + 0.05 * Math.max(0, ts[i] - (so[i] || 0));
      xh = est(0); xa = est(1); fonte = 'chutes';
    } else { xh = null; xa = null; }
  }
  const ev = Array.isArray(f.events) ? f.events : null;
  const evCards = (team, re) => (ev ? ev.filter(e => e.type === 'Card' && e.team && e.team.id === team && re.test(e.detail || '')).length : null);
  const yH = hasStats ? cnt('h', 'Yellow Cards') : evCards(H, /Yellow/i), yA = hasStats ? cnt('a', 'Yellow Cards') : evCards(A, /Yellow/i);
  const rH = hasStats ? cnt('h', 'Red Cards') : evCards(H, /Red|Second/i), rA = hasStats ? cnt('a', 'Red Cards') : evCards(A, /Red|Second/i);
  const pens = ev ? ev.filter(e => e.type === 'Goal' && /Penalty/i.test(e.detail || '') && !/shootout/i.test(e.comments || '')).length : null;
  const vars = ev ? ev.filter(e => e.type === 'Var').length : null;
  const sc = f.score || {};
  const ft = sc.fulltime && sc.fulltime.home != null ? sc.fulltime : f.goals || {};
  const ht = sc.halftime || {};
  const r2 = v => (v == null ? null : Math.round(v * 100) / 100);
  const sm = v => (v == null ? null : Math.round(v));
  const raw = f.fixture.referee || null;
  return {
    fixture_id: f.fixture.id,
    liga_id: f.league.id,
    temporada: f.league.season,
    liga_nome: f.league.name || null,
    pais: f.league.country || null,
    rodada: f.league.round || null,
    data: new Date(f.fixture.date).toISOString(),
    status: f.fixture.status.short,
    arbitro: raw,
    arbitro_chave: raw ? norm(refName(raw)) || null : null,
    estadio: (f.fixture.venue && f.fixture.venue.name) || null,
    mandante_id: H,
    mandante: f.teams.home.name,
    visitante_id: A,
    visitante: f.teams.away.name,
    gols_casa: f.goals ? f.goals.home : null,
    gols_fora: f.goals ? f.goals.away : null,
    ft_casa: ft.home == null ? null : ft.home,
    ft_fora: ft.away == null ? null : ft.away,
    ht_casa: ht.home == null ? null : ht.home,
    ht_fora: ht.away == null ? null : ht.away,
    xg_casa: r2(xh),
    xg_fora: r2(xa),
    xg_fonte: fonte,
    chutes_casa: hasStats ? sm(g('h', 'Total Shots')) : null,
    chutes_fora: hasStats ? sm(g('a', 'Total Shots')) : null,
    chutes_gol_casa: hasStats ? cnt('h', 'Shots on Goal') : null,
    chutes_gol_fora: hasStats ? cnt('a', 'Shots on Goal') : null,
    posse_casa: hasStats ? sm(g('h', 'Ball Possession')) : null,
    posse_fora: hasStats ? sm(g('a', 'Ball Possession')) : null,
    escanteios_casa: cnt('h', 'Corner Kicks'),
    escanteios_fora: cnt('a', 'Corner Kicks'),
    faltas_casa: hasStats ? sm(g('h', 'Fouls')) : null,
    faltas_fora: hasStats ? sm(g('a', 'Fouls')) : null,
    amarelos_casa: yH,
    amarelos_fora: yA,
    vermelhos_casa: rH,
    vermelhos_fora: rA,
    penaltis: pens,
    var_revisoes: vars,
    estatisticas: hasStats ? S : null,
    coletado_em: new Date().toISOString()
  };
}

/* ---------------- coleta (tarefa agendada) ---------------- */
async function idsGuardados(c, ids) {
  const have = new Set();
  for (let i = 0; i < ids.length; i += 150) {
    const part = ids.slice(i, i + 150);
    const { data } = await sb(c, `jogos?fixture_id=in.(${part.join(',')})&select=fixture_id`);
    (data || []).forEach(r => have.add(Number(r.fixture_id)));
  }
  return have;
}

async function coletar(c, req, res) {
  if (!cronOk(req)) return send(res, 401, { ok: false, error: 'Não autorizado.' });
  const maxCalls = Math.max(1, int(process.env.COLETA_MAX, 15));
  const reserva = Math.max(0, int(process.env.COLETA_RESERVA, 35));
  let restante = null;
  try {
    const s = await apiFootball('status'); // não conta na cota
    const rq = s && s.requests;
    if (rq && rq.limit_day) restante = rq.limit_day - rq.current;
  } catch (e) { /* segue com o limite padrão */ }
  const budget = restante == null ? maxCalls : Math.min(maxCalls, restante - reserva);
  if (budget <= 0) return send(res, 200, { ok: true, pulado: 'cota do dia baixa', restante });

  let calls = 0, salvos = 0, semEstat = 0;
  const fila = [];
  const naFila = new Set();
  const add = id => { if (!naFila.has(id)) { naFila.add(id); fila.push(id); } };
  const now = new Date();

  // 1) jogos de ontem e de hoje (pega o que terminou desde a última coleta)
  const recentes = [];
  for (const d of [ymd(new Date(now - DAY)), ymd(now)]) {
    if (calls >= budget) break;
    const list = await apiFootball(`fixtures?date=${d}&timezone=${encodeURIComponent(TZ)}`);
    calls++;
    list.forEach(f => { if (f.league && LIGA_IDS.has(f.league.id) && FINISHED.has(f.fixture.status.short)) recentes.push(f.fixture.id); });
  }
  if (recentes.length) {
    const have = await idsGuardados(c, recentes);
    recentes.filter(id => !have.has(id)).forEach(add);
  }

  // 2) completar a temporada atual de cada liga; depois, a temporada anterior
  const plano = [...LIGAS.map(l => ({ id: l.id, s: seasonOf(l.id, now), atual: true })), ...LIGAS.map(l => ({ id: l.id, s: seasonOf(l.id, now) - 1, atual: false }))];
  for (const p of plano) {
    // só lista mais uma temporada se, depois dela, ainda sobrar requisição para os detalhes da fila
    if (calls + Math.ceil(fila.length / 20) + 1 >= budget) break;
    const chave = `lista:${p.id}:${p.s}`;
    const { data: ctl } = await sb(c, `coleta?chave=eq.${encodeURIComponent(chave)}&select=valor,atualizado_em`);
    const row = ctl && ctl[0];
    const idade = row ? Date.now() - Date.parse(row.atualizado_em) : Infinity;
    let ids;
    if (row && idade < (p.atual ? 20 * HOUR : 30 * DAY)) ids = (row.valor && row.valor.ids) || [];
    else {
      const list = await apiFootball(`fixtures?league=${p.id}&season=${p.s}&status=FT-AET-PEN&timezone=${encodeURIComponent(TZ)}`);
      calls++;
      ids = list.map(f => f.fixture.id);
      await sb(c, 'coleta', { method: 'POST', body: { chave, valor: { ids, n: ids.length }, atualizado_em: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal' });
    }
    if (!ids.length) continue;
    const have = new Set((await sbAll(c, `jogos?liga_id=eq.${p.id}&temporada=eq.${p.s}&select=fixture_id`)).map(r => Number(r.fixture_id)));
    ids.filter(id => !have.has(id)).forEach(add);
  }

  // 3) detalhes (estatísticas e eventos), 20 jogos por requisição
  while (fila.length && calls < budget) {
    const chunk = fila.splice(0, 20);
    const list = await apiFootball(`fixtures?ids=${chunk.join('-')}&timezone=${encodeURIComponent(TZ)}`);
    calls++;
    const rows = [];
    list.forEach(f => {
      if (!FINISHED.has(f.fixture.status.short)) return;
      const r = rowOf(f);
      // jogo recém-terminado ainda sem estatísticas: tenta de novo na próxima coleta
      if (!r.estatisticas && Date.now() - Date.parse(r.data) < 2 * DAY) { semEstat++; return; }
      rows.push(r);
    });
    if (rows.length) {
      await sb(c, 'jogos', { method: 'POST', body: rows, prefer: 'resolution=merge-duplicates,return=minimal' });
      salvos += rows.length;
    }
  }
  return send(res, 200, { ok: true, chamadas: calls, salvos, aguardando_estatisticas: semEstat, faltam: fila.length, restante: restante == null ? null : restante - calls });
}

/* ---------------- leituras públicas ---------------- */
const pois = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
function xPts(xh, xa) {
  let w = 0, d = 0, l = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const p = pois(xh, i) * pois(xa, j);
    if (i > j) w += p; else if (i === j) d += p; else l += p;
  }
  return [3 * w + d, 3 * l + d];
}
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

async function liga(c, q, res) {
  const id = int(q.id, 0);
  if (!LIGA_IDS.has(id)) return send(res, 400, { ok: false, error: 'Liga não acompanhada.' });
  const season = int(q.season, seasonOf(id));
  const rows = await sbAll(c, `jogos?liga_id=eq.${id}&temporada=eq.${season}&select=fixture_id,data,mandante_id,mandante,visitante_id,visitante,gols_casa,gols_fora,xg_casa,xg_fora,xg_fonte,chutes_casa,chutes_fora,posse_casa,posse_fora&order=data.asc`);
  const T = new Map();
  const team = (tid, nome) => {
    if (!T.has(tid)) T.set(tid, { id: tid, nome, j: 0, gf: 0, ga: 0, pts: 0, jx: 0, xgf: 0, xga: 0, xpts: 0, ptsx: 0, oficial: 0, casa: { jx: 0, xgf: 0, xga: 0 }, fora: { jx: 0, xgf: 0, xga: 0 }, ult: [] });
    return T.get(tid);
  };
  let comXg = 0, oficial = 0;
  rows.forEach(r => {
    const h = team(r.mandante_id, r.mandante), a = team(r.visitante_id, r.visitante);
    const gh = r.gols_casa, ga = r.gols_fora;
    if (gh == null || ga == null) return;
    const ph = gh > ga ? 3 : gh === ga ? 1 : 0, pa = ga > gh ? 3 : gh === ga ? 1 : 0;
    h.j++; a.j++; h.gf += gh; h.ga += ga; a.gf += ga; a.ga += gh; h.pts += ph; a.pts += pa;
    if (r.xg_casa != null && r.xg_fora != null) {
      const xh = Number(r.xg_casa), xa = Number(r.xg_fora);
      const [eh, ea] = xPts(xh, xa);
      comXg++; if (r.xg_fonte === 'xg') { oficial++; h.oficial++; a.oficial++; }
      h.jx++; a.jx++; h.xgf += xh; h.xga += xa; a.xgf += xa; a.xga += xh;
      h.xpts += eh; a.xpts += ea; h.ptsx += ph; a.ptsx += pa;
      h.casa.jx++; h.casa.xgf += xh; h.casa.xga += xa; a.fora.jx++; a.fora.xgf += xa; a.fora.xga += xh;
      h.ult.push([xh, xa]); a.ult.push([xa, xh]);
    }
  });
  const times = [...T.values()].map(t => {
    const u = t.ult.slice(-5);
    return {
      id: t.id, nome: t.nome, j: t.j, jx: t.jx, oficial: t.oficial,
      gf: t.gf, ga: t.ga, pts: t.pts,
      xgf: r1(t.xgf), xga: r1(t.xga), xpts: r1(t.xpts), ptsx: t.ptsx, dif: r1(t.ptsx - t.xpts),
      xgf_j: t.jx ? r2(t.xgf / t.jx) : null, xga_j: t.jx ? r2(t.xga / t.jx) : null,
      casa: t.casa.jx ? { jx: t.casa.jx, xgf_j: r2(t.casa.xgf / t.casa.jx), xga_j: r2(t.casa.xga / t.casa.jx) } : null,
      fora: t.fora.jx ? { jx: t.fora.jx, xgf_j: r2(t.fora.xgf / t.fora.jx), xga_j: r2(t.fora.xga / t.fora.jx) } : null,
      ult5: u.length ? { n: u.length, xgf_j: r2(u.reduce((s, x) => s + x[0], 0) / u.length), xga_j: r2(u.reduce((s, x) => s + x[1], 0) / u.length) } : null
    };
  }).sort((a, b) => b.xpts - a.xpts);
  return send(res, 200, { ok: true, liga: id, temporada: season, jogos: rows.length, comXg, oficial, times }, 'public, s-maxage=1800, stale-while-revalidate=3600');
}

async function arbitro(c, q, res) {
  const key = norm(refName(q.nome));
  if (!key || key.length < 3) return send(res, 400, { ok: false, error: 'Nome inválido.' });
  const rows = await sbAll(c, `jogos?arbitro_chave=eq.${encodeURIComponent(key)}&select=fixture_id,data,liga_id,liga_nome,pais,temporada,mandante,visitante,gols_casa,gols_fora,amarelos_casa,amarelos_fora,vermelhos_casa,vermelhos_fora,faltas_casa,faltas_fora,penaltis,var_revisoes&order=data.desc`, 2000);
  const n = rows.length;
  const tot = (list, f) => list.reduce((s, r) => s + f(r), 0);
  const withCards = rows.filter(r => r.amarelos_casa != null && r.amarelos_fora != null);
  const withFouls = rows.filter(r => r.faltas_casa != null && r.faltas_fora != null);
  const withPens = rows.filter(r => r.penaltis != null);
  const fin = rows.filter(r => r.gols_casa != null && r.gols_fora != null);
  const hw = fin.filter(r => r.gols_casa > r.gols_fora).length, dr = fin.filter(r => r.gols_casa === r.gols_fora).length;
  const lg = new Map();
  rows.forEach(r => { const k = r.liga_id; const o = lg.get(k) || { id: k, nome: r.liga_nome, pais: r.pais, n: 0 }; o.n++; lg.set(k, o); });
  const am = withCards.length ? tot(withCards, r => r.amarelos_casa + r.amarelos_fora) : null;
  const vm = withCards.length ? tot(withCards, r => (r.vermelhos_casa || 0) + (r.vermelhos_fora || 0)) : null;
  return send(res, 200, {
    ok: true, chave: key, n,
    cartoes: { jogos: withCards.length, amarelos: am, amarelos_j: withCards.length ? r2(am / withCards.length) : null, vermelhos: vm, vermelhos_j: withCards.length ? r2(vm / withCards.length) : null,
      amarelos_casa_j: withCards.length ? r2(tot(withCards, r => r.amarelos_casa) / withCards.length) : null, amarelos_fora_j: withCards.length ? r2(tot(withCards, r => r.amarelos_fora) / withCards.length) : null },
    faltas_j: withFouls.length ? r1(tot(withFouls, r => r.faltas_casa + r.faltas_fora) / withFouls.length) : null,
    penaltis: { jogos: withPens.length, total: withPens.length ? tot(withPens, r => r.penaltis) : null, por_jogo: withPens.length ? r2(tot(withPens, r => r.penaltis) / withPens.length) : null },
    resultados: { n: fin.length, casa: hw, empate: dr, fora: fin.length - hw - dr, gols_j: fin.length ? r2(tot(fin, r => r.gols_casa + r.gols_fora) / fin.length) : null },
    ligas: [...lg.values()].sort((a, b) => b.n - a.n),
    ultimos: rows.slice(0, 8).map(r => ({ data: r.data, liga: r.liga_nome, mandante: r.mandante, visitante: r.visitante, gols: [r.gols_casa, r.gols_fora], amarelos: r.amarelos_casa == null ? null : r.amarelos_casa + r.amarelos_fora, vermelhos: r.vermelhos_casa == null ? null : (r.vermelhos_casa || 0) + (r.vermelhos_fora || 0), penaltis: r.penaltis }))
  }, 'public, s-maxage=21600, stale-while-revalidate=43200');
}

async function h2h(c, q, res) {
  const a = int(q.a, 0), b = int(q.b, 0);
  if (!a || !b || a === b) return send(res, 400, { ok: false, error: 'Times inválidos.' });
  const { data } = await sb(c, `jogos?or=(and(mandante_id.eq.${a},visitante_id.eq.${b}),and(mandante_id.eq.${b},visitante_id.eq.${a}))&select=fixture_id,data,liga_nome,mandante_id,mandante,visitante,gols_casa,gols_fora,xg_casa,xg_fora,xg_fonte,chutes_casa,chutes_fora,chutes_gol_casa,chutes_gol_fora,posse_casa,posse_fora,escanteios_casa,escanteios_fora,amarelos_casa,amarelos_fora,vermelhos_casa,vermelhos_fora&order=data.desc&limit=30`);
  const rows = data || [];
  const acc = { xg: [0, 0, 0], chutes: [0, 0, 0], gol: [0, 0, 0], posse: [0, 0, 0], esc: [0, 0, 0], cart: [0, 0, 0] };
  const put = (k, va, vb) => { if (va == null || vb == null) return; acc[k][0] += Number(va); acc[k][1] += Number(vb); acc[k][2]++; };
  let wa = 0, wb = 0, dr = 0, ga = 0, gb = 0;
  const jogos = rows.map(r => {
    const aHome = r.mandante_id === a;
    const sA = aHome ? 'casa' : 'fora', sB = aHome ? 'fora' : 'casa';
    const A = r['gols_' + sA], B = r['gols_' + sB];
    if (A != null && B != null) { ga += A; gb += B; if (A > B) wa++; else if (B > A) wb++; else dr++; }
    put('xg', r['xg_' + sA], r['xg_' + sB]);
    put('chutes', r['chutes_' + sA], r['chutes_' + sB]);
    put('gol', r['chutes_gol_' + sA], r['chutes_gol_' + sB]);
    put('posse', r['posse_' + sA], r['posse_' + sB]);
    put('esc', r['escanteios_' + sA], r['escanteios_' + sB]);
    if (r.amarelos_casa != null) put('cart', r['amarelos_' + sA] + 2 * (r['vermelhos_' + sA] || 0), r['amarelos_' + sB] + 2 * (r['vermelhos_' + sB] || 0));
    return { data: r.data, liga: r.liga_nome, mandante: r.mandante, visitante: r.visitante, gols: [r.gols_casa, r.gols_fora], xg: r.xg_casa == null ? null : [Number(r.xg_casa), Number(r.xg_fora)], xg_fonte: r.xg_fonte };
  });
  const media = k => (acc[k][2] ? { n: acc[k][2], a: r2(acc[k][0] / acc[k][2]), b: r2(acc[k][1] / acc[k][2]) } : null);
  return send(res, 200, {
    ok: true, a, b, n: rows.length, vitorias_a: wa, vitorias_b: wb, empates: dr, gols_a: ga, gols_b: gb,
    medias: { xg: media('xg'), chutes: media('chutes'), chutes_gol: media('gol'), posse: media('posse'), escanteios: media('esc'), cartoes: media('cart') },
    jogos
  }, 'public, s-maxage=21600, stale-while-revalidate=43200');
}

async function resumo(c, q, res) {
  const out = [];
  for (const l of LIGAS) {
    const s = seasonOf(l.id);
    const { headers } = await sb(c, `jogos?liga_id=eq.${l.id}&temporada=eq.${s}&select=fixture_id`, { prefer: 'count=exact', range: '0-0' });
    const guardados = parseInt(String(headers.get('content-range') || '').split('/')[1], 10) || 0;
    const { data } = await sb(c, `coleta?chave=eq.lista:${l.id}:${s}&select=valor`);
    const encerrados = data && data[0] && data[0].valor ? data[0].valor.n : null;
    out.push({ liga: l.id, temporada: s, guardados, encerrados });
  }
  return send(res, 200, { ok: true, ligas: out }, 'public, s-maxage=600');
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const acao = String(q.acao || '');
  const c = cfg();
  if (!c) return send(res, 200, { ok: false, configurado: false, error: 'Supabase não configurado.' }, 'public, s-maxage=60');
  try {
    if (acao === 'coletar') return await coletar(c, req, res);
    if (acao === 'liga') return await liga(c, q, res);
    if (acao === 'arbitro') return await arbitro(c, q, res);
    if (acao === 'h2h') return await h2h(c, q, res);
    if (acao === 'resumo') return await resumo(c, q, res);
    return send(res, 400, { ok: false, error: 'Ação desconhecida.' });
  } catch (e) {
    return send(res, 500, { ok: false, error: String((e && e.message) || e).slice(0, 300) });
  }
};

module.exports._test = { rowOf, xPts, seasonOf, ymd };
