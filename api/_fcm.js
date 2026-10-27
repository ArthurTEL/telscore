// TEL.SCORE · envio de notificações pelo Firebase Cloud Messaging (FCM, API HTTP v1).
// Serve para os três lugares: app de Android, app de iPhone e navegador (Web Push).
//
// Variável de ambiente (Vercel → Settings → Environment Variables), nunca no código nem no chat:
//   FCM_SA   conteúdo do arquivo JSON da "conta de serviço" do Firebase
//            (Firebase → Configurações do projeto → Contas de serviço → Gerar nova chave privada).
//            Pode colar o JSON inteiro ou o mesmo JSON em base64.

const crypto = require('crypto');

const SITE = (process.env.SITE_URL || 'https://www.telscore.com.br').replace(/\/+$/, '');

// tipos de aviso que a pessoa pode escolher (o site mostra a mesma lista)
const TIPOS = ['gol', 'var', 'vermelho', 'penalti', 'inicio', 'intervalo', 'fim', 'escalacao', 'lembrete', 'amarelo', 'substituicao'];
const TIPOS_PADRAO = ['gol', 'var', 'vermelho', 'penalti', 'inicio', 'intervalo', 'fim', 'escalacao', 'lembrete'];

function limpaAvisos(a) {
  a = a && typeof a === 'object' ? a : {};
  const tipos = Array.isArray(a.tipos) ? [...new Set(a.tipos.map(String).filter(t => TIPOS.includes(t)))] : TIPOS_PADRAO.slice();
  return { on: a.on === true, tipos, ligas: a.ligas === true };
}

function contaServico() {
  const raw = (process.env.FCM_SA || '').trim();
  if (!raw) return null;
  let j = null;
  try { j = JSON.parse(raw); } catch (e) {
    try { j = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch (e2) { j = null; }
  }
  if (!j || !j.client_email || !j.private_key || !j.project_id) return null;
  return { ...j, private_key: String(j.private_key).replace(/\\n/g, '\n') };
}

const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
let TOK = null;
async function tokenAcesso(S) {
  if (TOK && TOK.email === S.client_email && TOK.exp > Date.now() + 60000) return TOK.t;
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify({ iss: S.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(h + '.' + p).sign(S.private_key);
  const jwt = `${h}.${p}.${b64u(sig)}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error('FCM: não foi possível autenticar (' + (j.error || r.status) + ').');
  TOK = { t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000, email: S.client_email };
  return TOK.t;
}

// n = { title, body, fixture, tipo, tag }
function mensagem(token, n) {
  const url = n.fixture ? `/#jogo-${n.fixture}` : '/';
  return {
    token,
    notification: { title: n.title, body: n.body },
    data: { fixture: String(n.fixture || ''), tipo: String(n.tipo || ''), url },
    android: { priority: 'HIGH', notification: { channel_id: 'jogos', sound: 'default', color: '#E5283A', ...(n.tag ? { tag: n.tag } : {}) } },
    apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default', 'thread-id': n.fixture ? `jogo-${n.fixture}` : 'telscore' } } },
    webpush: {
      headers: { Urgency: 'high' },
      notification: { icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', ...(n.tag ? { tag: n.tag, renotify: true } : {}) },
      fcm_options: { link: SITE + url }
    }
  };
}

async function enviaUm(S, at, msg) {
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${S.project_id}/messages:send`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg })
  });
  if (r.ok) return { ok: true };
  const t = await r.text().catch(() => '');
  // token velho ou apagado: o celular desinstalou o app ou tirou a permissão
  const morto = r.status === 404 || /UNREGISTERED|registration-token-not-registered|not a valid FCM registration token|Requested entity was not found/i.test(t);
  return { ok: false, morto, status: r.status, erro: t.slice(0, 160) };
}

// lista = [{ token, n }]; devolve quantos foram e quais tokens morreram
async function enviaVarios(lista) {
  const S = contaServico();
  if (!S) return { ok: false, motivo: 'FCM_SA não configurada.', enviados: 0, mortos: [], erros: [] };
  if (!lista.length) return { ok: true, enviados: 0, mortos: [], erros: [] };
  const at = await tokenAcesso(S);
  let enviados = 0; const mortos = [], erros = [];
  for (let i = 0; i < lista.length; i += 10) {
    const parte = lista.slice(i, i + 10);
    const rs = await Promise.all(parte.map(x => enviaUm(S, at, mensagem(x.token, x.n)).catch(e => ({ ok: false, erro: String(e && e.message || e) }))));
    rs.forEach((r, k) => { if (r.ok) enviados++; else if (r.morto) mortos.push(parte[k].token); else erros.push(r.erro || r.status); });
  }
  return { ok: true, enviados, mortos: [...new Set(mortos)], erros: erros.slice(0, 5) };
}

module.exports = { SITE, TIPOS, TIPOS_PADRAO, limpaAvisos, contaServico, mensagem, enviaVarios, _test: { b64u } };
