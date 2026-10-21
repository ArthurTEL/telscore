// TEL.SCORE · funções comuns do banco (Supabase) e da API-Football.
// Arquivos que começam com "_" dentro de /api não viram endereço público na Vercel.

const API = 'https://v3.football.api-sports.io';

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

// lê todas as linhas de uma consulta, de 1000 em 1000 (limite padrão do Supabase)
async function sbAll(c, path, max = 20000) {
  const out = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let off = 0; off < max; off += 1000) {
    const { data } = await sb(c, `${path}${sep}limit=1000&offset=${off}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function apiFootball(path) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY não configurada.');
  const r = await fetch(`${API}/${path}`, { headers: { 'x-apisports-key': key } });
  const j = await r.json();
  const errs = j && j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length);
  if (errs) throw new Error('API-Football: ' + JSON.stringify(j.errors).slice(0, 200));
  return (j && j.response) || [];
}

// mesmo jeito do site de normalizar nomes (árbitros)
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const refName = raw => String(raw || '').split(',')[0].trim();

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

function cronOk(req) {
  const secret = process.env.CRON_SECRET;
  const auth = String((req.headers && (req.headers.authorization || req.headers.Authorization)) || '');
  return !!secret && auth === `Bearer ${secret}`;
}

module.exports = { API, cfg, sb, sbAll, apiFootball, norm, refName, send, readBody, cronOk };
