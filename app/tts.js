/* JLn Evolve human-like voice: Kokoro-82M (open model, Apache-2.0) run on the phone in a worker.
   Free and offline after a one-time download (cached by the browser). */
const LIB = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts = null, loading = null;

async function load() {
  if (tts) return tts;
  if (loading) return loading;
  loading = (async () => {
    const K = await import(LIB);
    const files = {};
    tts = await K.KokoroTTS.from_pretrained(MODEL, {
      dtype: 'q8', device: 'wasm',
      progress_callback: (p) => {
        if (p && p.status === 'progress' && p.file) {
          files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
          let l = 0, t = 0; for (const f of Object.values(files)) { l += f.loaded; t += f.total; }
          self.postMessage({ type: 'progress', loaded: l, total: t });
        }
      },
    });
    return tts;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

self.onmessage = async (e) => {
  const { id, type, text, voice, speed } = e.data || {};
  try {
    const t = await load();
    if (type === 'load') { self.postMessage({ id, ok: true }); return; }
    const t0 = Date.now();
    const out = await t.generate(text, { voice: voice || 'af_heart', speed: speed || 1 });
    const audio = out.audio instanceof Float32Array ? out.audio : new Float32Array(out.audio);
    self.postMessage({ id, ok: true, audio, rate: out.sampling_rate || 24000, ms: Date.now() - t0 }, [audio.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err).slice(0, 300) });
  }
};
