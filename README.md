# Lingo — voice vocabulary tutor

A small browser prototype of a voice agent that helps people learn vocabulary. It
speaks a clue out loud, listens to your answer, and tells you how you did.

**Live:** https://vocabulary-voice-agent.onrender.com
**Mirror:** https://site-457749e5d12b4431903cd5fbbef590b7.freebuff.page

## Try it in a minute

1. Open the live link in **Chrome or Edge** (they carry the Web Speech API).
2. Allow the microphone on the check card, then press **Start session**.
3. Say the word when Lingo asks. Say “repeat”, “hint”, “skip” or “I don’t know”
   any time.

No microphone, or reviewing on Firefox? Press **Hear a scripted demo** on the
check card — it runs the real agent through a full round with canned answers, so
the behaviour is visible without any device permission.

## What it does

- Reads you a definition and an example sentence with the word blanked out, then asks
  for the word ("What's the word?").
- Listens through your microphone and grades what it heard, tolerating near-misses,
  plurals and alternate pronunciations.
- Answers out loud: 10 points on the first try, 5 on the second, a spoken hint
  ("it starts with the letter D and has 8 letters") before revealing the word.
- Understands "repeat", "hint", "skip" and "I don't know" as spoken commands.
- Plays rounds of five words from a 20-word set, with points, a streak and a
  round summary listing the words practised.
- Asks you to say it again when recognition confidence is low, instead of
  scoring a misheard answer as wrong (one repair turn per word).
- Listens in Indian English (`en-IN`) and only falls back to `en-US` if the
  browser has no Indian-English model.
- Falls back to a typing box whenever the microphone is blocked, missing, or
  speech recognition is unavailable — and picks voice back up if you grant the
  mic mid-round, without restarting.
- Opens with a microphone check (live level meter plus a transcript) on first
  visit, and offers a **scripted demo** that runs the real agent end to end for
  reviewers on Firefox or with the mic blocked. Trigger either later from the
  footer: “Check mic” and “Hear a demo”.
- With a Gemini key configured, each round asks the model for five fresh
  workplace-English (B2) words instead of using the bundled list, showing an
  “AI-generated words” badge. Without the key, or on any error, it silently
  falls back to the bundled 20 words.

Clues are spoken with `SpeechSynthesis` and answers are recognised with the Web
Speech API, so the audio path stays in the browser — no account, and no audio
leaves the device.

## Optional AI rounds

The one server-side feature is `/api/round`, which asks Gemini for a fresh set of
words. It is **off by default** and the app is fully usable without it.

- Set `GEMINI_API_KEY` on the host (Worker secret, or a local `.env` for
  `node server.mjs`). The key is only read server-side and never shipped to the
  browser.
- Models: `gemini-3.5-flash-lite` first, then `gemini-2.5-flash-lite` and
  `gemini-3.5-flash`, because the free tier answers `503 high demand` in bursts.
  Each is retried with backoff; the client allows 16 s before giving up.
- A successful round is cached in the Worker for 10 minutes, so repeat visits are
  instant and don't spend quota.
- Responses use a JSON response schema and are sanitised (word shape, no word
  inside its definition, example must contain `___`).
- Only **text** prompts are sent to Google. In this design no audio is uploaded,
  so the “audio never leaves your browser” claim still holds. Note that Gemini's
  free tier allows Google to use prompts to improve its products; use a billed
  project for anything real.

## Run it locally

No dependencies, no build step. Serve the `public/` folder:

```bash
node server.mjs
```

Then open http://127.0.0.1:4173 and press **Start session**. Allow microphone
access when the browser asks. No microphone? Choose **Hear a scripted demo** on
the mic-check card (or “Hear a demo” in the footer).

Chrome or Edge is recommended: Firefox has no `SpeechRecognition`, so it drops to
the typing fallback (the agent still speaks).

## Files

| Path | Purpose |
| --- | --- |
| `public/index.html` | Markup for the single page |
| `public/lingo.css` | Styles |
| `public/app.js` | Agent logic: speech in/out, grading, round flow, mic permission handling, AI round fetch |
| `server.mjs` | Zero-dependency local server: static files plus `/api/round` |
| `worker.js` | Worker: static assets plus `/api/round` with the Gemini generator |
| `deploy.json` | Cloudflare deployment manifest |

## Built with

- **Vanilla JS, no framework, no build step** — one page, so the whole flow stays
  readable in `public/app.js`.
- **Web Speech API** — `SpeechSynthesis` for the agent’s voice, `SpeechRecognition`
  (`en-IN`) for answers. Both run locally in the browser.
- **Gemini 3.5 Flash-Lite** — optional fresh word sets, called from a tiny Worker
  route so the key never reaches the client.
- **Cloudflare Workers + Render** — the same static app deployed twice; the Worker
  also hosts the AI endpoint, and the Render site calls it cross-origin.

## Deployment

- **Render** — static site, branch `main`, publish directory `public`, no build
  command; auto-deploys on push.
- **Cloudflare Workers** — `worker.js` serves `public/` as static assets and the
  `/api/round` route, using `deploy.json` as the manifest.

## Known limits

- Speech recognition is the browser’s, so accuracy varies with the device and the
  room; the app asks you to repeat when confidence is low rather than guess.
- Firefox has no `SpeechRecognition` (typing fallback), and Safari’s support is
  partial — Chrome or Edge gives the intended experience.
- The Gemini free tier is rate-limited and occasionally busy; the app falls back
  to the bundled word list rather than failing.
