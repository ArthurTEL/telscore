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
  odds: ['fixture', 'bookmaker', 'bet'],
  teams: ['id', 'search'],
  'players/squads': ['team'],
  'teams/statistics': ['league', 'season', 'team'],
  players: ['team', 'season', 'page'],
  'players/topscorers': ['league', 'season'],
  'players/topassists': ['league', 'season'],
  'players/topyellowcards': ['league', 'season']
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
    // ao vivo: a API-Football atualiza os jogos a cada ~15 s; com o plano Pro dá para acompanhar nesse ritmo
    const liveTTL = toInt(process.env.CACHE_LIVE_SECONDS, 15);
    let anyLiveResp = false;
    let ttl = 600;
    if (errors) ttl = 30;
    else if (endpoint === 'status') ttl = 60;
    else if (endpoint === 'standings') ttl = 3600;
    else if (endpoint === 'predictions') ttl = 3600;
    else if (endpoint === 'odds') ttl = 3600;
    else if (endpoint === 'injuries') ttl = 1800;
    else if (endpoint === 'fixtures/headtohead') ttl = 21600;
    else if (endpoint === 'teams') ttl = 604800;
    else if (endpoint === 'players/squads') ttl = 86400;
    else if (endpoint === 'teams/statistics') ttl = 21600;
    else if (endpoint === 'players') ttl = 43200;
    else if (/^players\/top/.test(endpoint)) ttl = 21600;
    else if (endpoint === 'fixtures') {
      const list = Array.isArray(response) ? response : [];
      const anyLive = list.some(f => f.fixture && f.fixture.status && LIVE.has(f.fixture.status.short));
      anyLiveResp = anyLive;
      if (anyLive) ttl = liveTTL;
      else if (q.ids) {
        ttl = list.length && list.every(f => f.fixture && FINISHED.has(f.fixture.status.short)) ? 86400 : 600;
      } else if (q.team && q.last) ttl = 1800;
      else if (q.team && q.next) ttl = 3600;
      else if (q.id) {
        const s = list[0] && list[0].fixture && list[0].fixture.status.short;
        const kick = list[0] && list[0].fixture && Date.parse(list[0].fixture.date);
        // jogo prestes a começar: confere de minuto em minuto para pegar o apito inicial
        ttl = FINISHED.has(s) ? 86400 : Number.isFinite(kick) && kick - Date.now() < 2 * 3600 * 1000 ? 60 : 600;
      } else if (q.league && q.season) {
        // temporada inteira: com jogo começando ou recém-terminado, renova em 2 min; senão de hora em hora
        const now = Date.now();
        const soon = list.some(f => f.fixture && f.fixture.status && !FINISHED.has(f.fixture.status.short) && Math.abs(Date.parse(f.fixture.date) - now) < 3 * 3600 * 1000);
        ttl = soon ? 120 : 3600;
      }
      else if (q.date) {
        // "hoje" no fuso pedido pelo site (Brasília), não em UTC: depois das 21h o dia UTC já virou
        let today;
        try { today = new Intl.DateTimeFormat('en-CA', { timeZone: String(q.timezone || 'America/Sao_Paulo'), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
        catch (e) { today = new Date().toISOString().slice(0, 10); }
        // algum jogo começando ou recém-terminado na lista: confere de minuto em minuto
        const now = Date.now();
        const soon = list.some(f => f.fixture && f.fixture.status && !FINISHED.has(f.fixture.status.short) && !['PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(f.fixture.status.short) && Math.abs(Date.parse(f.fixture.date) - now) < 3 * 3600 * 1000);
        ttl = soon ? 60 : q.date < today ? 21600 : q.date === today ? 60 : 1800;
      }
    }

    // ao vivo, a cópia velha só pode ser servida por poucos segundos enquanto a nova chega
    const swr = anyLiveResp ? 5 : Math.min(ttl * 2, 600);
    res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=${swr}`);
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
