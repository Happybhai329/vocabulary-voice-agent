# Lingo — voice vocabulary tutor

A small browser prototype of a voice agent that helps people learn vocabulary. It
speaks a clue out loud, listens to your answer, and tells you how you did.

**Live:** https://vocabulary-voice-agent.onrender.com

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
- Falls back to a typing box whenever the microphone is blocked, missing, or
  speech recognition is unavailable — and picks voice back up if you grant the
  mic mid-round, without restarting.

Everything runs in the browser: clues are spoken with `SpeechSynthesis`, answers
are recognised with the Web Speech API. There is no backend, no API key and no
account.

## Run it locally

No dependencies, no build step. Serve the `public/` folder:

```bash
node server.mjs
```

Then open http://127.0.0.1:4173 and press **Start session**. Allow microphone
access when the browser asks.

Chrome or Edge is recommended: Firefox has no `SpeechRecognition`, so it drops to
the typing fallback (the agent still speaks).

## Files

| Path | Purpose |
| --- | --- |
| `public/index.html` | Markup for the single page |
| `public/lingo.css` | Styles |
| `public/app.js` | Agent logic: speech in/out, grading, round flow, mic permission handling |
| `server.mjs` | Zero-dependency local static server |
| `worker.js`, `deploy.json` | Static-asset Worker used for the Cloudflare deployment |

## Deployment

- **Render** — static site, branch `main`, publish directory `public`, no build
  command; auto-deploys on push.
- **Cloudflare Workers** — `worker.js` serves `public/` as static assets, using
  `deploy.json` as the manifest.
