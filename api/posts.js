// TEL.SCORE · posts do Estúdio salvos na nuvem (parte 4)
//
//   GET    /api/posts                → lista os posts salvos
//   GET    /api/posts?acao=verificar → só confere a senha
//   POST   /api/posts                → salva (ou atualiza) um post
//   DELETE /api/posts?id=...         → apaga um post
//
// Tudo exige a senha no cabeçalho "x-telscore-senha". A senha fica na variável de ambiente
// POSTS_SENHA da Vercel e nunca aparece no código.

const crypto = require('crypto');
const { cfg, sb, send, readBody } = require('./_db');

const MAX_HTML = 3 * 1024 * 1024;
const okId = id => typeof id === 'string' && /^[a-z0-9_-]{4,40}$/i.test(id);

function senhaOk(req) {
  const real = process.env.POSTS_SENHA || '';
  const got = String((req.headers && (req.headers['x-telscore-senha'] || req.headers['X-Telscore-Senha'])) || '');
  if (!real || !got) return false;
  const a = crypto.createHash('sha256').update(real).digest();
  const b = crypto.createHash('sha256').update(got).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  const c = cfg();
  if (!c || !process.env.POSTS_SENHA) return send(res, 200, { ok: false, configurado: false, error: 'Posts na nuvem ainda não configurados (POSTS_SENHA).' });
  if (!senhaOk(req)) {
    await new Promise(r => setTimeout(r, 700)); // atrasa quem tenta adivinhar a senha
    return send(res, 401, { ok: false, error: 'Senha incorreta.' });
  }
  const q = req.query || {};
  try {
    if (req.method === 'GET') {
      if (q.acao === 'verificar') return send(res, 200, { ok: true });
      const { data } = await sb(c, 'posts?select=id,criado_em,titulo,subtitulo,texto,html&order=criado_em.desc&limit=200');
      return send(res, 200, { ok: true, posts: (data || []).map(p => ({ id: p.id, at: p.criado_em, title: p.titulo || '', sub: p.subtitulo || '', text: p.texto || '', html: p.html || '' })) });
    }
    if (req.method === 'POST') {
      const b = readBody(req);
      if (!b || !okId(b.id)) return send(res, 400, { ok: false, error: 'Post inválido.' });
      const html = String(b.html || ''), text = String(b.text || '');
      if (!text) return send(res, 400, { ok: false, error: 'Post sem texto.' });
      if (html.length > MAX_HTML) return send(res, 413, { ok: false, error: 'Post grande demais.' });
      const at = Date.parse(b.at);
      const row = { id: b.id, criado_em: Number.isFinite(at) ? new Date(at).toISOString() : new Date().toISOString(), titulo: String(b.title || '').slice(0, 200), subtitulo: String(b.sub || '').slice(0, 300), texto: text.slice(0, 20000), html };
      await sb(c, 'posts', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=minimal' });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      if (!okId(q.id)) return send(res, 400, { ok: false, error: 'Post inválido.' });
      await sb(c, `posts?id=eq.${q.id}`, { method: 'DELETE', prefer: 'return=minimal' });
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (e) {
    return send(res, 500, { ok: false, error: String((e && e.message) || e).slice(0, 300) });
  }
};
