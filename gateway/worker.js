/* JLn Evolve AI gateway — Cloudflare Worker (free plan).
   Holds the AI keys so they never ship in the app. Routes chat to Groq (free tier) and
   falls back to Cloudflare Workers AI. Transcribes audio with Whisper.
   Secrets (set with `wrangler secret put`): APP_TOKEN, GROQ_API_KEY
   Vars (wrangler.toml): ALLOWED_ORIGIN, GROQ_MODEL, GROQ_STT_MODEL, CF_MODEL, CF_STT_MODEL */

const json = (obj, status, cors) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } });

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function groqChat(env, system, messages) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.GROQ_MODEL, messages: [{ role: 'system', content: system }, ...messages], temperature: 0.4, max_tokens: 2048 }),
  });
  if (!r.ok) throw new Error(`groq ${r.status}`);
  const j = await r.json();
  return { text: j.choices?.[0]?.message?.content ?? '', model: `groq/${env.GROQ_MODEL}` };
}

async function cfChat(env, system, messages) {
  const out = await env.AI.run(env.CF_MODEL, { messages: [{ role: 'system', content: system }, ...messages], max_tokens: 1536 });
  return { text: out.response ?? '', model: `cloudflare/${env.CF_MODEL}` };
}

async function groqTranscribe(env, bytes, type) {
  const fd = new FormData();
  const ext = type.includes('mp4') ? 'm4a' : type.includes('wav') ? 'wav' : 'webm';
  fd.append('file', new Blob([bytes], { type }), `note.${ext}`);
  fd.append('model', env.GROQ_STT_MODEL);
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${env.GROQ_API_KEY}` }, body: fd });
  if (!r.ok) throw new Error(`groq-stt ${r.status}`);
  return (await r.json()).text ?? '';
}

async function cfTranscribe(env, bytes) {
  const out = await env.AI.run(env.CF_STT_MODEL, { audio: [...new Uint8Array(bytes)] });
  return out.text ?? '';
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = {
      'access-control-allow-origin': allowed.includes(origin) ? origin : (allowed[0] || 'null'),
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-app-token',
      'access-control-max-age': '86400',
      vary: 'origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
    if (!safeEqual(request.headers.get('x-app-token') || '', env.APP_TOKEN || '')) return json({ error: 'unauthorised' }, 401, cors);

    const path = new URL(request.url).pathname;
    try {
      if (path === '/chat') {
        const body = await request.json();
        const system = String(body.system || '').slice(0, 24000);
        const messages = (Array.isArray(body.messages) ? body.messages : [])
          .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .slice(-16).map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }));
        if (!messages.length) return json({ error: 'no messages' }, 400, cors);
        try { if (env.GROQ_API_KEY) return json(await groqChat(env, system, messages), 200, cors); } catch (e) { /* fall back */ }
        if (env.AI) return json(await cfChat(env, system, messages), 200, cors);
        return json({ error: 'no provider available' }, 503, cors);
      }
      if (path === '/transcribe') {
        const type = request.headers.get('content-type') || 'audio/webm';
        const bytes = await request.arrayBuffer();
        if (bytes.byteLength > 20 * 1024 * 1024) return json({ error: 'audio too large (20 MB max)' }, 413, cors);
        try { if (env.GROQ_API_KEY) return json({ text: await groqTranscribe(env, bytes, type) }, 200, cors); } catch (e) { /* fall back */ }
        if (env.AI) return json({ text: await cfTranscribe(env, bytes) }, 200, cors);
        return json({ error: 'no provider available' }, 503, cors);
      }
      return json({ error: 'not found' }, 404, cors);
    } catch (e) {
      return json({ error: 'gateway error' }, 502, cors);
    }
  },
};
