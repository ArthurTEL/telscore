// TEL.SCORE · contas e favoritos (parte 5)
//
//   GET  /api/conta?acao=config            → o login está ligado? (variável LOGIN_ATIVO)
//   POST /api/conta?acao=codigo  {email}   → manda o código de acesso por e-mail
//   POST /api/conta?acao=entrar  {email, codigo} → confere o código e abre a sessão
//   POST /api/conta?acao=renovar {refresh_token} → renova a sessão (o acesso vale 1 hora)
//   GET  /api/conta?acao=perfil            → favoritos da pessoa (cabeçalho Authorization: Bearer <token>)
//   POST /api/conta?acao=salvar  {times, ligas} → guarda os favoritos
//   POST /api/conta?acao=sair              → encerra a sessão
//   POST /api/conta?acao=dispositivo {token, plataforma} → cadastra o celular/navegador para receber avisos
//   POST /api/conta?acao=dispositivo_sair {token}        → descadastra (ao sair da conta)
//   POST /api/conta?acao=teste_aviso       → manda uma notificação de teste para os aparelhos da pessoa
//   POST /api/conta?acao=excluir {confirmar:'EXCLUIR'} → apaga a conta, os favoritos e os aparelhos (exigência da Apple e do Google)
//
// Conta de revisão das lojas (Apple e Google precisam entrar no app para aprovar):
//   REVISAO_EMAIL e REVISAO_CODIGO (variáveis da Vercel). Só esse e-mail entra com esse código fixo,
//   sem e-mail de verdade. Sem as duas variáveis, essa entrada não existe.
//
// O login usa o Supabase Auth (e-mail com código, sem senha). A chave secreta do Supabase
// fica só nas variáveis da Vercel; o navegador nunca recebe essa chave.

const { cfg, sb, send, readBody } = require('./_db');
const { limpaAvisos, enviaVarios } = require('./_fcm');

const EMAIL = /^[^\s@<>()",;]{1,64}@[^\s@<>()",;]{1,190}\.[a-z]{2,24}$/i;
const LOGO = /^https:\/\/media\.api-sports\.io\/football\/teams\/\d+\.png$/;

