// TEL.SCORE · placar de acertos (função de servidor da Vercel)
//
// Guarda no Supabase cada análise TEL.SCORE gerada ANTES do início de um jogo e,
// depois do apito final, confere com o resultado real.
//
//   GET  /api/acertos?acao=placar     → resumo público do placar de acertos
//   POST /api/acertos?acao=registrar  → o site registra uma análise pré-jogo
//   GET  /api/acertos?acao=conferir   → tarefa agendada (cron da Vercel) que confere os resultados
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables), nunca no código:
//   SUPABASE_URL         endereço do projeto (https://xxxx.supabase.co)
//   SUPABASE_SECRET_KEY  chave secreta do Supabase (sb_secret_...), só fica no servidor
//   CRON_SECRET          senha que a Vercel manda junto quando roda a tarefa agendada
//   API_FOOTBALL_KEY     a mesma chave que o site já usa

const API = 'https://v3.football.api-sports.io';
const FINISHED = new Set(['FT', 'AET', 'PEN']);
const VOID = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO']);
const NOT_STARTED = new Set(['NS', 'TBD']);
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

// Limites que transformam probabilidade em previsão (os mesmos textos que o site mostra)
const GOLS_MAIS = 58, GOLS_MENOS = 42;   // "mais de 2,5" / "menos de 2,5"; no meio é "jogo no limite"
const BTTS_SIM = 55, BTTS_NAO = 40;      // "os dois marcam" provável / pouco provável

function cfg() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return url && key ? { url, key } : null;
}

