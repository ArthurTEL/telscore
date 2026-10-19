// TEL.SCORE · função de servidor (Vercel)
// Repassa os pedidos do site para a API-Football sem expor a chave no navegador.
// A chave fica na variável de ambiente API_FOOTBALL_KEY, configurada na Vercel.

const BASE = 'https://v3.football.api-sports.io';

// Só estes endpoints e parâmetros podem ser chamados pelo site.
const ALLOWED = {
  status: [],
  fixtures: ['date', 'id', 'ids', 'live', 'league', 'season', 'timezone', 'from', 'to', 'status', 'round', 'team', 'last', 'next'],
  predictions: ['fixture'],
  injuries: ['fixture', 'team', 'season', 'date'],
  standings: ['league', 'season'],
  'fixtures/headtohead': ['h2h', 'last', 'timezone'],
  odds: ['fixture', 'bookmaker', 'bet']
};

const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP']);
const FINISHED = new Set(['FT', 'AET', 'PEN']);

const toInt = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

function countErrors(errors) {
  if (!errors) return 0;
  return Array.isArray(errors) ? errors.length : Object.keys(errors).length;
}

module.exports = async (req, res) => {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({
      ok: false,
      error: 'Chave da API não configurada. Adicione API_FOOTBALL_KEY em Settings → Environment Variables na Vercel e faça um novo deploy.'
    });
    return;
  }

  const q = req.query || {};
  const endpoint = String(q.endpoint || '');
  if (!Object.prototype.hasOwnProperty.call(ALLOWED, endpoint)) {
    res.status(400).json({ ok: false, error: 'Endpoint não permitido.' });
    return;
  }

  const params = new URLSearchParams();
  for (const name of ALLOWED[endpoint]) {
    if (q[name] != null && q[name] !== '') params.set(name, String(q[name]).slice(0, 60));
  }
  const url = `${BASE}/${endpoint}${params.toString() ? '?' + params.toString() : ''}`;

  try {
    const upstream = await fetch(url, { headers: { 'x-apisports-key': key } });
    const data = await upstream.json();
    const errors = countErrors(data && data.errors) ? data.errors : null;
    let response = data ? data.response : null;

    // Filtra as ligas acompanhadas aqui no servidor, para a resposta chegar leve ao navegador.
    if (endpoint === 'fixtures' && q.leagues && Array.isArray(response)) {
      const wanted = new Set(String(q.leagues).split(',').map(s => s.trim()));
      response = response.filter(f => f.league && wanted.has(String(f.league.id)));
    }

    // Cache na rede da Vercel: todos os visitantes compartilham a mesma resposta,
    // então a API só é chamada de novo quando o tempo abaixo expira.
    const liveTTL = toInt(process.env.CACHE_LIVE_SECONDS, 120);
    let ttl = 600;
    if (errors) ttl = 30;
    else if (endpoint === 'status') ttl = 60;
    else if (endpoint === 'standings') ttl = 3600;
    else if (endpoint === 'predictions') ttl = 3600;
    else if (endpoint === 'odds') ttl = 3600;
    else if (endpoint === 'injuries') ttl = 1800;
    else if (endpoint === 'fixtures/headtohead') ttl = 21600;
    else if (endpoint === 'fixtures') {
      const list = Array.isArray(response) ? response : [];
      const anyLive = list.some(f => f.fixture && f.fixture.status && LIVE.has(f.fixture.status.short));
      if (anyLive) ttl = liveTTL;
      else if (q.ids) {
        ttl = list.length && list.every(f => f.fixture && FINISHED.has(f.fixture.status.short)) ? 86400 : 600;
      } else if (q.team && q.last) ttl = 1800;
      else if (q.id) {
        const s = list[0] && list[0].fixture && list[0].fixture.status.short;
        ttl = FINISHED.has(s) ? 86400 : 600;
      } else if (q.league && q.season) ttl = 43200;
      else if (q.date) {
        const today = new Date().toISOString().slice(0, 10);
        ttl = q.date < today ? 21600 : q.date === today ? 300 : 1800;
      }
    }

    res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=${Math.min(ttl * 2, 600)}`);
    res.status(200).json({
      ok: !errors,
      errors,
      results: Array.isArray(response) ? response.length : response ? 1 : 0,
      response
    });
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ ok: false, error: 'Não foi possível falar com a API-Football agora. Tente de novo em instantes.' });
  }
};
