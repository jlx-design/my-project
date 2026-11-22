/* JLn Evolve on Neon Functions: serves the installable app and proxies AI requests
   to the Neon AI Gateway. No dependencies. Secrets come from the function environment:
   APP_TOKEN, NEON_AI_GATEWAY_BASE_URL, NEON_AI_GATEWAY_TOKEN, AI_MODEL. */
const FILES = __FILES__; // { path: [contentType, base64] } — injected at build time

const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), geolocation=(), microphone=(self)',
  'strict-transport-security': 'max-age=31536000',
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...SECURITY } });

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const textOf = (content) => Array.isArray(content) ? content.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('') : String(content ?? '');

async function chat(request) {
  const body = await request.json().catch(() => ({}));
  const system = String(body.system || '').slice(0, 24000);
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-16).map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }));
  if (!messages.length) return json({ error: 'no messages' }, 400);
  const base = process.env.NEON_AI_GATEWAY_BASE_URL, token = process.env.NEON_AI_GATEWAY_TOKEN, model = process.env.AI_MODEL || 'gpt-5-mini';
  if (!base || !token) return json({ error: 'ai_not_configured' }, 503);
  const r = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages] }),
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    const credits = r.status === 402 || r.status === 403 || /credit|balance|payment|locked/i.test(detail);
    return json({ error: credits ? 'ai_credits_needed' : 'ai_upstream_error', status: r.status }, credits ? 402 : 502);
  }
  const j = await r.json();
  return json({ text: textOf(j.choices?.[0]?.message?.content), model: `neon/${j.model || model}` });
}

const handler = {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (request.method !== 'POST') return json({ error: 'method' }, 405);
      if (!safeEqual(request.headers.get('x-app-token') || '', process.env.APP_TOKEN || '')) return json({ error: 'unauthorised' }, 401);
      try {
        if (url.pathname === '/api/chat') return await chat(request);
        if (url.pathname === '/api/transcribe') return json({ error: 'transcription_not_enabled' }, 501);
        return json({ error: 'not found' }, 404);
      } catch { return json({ error: 'gateway_error' }, 502); }
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const f = FILES[path];
    if (!f) return new Response('Not found', { status: 404, headers: SECURITY });
    const headers = { 'content-type': f[0], ...SECURITY, 'cache-control': path === '/sw.js' || path === '/index.html' ? 'no-cache' : 'public, max-age=3600' };
    if (path === '/index.html') headers['content-security-policy'] = CSP;
    return new Response(request.method === 'HEAD' ? null : Buffer.from(f[1], 'base64'), { headers });
  },
};
export default handler;
