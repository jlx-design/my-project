# JLn Evolve v0.1 — set-up guide (free, about 30 minutes)

Everything here uses free plans. You need a computer or tablet browser for steps 1–3; step 4 happens on your iPhone.

## What's in this folder

| Folder | What it is |
| --- | --- |
| `app/` | The app itself (about 100 KB). Upload this folder to host it. |
| `gateway/` | The AI gateway. It keeps your AI keys off your phone. |
| `tests/` | Automated tests (16 checks) and screenshots. |

## 1. Get a free AI key (Groq)

1. Sign up at console.groq.com. No card is needed.
2. Open **API Keys**, create a key named `jln-evolve` and copy it.
3. Don't paste this key into the app, into chat, or into any file. It goes only into Cloudflare in step 2.

## 2. Create the AI gateway (Cloudflare Worker)

1. Sign up at dash.cloudflare.com (free plan).
2. Go to **Workers & Pages** → **Create** → **Worker**. Name it `jln-evolve-gateway` and deploy the starter.
3. Choose **Edit code**, replace everything with the contents of `gateway/worker.js`, then **Deploy**.
4. In the Worker's **Settings**:
   - **Bindings** → add **Workers AI** with the name `AI`. This is the free backup AI and transcription.
   - **Variables** → add these as plain text, using the values in `gateway/wrangler.toml`:
     - `ALLOWED_ORIGIN`: the app address from step 3. Fill it in after step 3.
     - `GROQ_MODEL`
     - `GROQ_STT_MODEL`
     - `CF_MODEL`
     - `CF_STT_MODEL`
   - **Secrets** → add these, encrypted:
     - `GROQ_API_KEY`: your key from step 1.
     - `APP_TOKEN`: a long password you invent, at least 24 characters. You'll type it into the app once.
5. Copy the Worker address. It looks like `https://jln-evolve-gateway.<your-name>.workers.dev`.

Model names change over time. If a test in step 4 fails with a model error, check console.groq.com/docs/models and update `GROQ_MODEL`.

## 3. Host the app (Cloudflare Pages)

1. Go to **Workers & Pages** → **Create** → **Pages** → **Upload assets**. Name the project `jln-evolve`.
2. Upload the contents of the `app/` folder and deploy. Your address will be `https://jln-evolve.pages.dev`, or similar.
3. Go back to the Worker and set `ALLOWED_ORIGIN` to that exact address. Don't add a slash at the end.

## 4. Install on your iPhone

1. Update the iPhone to iOS 26: **Settings** → **General** → **Software Update**.
2. Open your app address in **Safari** → **Share** → **Add to Home Screen** → **Add**.
3. Open **Evolve** from the Home Screen.
4. Go to **More** → **Control Centre** → **Your data** → **Protect storage**.
5. Under **AI connection**, enter your Worker address and your `APP_TOKEN`, then tap **Test connection**. It should say **Connected**.
6. Under **Profile**, fill in your **Writing DNA**: how you like letters to sound and how you sign off.

## What works today and what doesn't

The app's **More → What works** page lists every feature honestly. In short:

- **Works offline:**
  - Tasks, notes, the vault and search
  - Memory, drafts and approvals
  - The activity log
  - Voice recording
  - Typed commands: `task: …`, `remember: …`, `note: …`, `brief me`
- **Needs the gateway (online):**
  - Chat with the coordinating agent and the 8 specialists
  - Cloud transcription of recordings
- **Not built yet:**
  - On-device AI model and Face ID lock (Phase 4)
  - PDF/Word reading and exports (Phase 5)
  - Sync between devices and automations (Phase 6)
  - Gmail, Calendar and web research (Phase 7)

## Keeping your data safe

- Your data lives on your phone, in the app's own storage.
- Make a backup regularly: **Control Centre** → **Export everything**. This matters until encrypted cloud backup arrives in Phase 6.
- If you remove the app from the Home Screen, its data is deleted too. Export first.
