/* JLn Evolve on-device speech-to-text (Whisper via Transformers.js), run in a worker
   so the screen and the recorder never freeze while it listens.
   Free, private and offline once the model is downloaded (cached by the browser). */
// The official CDN build (bundles ONNX Runtime and finds its WASM files on the same CDN).
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
let pipe = null, loading = null;

async function load(model) {
  if (pipe) return pipe;
  if (loading) return loading;
  loading = (async () => {
    const T = await import(LIB);
    T.env.allowLocalModels = false; T.env.useBrowserCache = true;
    const files = {};
    pipe = await T.pipeline('automatic-speech-recognition', model, {
      device: 'wasm', dtype: 'q8',
      progress_callback: (p) => {
        if (p && p.status === 'progress' && p.file) {
          files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
          let l = 0, t = 0; for (const f of Object.values(files)) { l += f.loaded; t += f.total; }
          self.postMessage({ type: 'progress', loaded: l, total: t });
        }
      },
    });
    return pipe;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

self.onmessage = async (e) => {
  const { id, type, model, audio } = e.data || {};
  try {
    const p = await load(model);
    if (type === 'load') { self.postMessage({ id, ok: true }); return; }
    const out = await p(audio, { chunk_length_s: 30, stride_length_s: 5 });
    self.postMessage({ id, ok: true, text: (out && out.text) || '' });
  } catch (err) {
    self.postMessage({ id, ok: false, error: (loading || pipe ? '' : 'setup: ') + String((err && err.message) || err).slice(0, 200) });
  }
};
