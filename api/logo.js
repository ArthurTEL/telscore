// TEL.SCORE · função de servidor (Vercel) para imagens
// Entrega escudos dos times e fotos dos jogadores a partir do servidor de mídia da API-Football,
// pelo mesmo endereço do site. Assim as imagens aparecem nos posts e entram nos PNGs baixados.

const HOST = 'media.api-sports.io';
const MAX = 4 * 1024 * 1024; // fotos de estádio podem ser grandes; a Vercel aceita respostas de até 4,5 MB

module.exports = async (req, res) => {
  const raw = String((req.query || {}).u || '');
  let url;
  try { url = new URL(raw); } catch (e) { res.status(400).json({ ok: false, error: 'Endereço de imagem inválido.' }); return; }
  if (url.protocol !== 'https:' || url.hostname !== HOST) {
    res.status(400).json({ ok: false, error: 'Só imagens da API-Football são permitidas.' });
    return;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch(url.toString(), { signal: ctrl.signal });
    clearTimeout(timer);
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\//.test(type)) { res.setHeader('Cache-Control', 'public, s-maxage=600'); res.status(404).json({ ok: false, error: 'Imagem não encontrada.' }); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX) { res.setHeader('Cache-Control', 'public, s-maxage=86400'); res.status(413).json({ ok: false, error: 'Imagem grande demais.' }); return; }
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400');
    res.status(200).send(buf);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ ok: false, error: 'Não foi possível buscar a imagem agora.' });
  }
};