async function auth(c, path, { method = 'POST', body, token } = {}) {
  const headers = { apikey: c.key, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  else if (!c.key.startsWith('sb_')) headers.Authorization = 'Bearer ' + c.key;
  const r = await fetch(`${c.url}/auth/v1/${path}`, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch (e) { j = null; }
  return { status: r.status, ok: r.ok, j };
}

function erroPT(j, status) {
  const code = String((j && (j.error_code || j.code || j.error)) || '');
  const msg = String((j && (j.msg || j.message || j.error_description)) || '');
  const t = code + ' ' + msg;
  if (status === 429 || /rate.?limit|over_email_send|over_request/i.test(t)) return 'Muitos pedidos seguidos. Espere um minuto e tente de novo.';
  if (/not.?authorized/i.test(t)) return 'O envio de e-mails do site ainda não foi configurado. Tente mais tarde.';
  if (/otp_expired|expired|invalid|not found/i.test(t)) return 'Código errado ou vencido. Confira o e-mail ou peça um código novo.';
  if (/signup.*disabled|signups not allowed/i.test(t)) return 'Novos cadastros estão desativados no momento.';
  if (/email_address_invalid|invalid.*email/i.test(t)) return 'Esse e-mail não parece válido.';
  return 'Não foi possível concluir agora. Tente de novo em instantes.';
}

const tokenDe = req => {
  const h = String((req.headers && (req.headers.authorization || req.headers.Authorization)) || '');
  const m = h.match(/^Bearer\s+([A-Za-z0-9._-]{20,4096})$/);
  return m ? m[1] : null;
};

const sessaoDe = j => ({
  access_token: j.access_token,
  refresh_token: j.refresh_token,
  expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
  email: (j.user && j.user.email) || null
});

function limpaPerfil(row) {
  return { times: Array.isArray(row && row.times) ? row.times : [], ligas: Array.isArray(row && row.ligas) ? row.ligas : [], avisos: limpaAvisos(row && row.avisos) };
}
const TOKEN = /^[A-Za-z0-9_:\-.]{20,4096}$/;
// configuração pública do Firebase para o navegador (não é segredo; fica na variável FCM_WEB_CONFIG)
function pushCfg() {
  let web = null;
  // aceita o JSON ou o trecho copiado direto do Firebase (const firebaseConfig = { apiKey: "...", ... };)
  const raw = String(process.env.FCM_WEB_CONFIG || '').trim();
  try { web = JSON.parse(raw || 'null'); } catch (e) {
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      web = m ? JSON.parse(m[0].replace(/\/\/[^\n]*/g, '').replace(/'/g, '"').replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/,\s*}/g, '}')) : null;
    } catch (e2) { web = null; }
  }
  const vapid = String(process.env.FCM_VAPID_KEY || '').trim();
  return web && web.apiKey && web.projectId && web.messagingSenderId && web.appId && vapid ? { web: { apiKey: web.apiKey, authDomain: web.authDomain, projectId: web.projectId, messagingSenderId: web.messagingSenderId, appId: web.appId }, vapid } : null;
}

async function carregaPerfil(c, user) {
  const { data } = await sb(c, `perfis?user_id=eq.${user.id}&select=times,ligas,avisos`);
  if (data && data[0]) return { ...limpaPerfil(data[0]), novo: false };
  await sb(c, 'perfis', { method: 'POST', body: { user_id: user.id, email: user.email || null }, prefer: 'resolution=ignore-duplicates,return=minimal' });
  return { times: [], ligas: [], avisos: limpaAvisos(null), novo: true };
}

async function usuario(c, req) {
  const token = tokenDe(req);
  if (!token) return null;
  const r = await auth(c, 'user', { method: 'GET', token });
  return r.ok && r.j && r.j.id ? r.j : null;
}

function revisao(email, codigo) {
  const e = String(process.env.REVISAO_EMAIL || '').trim().toLowerCase();
  const k = String(process.env.REVISAO_CODIGO || '').replace(/\D/g, '');
  if (!e || k.length < 6 || email !== e) return false;
  if (codigo === undefined) return true;
  const a = Buffer.from(String(codigo)), b = Buffer.from(k);
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}
async function entraRevisao(c, email) {
  await auth(c, 'admin/users', { body: { email, email_confirm: true } }); // já existir não é problema
  const g = await auth(c, 'admin/generate_link', { body: { type: 'magiclink', email } });
  const otp = g.j && (g.j.email_otp || (g.j.properties && g.j.properties.email_otp));
  if (!g.ok || !otp) return g;
  let r = await auth(c, 'verify', { body: { type: 'email', email, token: otp } });
  if (!r.ok) r = await auth(c, 'verify', { body: { type: 'magiclink', email, token: otp } });
  return r;
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const acao = String(q.acao || '');
  const c = cfg();
  if (acao === 'config') {
    const ativo = !!c && /^(sim|s|1|true|on)$/i.test(String(process.env.LOGIN_ATIVO || '').trim());
    return send(res, 200, { ok: true, configurado: !!c, login: ativo, push: pushCfg() }, 'public, s-maxage=60, stale-while-revalidate=300');
  }
  if (!c) return send(res, 200, { ok: false, configurado: false, error: 'Contas ainda não configuradas.' });
  const body = readBody(req) || {};
  try {
    if (acao === 'codigo' && req.method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!EMAIL.test(email)) return send(res, 400, { ok: false, error: 'Digite um e-mail válido.' });
      if (revisao(email)) return send(res, 200, { ok: true });
      const r = await auth(c, 'otp', { body: { email, create_user: true } });
      if (!r.ok) return send(res, r.status === 429 ? 429 : 400, { ok: false, error: erroPT(r.j, r.status) });
      return send(res, 200, { ok: true });
    }
    if (acao === 'entrar' && req.method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const codigo = String(body.codigo || '').replace(/\D/g, '');
      if (!EMAIL.test(email) || !/^\d{6,10}$/.test(codigo)) return send(res, 400, { ok: false, error: 'Digite o código inteiro que chegou no e-mail.' });
      // "email" vale para o login e para o primeiro cadastro; os outros tipos cobrem versões antigas do Supabase Auth
      let r;
      if (revisao(email)) {
        r = revisao(email, codigo) ? await entraRevisao(c, email) : { ok: false, status: 403, j: { error_code: 'otp_expired' } };
      } else r = await auth(c, 'verify', { body: { type: 'email', email, token: codigo } });
      for (const type of ['signup', 'magiclink']) {
        if (revisao(email)) break;
        if (r.ok || r.status === 429) break;
        r = await auth(c, 'verify', { body: { type, email, token: codigo } });
      }
      if (!r.ok || !r.j || !r.j.access_token) {
        await new Promise(ok => setTimeout(ok, 500)); // freia quem tenta adivinhar códigos
        return send(res, r.status === 429 ? 429 : 401, { ok: false, error: erroPT(r.j, r.status) });
      }
      const user = r.j.user || {};
      const perfil = user.id ? await carregaPerfil(c, user) : { times: [], ligas: [], novo: true };
      return send(res, 200, { ok: true, sessao: sessaoDe(r.j), perfil });
    }
    if (acao === 'renovar' && req.method === 'POST') {
      const rt = String(body.refresh_token || '');
      if (!/^[A-Za-z0-9._-]{8,512}$/.test(rt)) return send(res, 400, { ok: false, error: 'Sessão inválida.' });
      const r = await auth(c, 'token?grant_type=refresh_token', { body: { refresh_token: rt } });
      if (!r.ok || !r.j || !r.j.access_token) return send(res, 401, { ok: false, error: 'Sua sessão terminou. Entre de novo.' });
      return send(res, 200, { ok: true, sessao: sessaoDe(r.j) });
    }
    if (acao === 'perfil' && req.method === 'GET') {
      const user = await usuario(c, req);
      if (!user) return send(res, 401, { ok: false, error: 'Sua sessão terminou. Entre de novo.' });
      const perfil = await carregaPerfil(c, user);
      return send(res, 200, { ok: true, email: user.email || null, perfil });
    }
    if (acao === 'salvar' && req.method === 'POST') {
      const user = await usuario(c, req);
      if (!user) return send(res, 401, { ok: false, error: 'Sua sessão terminou. Entre de novo.' });
      const ligas = [...new Set((Array.isArray(body.ligas) ? body.ligas : []).map(Number).filter(n => Number.isInteger(n) && n > 0 && n < 100000))].slice(0, 40);
      const vistos = new Set();
      const times = (Array.isArray(body.times) ? body.times : []).map(t => ({
        id: Number(t && t.id),
        nome: String((t && (t.nome || t.name)) || '').replace(/[<>]/g, '').trim().slice(0, 60),
        logo: LOGO.test(String(t && t.logo)) ? String(t.logo) : null
      })).filter(t => Number.isInteger(t.id) && t.id > 0 && t.nome && !vistos.has(t.id) && vistos.add(t.id)).slice(0, 60);
      const row = { user_id: user.id, email: user.email || null, times, ligas, atualizado_em: new Date().toISOString() };
      // os avisos só mudam quando vierem no pedido (salvar favoritos não apaga as escolhas de notificação)
      if (body.avisos && typeof body.avisos === 'object') row.avisos = limpaAvisos(body.avisos);
      await sb(c, 'perfis', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=minimal' });
      return send(res, 200, { ok: true, perfil: { times, ligas, ...(row.avisos ? { avisos: row.avisos } : {}) } });
    }
    if (acao === 'dispositivo' && req.method === 'POST') {
      const user = await usuario(c, req);
      if (!user) return send(res, 401, { ok: false, error: 'Sua sessão terminou. Entre de novo.' });
      const token = String(body.token || '');
      const plataforma = ['web', 'android', 'ios'].includes(body.plataforma) ? body.plataforma : 'web';
      if (!TOKEN.test(token)) return send(res, 400, { ok: false, error: 'Aparelho inválido.' });
      await sb(c, 'dispositivos', { method: 'POST', body: { token, user_id: user.id, plataforma, visto_em: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal' });
      // no máximo 10 aparelhos por pessoa: os mais antigos saem
      const { data: L } = await sb(c, `dispositivos?user_id=eq.${user.id}&select=token&order=visto_em.desc`);
      for (const d of (L || []).slice(10)) await sb(c, `dispositivos?token=eq.${encodeURIComponent(d.token)}`, { method: 'DELETE', prefer: 'return=minimal' });
      return send(res, 200, { ok: true });
    }
    if (acao === 'dispositivo_sair' && req.method === 'POST') {
      const user = await usuario(c, req);
      const token = String(body.token || '');
      if (user && TOKEN.test(token)) await sb(c, `dispositivos?token=eq.${encodeURIComponent(token)}&user_id=eq.${user.id}`, { method: 'DELETE', prefer: 'return=minimal' });
      return send(res, 200, { ok: true });
    }
    if (acao === 'teste_aviso' && req.method === 'POST') {
      const user = await usuario(c, req);
      if (!user) return send(res, 401, { ok: false, error: 'Sua sessão terminou. Entre de novo.' });
      const { data: L } = await sb(c, `dispositivos?user_id=eq.${user.id}&select=token`);
      const n = { title: '🔔 Avisos ligados', body: 'É assim que os lances dos seus times vão chegar.', tipo: 'teste', tag: 'teste' };
      const r = await enviaVarios((L || []).map(d => ({ token: d.token, n })));
      for (const t of r.mortos || []) await sb(c, `dispositivos?token=eq.${encodeURIComponent(t)}`, { method: 'DELETE', prefer: 'return=minimal' });
      return send(res, 200, { ok: !!r.ok, enviados: r.enviados || 0, ...(r.ok ? {} : { error: 'As notificações ainda não foram configuradas no servidor.' }) });
    }
    if (acao === 'excluir' && req.method === 'POST') {
      const user = await usuario(c, req);
      if (!user) return send(res, 401, { ok: false, error: 'Sua sessão terminou. Entre de novo.' });
      if (body.confirmar !== 'EXCLUIR') return send(res, 400, { ok: false, error: 'Confirme a exclusão.' });
      await sb(c, `dispositivos?user_id=eq.${user.id}`, { method: 'DELETE', prefer: 'return=minimal' });
      await sb(c, `perfis?user_id=eq.${user.id}`, { method: 'DELETE', prefer: 'return=minimal' });
      const r = await auth(c, `admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      if (!r.ok && r.status !== 404) return send(res, 500, { ok: false, error: 'Não foi possível excluir a conta agora. Tente de novo em instantes.' });
      return send(res, 200, { ok: true });
    }
    if (acao === 'sair' && req.method === 'POST') {
      const token = tokenDe(req);
      if (token) { try { await auth(c, 'logout', { token }); } catch (e) { /* a sessão expira sozinha */ } }
      return send(res, 200, { ok: true });
    }
    return send(res, 400, { ok: false, error: 'Ação desconhecida.' });
  } catch (e) {
    return send(res, 500, { ok: false, error: 'Erro no servidor. Tente de novo em instantes.' });
  }
};