// Chamada à API REST do Supabase. Chaves novas (sb_secret_...) vão só no cabeçalho apikey;
// a chave antiga (service_role, formato JWT) também precisa do Authorization.
async function sb(c, path, { method = 'GET', body, prefer, range } = {}) {
  const headers = { apikey: c.key, 'Content-Type': 'application/json' };
  if (!c.key.startsWith('sb_')) headers.Authorization = 'Bearer ' + c.key;
  if (prefer) headers.Prefer = prefer;
  if (range) headers.Range = range;
  const r = await fetch(`${c.url}/rest/v1/${path}`, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) {
    const err = new Error(`Supabase ${r.status}: ${text.slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  return { data: text ? JSON.parse(text) : null, headers: r.headers };
}

const int = (v, lo, hi) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};
const txt = (v, n = 60) => (v == null ? null : String(v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) || null);
const favOf = (h, d, a) => (h >= d && h >= a ? 'h' : a >= d && a > h ? 'a' : 'd');
const sideOf = (gh, ga) => (gh > ga ? 'h' : gh < ga ? 'a' : 'd');

function send(res, code, obj, cache) {
  res.setHeader('Cache-Control', cache || 'no-store');
  res.status(code).json(obj);
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return null; }
  }
  return null;
}

/* ---------------- registrar ---------------- */
async function registrar(c, req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Use POST.' });
  const b = readBody(req);
  if (!b) return send(res, 400, { ok: false, error: 'Corpo inválido.' });

  const fixture = int(b.fixture_id, 1, 1e10);
  const inicio = Date.parse(b.inicio);
  const now = Date.now();
  const ph = int(b.p_casa, 0, 100), pd = int(b.p_empate, 0, 100), pa = int(b.p_fora, 0, 100);
  if (!fixture || !Number.isFinite(inicio)) return send(res, 400, { ok: false, error: 'Jogo inválido.' });
  // só vale análise feita antes do jogo (com folga de 1 min) e para os próximos dias
  if (inicio < now + MIN) return send(res, 200, { ok: false, motivo: 'jogo já começou' });
  if (inicio > now + 10 * DAY) return send(res, 200, { ok: false, motivo: 'jogo distante demais' });
  if (ph == null || pd == null || pa == null || Math.abs(ph + pd + pa - 100) > 2) return send(res, 400, { ok: false, error: 'Probabilidades inválidas.' });
  const placar = typeof b.placar_prev === 'string' && /^\d{1,2}-\d{1,2}$/.test(b.placar_prev) ? b.placar_prev : null;
  const gols = Number(b.gols_esperados);

  const row = {
    fixture_id: fixture,
    inicio: new Date(inicio).toISOString(),
    liga_id: int(b.liga_id, 0, 1e7),
    liga_nome: txt(b.liga_nome),
    pais: txt(b.pais, 40),
    temporada: int(b.temporada, 1900, 2200),
    rodada: txt(b.rodada),
    mandante_id: int(b.mandante_id, 0, 1e8),
    mandante: txt(b.mandante),
    visitante_id: int(b.visitante_id, 0, 1e8),
    visitante: txt(b.visitante),
    p_casa: ph,
    p_empate: pd,
    p_fora: pa,
    palpite: favOf(ph, pd, pa), // calculado aqui, não confia no navegador
    placar_prev: placar,
    over25: int(b.over25, 0, 100),
    btts: int(b.btts, 0, 100),
    gols_esperados: Number.isFinite(gols) && gols >= 0 && gols < 15 ? Math.round(gols * 100) / 100 : null,
    fonte: txt(b.fonte, 20),
    versao: txt(b.versao, 20)
  };
  if (!row.mandante_id || !row.visitante_id) return send(res, 400, { ok: false, error: 'Times inválidos.' });

  // a primeira análise do jogo é a que vale: se já existe, nada muda
  await sb(c, 'previsoes', { method: 'POST', body: row, prefer: 'resolution=ignore-duplicates,return=minimal' });
  return send(res, 200, { ok: true });
}

/* ---------------- conferir (tarefa agendada) ---------------- */
async function apiFootball(path) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY não configurada.');
  const r = await fetch(`${API}/${path}`, { headers: { 'x-apisports-key': key } });
  const j = await r.json();
  const errs = j && j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length);
  if (errs) throw new Error('API-Football: ' + JSON.stringify(j.errors).slice(0, 200));
  return (j && j.response) || [];
}

function avaliar(row, f) {
  const st = f.fixture && f.fixture.status ? f.fixture.status.short : '';
  const kick = Date.parse(f.fixture.date);
  const now = Date.now();
  const sameTeams = f.teams && f.teams.home && f.teams.away && f.teams.home.id === row.mandante_id && f.teams.away.id === row.visitante_id;
  if (!sameTeams) return { status: 'anulado', motivo: 'times não conferem', conferido_em: new Date().toISOString() };
  if (VOID.has(st)) return { status: 'anulado', motivo: 'jogo adiado ou cancelado', conferido_em: new Date().toISOString() };
  if (NOT_STARTED.has(st)) {
    if (Number.isFinite(kick) && kick > now && new Date(kick).toISOString() !== new Date(row.inicio).toISOString()) return { inicio: new Date(kick).toISOString() };
    if (now - Date.parse(row.inicio) > 7 * DAY) return { status: 'anulado', motivo: 'jogo sem resultado', conferido_em: new Date().toISOString() };
    return null;
  }
  if (!FINISHED.has(st)) return null; // ainda em andamento
  if (Number.isFinite(kick) && Date.parse(row.criado_em) >= kick) {
    return { status: 'anulado', motivo: 'análise registrada depois do início', conferido_em: new Date().toISOString() };
  }
  // resultado dos 90 minutos (prorrogação e pênaltis não contam para a previsão do jogo)
  const ft = f.score && f.score.fulltime && f.score.fulltime.home != null ? f.score.fulltime : f.goals;
  const gh = ft.home, ga = ft.away;
  if (gh == null || ga == null) return null;
  const res = sideOf(gh, ga);
  const tot = gh + ga;
  const out = {
    status: 'conferido',
    gols_casa: gh,
    gols_fora: ga,
    resultado: res,
    acertou_resultado: res === row.palpite,
    acertou_placar: row.placar_prev ? row.placar_prev === `${gh}-${ga}` : null,
    acertou_gols: null,
    acertou_btts: null,
    conferido_em: new Date().toISOString()
  };
  if (row.over25 != null) {
    if (row.over25 >= GOLS_MAIS) out.acertou_gols = tot >= 3;
    else if (row.over25 <= GOLS_MENOS) out.acertou_gols = tot <= 2;
  }
  if (row.btts != null) {
    const ambos = gh > 0 && ga > 0;
    if (row.btts >= BTTS_SIM) out.acertou_btts = ambos;
    else if (row.btts <= BTTS_NAO) out.acertou_btts = !ambos;
  }
  return out;
}

async function conferir(c, req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = String(req.headers && (req.headers.authorization || req.headers.Authorization) || '');
  if (!secret || auth !== `Bearer ${secret}`) return send(res, 401, { ok: false, error: 'Não autorizado.' });

  const limite = new Date(Date.now() - 150 * MIN).toISOString(); // começou há mais de 2h30
  const { data: pend } = await sb(c, `previsoes?status=eq.pendente&inicio=lt.${encodeURIComponent(limite)}&select=fixture_id,inicio,criado_em,mandante_id,visitante_id,palpite,placar_prev,over25,btts&order=inicio.asc&limit=100`);
  const rows = pend || [];
  let chamadas = 0, conferidos = 0, anulados = 0, adiados = 0;
  for (let i = 0; i < rows.length; i += 20) {
    const chunk = rows.slice(i, i + 20);
    let list;
    try {
      list = await apiFootball(`fixtures?ids=${chunk.map(r => r.fixture_id).join('-')}`);
      chamadas++;
    } catch (e) {
      return send(res, 502, { ok: false, error: e.message, conferidos, anulados, chamadas });
    }
    const byId = new Map(list.map(f => [f.fixture.id, f]));
    await Promise.all(chunk.map(async row => {
      const f = byId.get(row.fixture_id);
      let upd;
      if (!f) upd = Date.now() - Date.parse(row.inicio) > 7 * DAY ? { status: 'anulado', motivo: 'jogo não encontrado', conferido_em: new Date().toISOString() } : null;
      else upd = avaliar(row, f);
      if (!upd) return;
      await sb(c, `previsoes?fixture_id=eq.${row.fixture_id}&status=eq.pendente`, { method: 'PATCH', body: upd, prefer: 'return=minimal' });
      if (upd.status === 'conferido') conferidos++;
      else if (upd.status === 'anulado') anulados++;
      else adiados++;
    }));
  }
  return send(res, 200, { ok: true, analisados: rows.length, conferidos, anulados, remarcados: adiados, chamadas });
}

/* ---------------- placar (público) ---------------- */
const pctOf = (h, n) => (n ? Math.round((h / n) * 100) : null);
function bloco(list, key) {
  const v = list.filter(r => r[key] != null);
  const h = v.filter(r => r[key] === true).length;
  return { n: v.length, acertos: h, pct: pctOf(h, v.length) };
}

function resumo(rows, pendentes) {
  const conf = (r) => Math.max(r.p_casa, r.p_empate, r.p_fora);
  const now = Date.now();
  const faixas = [
    { id: 'claro', nome: 'Favorito claro', de: 65, ate: 101 },
    { id: 'favorito', nome: 'Favorito', de: 50, ate: 65 },
    { id: 'equilibrado', nome: 'Jogo equilibrado', de: 0, ate: 50 }
  ].map(f => {
    const l = rows.filter(r => conf(r) >= f.de && conf(r) < f.ate);
    const h = l.filter(r => r.acertou_resultado).length;
    const esperado = l.length ? Math.round(l.reduce((s, r) => s + conf(r), 0) / l.length) : null;
    return { id: f.id, nome: f.nome, de: f.de, ate: Math.min(f.ate, 100), n: l.length, acertos: h, pct: pctOf(h, l.length), esperado };
  });

  const lg = new Map();
  rows.forEach(r => {
    const k = r.liga_id || 0;
    const o = lg.get(k) || { id: k, nome: r.liga_nome || 'Outras', pais: r.pais || '', n: 0, acertos: 0 };
    o.n++;
    if (r.acertou_resultado) o.acertos++;
    lg.set(k, o);
  });
  const ligas = [...lg.values()].map(o => ({ ...o, pct: pctOf(o.acertos, o.n) })).sort((a, b) => b.n - a.n || b.pct - a.pct).slice(0, 15);

  const sete = rows.filter(r => now - Date.parse(r.inicio) <= 7 * DAY);
  const ultimos = rows.slice(0, 20).map(r => ({
    id: r.fixture_id, inicio: r.inicio, liga: r.liga_nome, mandante: r.mandante, visitante: r.visitante,
    p: [r.p_casa, r.p_empate, r.p_fora], palpite: r.palpite, placar_prev: r.placar_prev,
    gols: [r.gols_casa, r.gols_fora], acertou: r.acertou_resultado, placar_exato: r.acertou_placar
  }));

  // sequência atual de acertos do resultado
  let seq = 0;
  for (const r of rows) { if (r.acertou_resultado) seq++; else break; }

  return {
    ok: true,
    configurado: true,
    atualizado: new Date().toISOString(),
    total: rows.length,
    pendentes,
    resultado: bloco(rows, 'acertou_resultado'),
    gols: bloco(rows, 'acertou_gols'),
    btts: bloco(rows, 'acertou_btts'),
    placar: bloco(rows, 'acertou_placar'),
    semana: bloco(sete, 'acertou_resultado'),
    sequencia: seq,
    faixas,
    ligas,
    ultimos
  };
}

async function placar(c, req, res) {
  const cols = 'fixture_id,inicio,liga_id,liga_nome,pais,mandante,visitante,p_casa,p_empate,p_fora,palpite,placar_prev,gols_casa,gols_fora,acertou_resultado,acertou_gols,acertou_btts,acertou_placar';
  const rows = [];
  for (let off = 0; off < 20000; off += 1000) {
    const { data } = await sb(c, `previsoes?status=eq.conferido&select=${cols}&order=inicio.desc&limit=1000&offset=${off}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  let pendentes = 0;
  try {
    const { headers } = await sb(c, 'previsoes?status=eq.pendente&select=fixture_id', { prefer: 'count=exact', range: '0-0' });
    const cr = headers.get('content-range') || '';
    pendentes = parseInt(cr.split('/')[1], 10) || 0;
  } catch (e) { pendentes = 0; }
  return send(res, 200, resumo(rows, pendentes), 'public, s-maxage=300, stale-while-revalidate=600');
}

module.exports = async (req, res) => {
  const acao = String((req.query && req.query.acao) || 'placar');
  const c = cfg();
  if (!c) {
    return send(res, 200, { ok: false, configurado: false, error: 'Supabase não configurado. Adicione SUPABASE_URL e SUPABASE_SECRET_KEY na Vercel.' }, 'public, s-maxage=60');
  }
  try {
    if (acao === 'registrar') return await registrar(c, req, res);
    if (acao === 'conferir') return await conferir(c, req, res);
    if (acao === 'placar') return await placar(c, req, res);
    return send(res, 400, { ok: false, error: 'Ação desconhecida.' });
  } catch (e) {
    return send(res, 500, { ok: false, error: String(e && e.message || e).slice(0, 300) });
  }
};

module.exports._test = { avaliar, resumo, favOf };
