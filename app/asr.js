/* JLn Evolve on-device speech-to-text (Whisper via Transformers.js), run in a worker
   so the screen and the recorder never freeze while it listens.
   Free, private and offline once the model is downloaded (cached by the browser). */
// The official CDN build (bundles ONNX Runtime and finds its WASM files on the same CDN).
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
// Tried in order. Graph optimisation is switched off because ONNX Runtime's quantised-weight
// rewrite fails on some Whisper exports ("TransposeDQWeightsForMatMulNBits ... Missing required scale").
const PLANS = [
  { model: 'Xenova/whisper-base.en', dtype: 'q8' },
  { model: 'onnx-community/whisper-base.en', dtype: 'q8' },
  { model: 'onnx-community/whisper-tiny.en', dtype: 'q8' },
];
let pipe = null, loading = null, used = null;

async function load() {
  if (pipe) return pipe;
  if (loading) return loading;
  loading = (async () => {
    const T = await import(LIB);
    T.env.allowLocalModels = false; T.env.useBrowserCache = true;
    const errors = [];
    for (const plan of PLANS) {
      const files = {};
      try {
        pipe = await T.pipeline('automatic-speech-recognition', plan.model, {
          device: 'wasm', dtype: plan.dtype,
          session_options: { graphOptimizationLevel: 'disabled' },
          progress_callback: (p) => {
            if (p && p.status === 'progress' && p.file) {
              files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
              let l = 0, t = 0; for (const f of Object.values(files)) { l += f.loaded; t += f.total; }
              self.postMessage({ type: 'progress', loaded: l, total: t });
            }
          },
        });
        used = plan.model; return pipe;
      } catch (e) { errors.push(plan.model.split('/')[1] + ': ' + String((e && e.message) || e).slice(0, 120)); }
    }
    throw new Error('setup: ' + errors.join(' | '));
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

self.onmessage = async (e) => {
  const { id, type, audio } = e.data || {};
  try {
    const p = await load();
    if (type === 'load') { self.postMessage({ id, ok: true, model: used }); return; }
    const out = await p(audio, { chunk_length_s: 30, stride_length_s: 5 });
    self.postMessage({ id, ok: true, text: (out && out.text) || '' });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err).slice(0, 400) });
  }
};
