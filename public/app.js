/* Lingo — a browser-based voice vocabulary tutor.
   Voice input: Web Speech API (Chrome/Edge); voice output: SpeechSynthesis.
   Typed answers work everywhere as a fallback. */

const WORDS = [
  { word: "ephemeral", definition: "lasting for a very short time", example: "The beauty of the cherry blossom is ___." },
  { word: "resilient", definition: "able to recover quickly from difficulty", example: "She stayed ___ after losing her first match." },
  { word: "meticulous", definition: "showing great attention to small details", example: "He kept ___ notes of every meeting." },
  { word: "vivid", definition: "producing strong, clear images in the mind", example: "I still remember the ___ colours of that sunset." },
  { word: "candid", definition: "honest and direct, even when it is awkward", example: "Her ___ feedback saved us months of work." },
  { word: "frugal", definition: "careful with money and resources", example: "They lived in a ___ way while saving for a house." },
  { word: "gregarious", definition: "very sociable and fond of company", example: "My ___ uncle knows everyone at the market." },
  { word: "ubiquitous", definition: "present or found almost everywhere", example: "Smartphones have become ___ in daily life." },
  { word: "ambiguous", definition: "having more than one possible meaning", example: "His answer was ___ enough to upset both sides." },
  { word: "tenacious", definition: "holding on firmly and never giving up", example: "A ___ researcher kept asking until she got answers." },
  { word: "serene", definition: "calm, peaceful and untroubled", example: "The lake was ___ in the early morning light." },
  { word: "eloquent", definition: "fluent, clear and persuasive in speech", example: "She gave an ___ speech that moved the whole room." },
  { word: "diligent", definition: "working with steady care and effort", example: "A ___ student reviews notes every evening." },
  { word: "spontaneous", definition: "done suddenly, without planning", example: "We took a ___ trip to the coast on Friday night." },
  { word: "pragmatic", definition: "practical rather than idealistic", example: "Her ___ plan got the product out in six weeks." },
  { word: "nostalgic", definition: "feeling sentimental longing for the past", example: "The old song made him ___ for his school days." },
  { word: "audacious", definition: "bold and willing to take a big risk", example: "It was an ___ goal, and somehow they reached it." },
  { word: "lucid", definition: "clear and easy to understand", example: "His writing is ___ even when the topic is complex." },
  { word: "arduous", definition: "requiring a lot of hard effort", example: "The climb was ___, but the view was worth it." },
  { word: "empathy", definition: "the ability to understand another person's feelings", example: "Good teachers lead with ___." },
];

const ROUND_SIZE = 5;

const els = {
  orb: document.getElementById("orb"),
  status: document.getElementById("status"),
  liveText: document.getElementById("liveText"),
  progressFill: document.getElementById("progressFill"),
  progress: document.getElementById("progress"),
  scoreValue: document.getElementById("scoreValue"),
  streakValue: document.getElementById("streakValue"),
  roundValue: document.getElementById("roundValue"),
  startBtn: document.getElementById("startBtn"),
  repeatBtn: document.getElementById("repeatBtn"),
  skipBtn: document.getElementById("skipBtn"),
  typeToggle: document.getElementById("typeToggle"),
  typeForm: document.getElementById("typeForm"),
  typeInput: document.getElementById("typeInput"),
  clueTag: document.getElementById("clueTag"),
  clueWord: document.getElementById("clueWord"),
  clueDefinition: document.getElementById("clueDefinition"),
  clueExample: document.getElementById("clueExample"),
  transcript: document.getElementById("transcript"),
  muteBtn: document.getElementById("muteBtn"),
};

const state = {
  queue: [],
  index: 0,
  answered: 0,
  correct: 0,
  score: 0,
  streak: 0,
  bestStreak: 0,
  attempts: 0,
  current: null,
  mode: "idle", // idle | speaking | listening | judging | over
  muted: false,
  typing: false,
  turn: 0,
  recognition: null,
  listenTimer: null,
  listenRequest: 0,
  micBlocked: false,
  wordClosed: false,
  typingBySystem: false,
};

/* ---------------- speech output ---------------- */

let voices = [];

function loadVoices() {
  if (!("speechSynthesis" in window)) return;
  voices = window.speechSynthesis.getVoices() || [];
}

if ("speechSynthesis" in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function pickVoice() {
  if (!voices.length) loadVoices();
  const preferred = [
    "Google US English",
    "Microsoft Aria Online (Natural) - English (United States)",
    "Microsoft Jenny Online (Natural) - English (United States)",
    "Samantha",
    "Karen",
  ];
  for (const name of preferred) {
    const match = voices.find((v) => v.name === name);
    if (match) return match;
  }
  return voices.find((v) => /^en[-_]US/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
}

function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function speak(text) {
  const phrase = String(text || "").trim();
  if (!phrase) return Promise.resolve();

  if (state.muted || !("speechSynthesis" in window)) {
    return sleep(Math.min(2400, 420 + phrase.length * 24));
  }

  return new Promise((resolve) => {
    stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(phrase);
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 0.97;
    utterance.pitch = 1.02;
    utterance.volume = 1;

    const beganAt = performance.now();
    // Generous cap: a slow system voice can take ~250ms per character.
    const hardCap = 9000 + phrase.length * 260;
    let started = false;
    let settled = false;
    let retryTimer = null;
    let watch = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(watch);
      clearTimeout(retryTimer);
      resolve();
    };

    utterance.onstart = () => {
      started = true;
      clearTimeout(retryTimer);
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    // Never hand control back while the engine is still talking: doing that
    // used to open the mic (and cancel the utterance) mid-sentence.
    watch = setInterval(() => {
      if (started && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        finish();
        return;
      }
      if (performance.now() - beganAt > hardCap) finish();
    }, 200);

    // Chrome occasionally drops a speak() issued in the same tick as cancel().
    setTimeout(() => {
      if (settled) return;
      window.speechSynthesis.speak(utterance);
      retryTimer = setTimeout(() => {
        if (settled || started || window.speechSynthesis.speaking || window.speechSynthesis.pending) return;
        try {
          window.speechSynthesis.speak(utterance);
        } catch (error) {
          finish();
        }
      }, 700);
    }, 50);
  });
}

async function waitForSilence() {
  if (state.muted || !("speechSynthesis" in window)) {
    await sleep(150);
    return;
  }
  const beganAt = performance.now();
  while (performance.now() - beganAt < 2000) {
    if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) break;
    await sleep(120);
  }
  // A short tail so the recogniser never picks up the agent's last syllable.
  await sleep(260);
}

/* ---------------- microphone permission ---------------- */

let micStatus = null;

async function initMicPermission() {
  if (!navigator.permissions || !navigator.permissions.query) return;
  try {
    micStatus = await navigator.permissions.query({ name: "microphone" });
  } catch (error) {
    micStatus = null;
    return;
  }
  // Someone can click Allow mid-round: pick the voice up without a restart.
  micStatus.addEventListener("change", () => onMicPermissionChange(micStatus.state));
}

function micPermissionState() {
  return (micStatus && micStatus.state) || "unknown";
}

function onMicPermissionChange(permission) {
  if (permission === "granted" && state.micBlocked) {
    state.micBlocked = false;
    if (state.typingBySystem) disableTyping();
    addBubble(
      "agent",
      state.current
        ? "Microphone access is on — I can hear you now, no restart needed."
        : "Microphone access is on — I’ll listen from the next round."
    );
    if (state.mode === "over" || !state.current) {
      setStatus("Microphone is on — play another round to use it.", "idle");
      return;
    }
    if (state.mode === "idle" && !state.wordClosed) startListening();
    return;
  }

  if (permission === "denied" && !state.micBlocked && state.current) {
    blockMic(
      "Microphone access was turned off, so I’ve switched on typing. Type your answer below, or allow the mic again."
    );
  }
}

/* ---------------- speech input ---------------- */

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

function buildRecognition() {
  if (!SpeechRecognitionCtor) return null;
  const recognition = new SpeechRecognitionCtor();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 4;

  recognition.onstart = () => {
    els.liveText.textContent = "";
  };

  recognition.onresult = (event) => {
    // A late result after we stopped listening must not answer the old word.
    if (state.mode !== "listening") return;
    let interim = "";
    const finals = [];
    const alternatives = [];
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) {
        finals.push(result[0].transcript);
        for (let a = 0; a < result.length; a += 1) alternatives.push(result[a].transcript);
      } else {
        interim += result[0].transcript;
      }
    }
    if (interim) els.liveText.textContent = interim.trim();
    const finalText = finals.join(" ").trim();
    if (finalText) {
      els.liveText.textContent = "";
      handleAnswer(finalText, alternatives);
    }
  };

  recognition.onerror = (event) => {
    const code = (event && event.error) || "unknown";
    if (code === "aborted") return;

    if (code === "not-allowed" || code === "service-not-allowed") {
      blockMic(
        "I’m not allowed to use the microphone, so I’ve switched on typing. " +
          "You can allow the mic from the address bar (the lock icon) and restart, or just type your answers below."
      );
      return;
    }
    if (code === "audio-capture") {
      blockMic("I can’t reach a microphone on this device, so I’ve switched on typing. Type your answer below.");
      return;
    }
    if (code === "network") {
      blockMic(
        "Speech recognition needs a network connection and it isn’t reachable right now, so I’ve switched on typing. Type your answer below."
      );
      return;
    }
    if (code === "no-speech") {
      state.mode = "idle";
      setOrb("idle");
      setStatus("I didn’t hear anything — tap the mic and have another go.", "idle");
    }
  };

  recognition.onend = () => {
    clearTimeout(state.listenTimer);
    if (state.mode !== "listening") return;
    state.mode = "idle";
    setOrb("idle");
    if (state.micBlocked) return; // the block message is already on screen
    setStatus("I didn’t catch that — tap the mic and say the word.", "idle");
  };

  return recognition;
}

function ensureRecognition() {
  if (!state.recognition) state.recognition = buildRecognition();
  return state.recognition;
}

function showTypingPrompt() {
  setOrb("idle");
  enableTyping(true);
  setStatus("Type the word below — microphone unavailable.", "idle");
  els.typeInput.focus();
}

function blockMic(message) {
  state.micBlocked = true;
  state.mode = "idle";
  state.listenRequest += 1;
  clearTimeout(state.listenTimer);
  showTypingPrompt();
  if (message) addBubble("agent", message);
}

function micUnavailable() {
  blockMic("I couldn’t start listening, so I’ve switched on typing. Type your answer below.");
}

async function startListening() {
  if (!state.current || state.mode === "over") return;
  const request = ++state.listenRequest;

  if (state.micBlocked) {
    state.mode = "idle";
    showTypingPrompt();
    return;
  }

  // Let the agent finish speaking so the recogniser doesn't hear itself.
  await waitForSilence();
  if (request !== state.listenRequest || !state.current || state.mode === "over") return;
  openMic(request);
}

function openMic(request) {
  const recognition = ensureRecognition();
  if (!recognition) {
    micUnavailable();
    return;
  }

  state.mode = "listening";
  els.liveText.textContent = "";
  setStatus("Listening… say the word.", "listening");
  setOrb("listening");
  tryStartRecognition(request, 0);

  clearTimeout(state.listenTimer);
  state.listenTimer = setTimeout(() => {
    if (state.mode !== "listening" || request !== state.listenRequest) return;
    try { state.recognition.stop(); } catch (e) { /* ignore */ }
  }, 9000);
}

function tryStartRecognition(request, attempt) {
  if (request !== state.listenRequest || state.mode !== "listening") return;
  try {
    state.recognition.start();
  } catch (error) {
    // Chrome refuses start() while the previous session is still tearing down.
    if (attempt < 4) {
      setTimeout(() => tryStartRecognition(request, attempt + 1), 200 * (attempt + 1));
      return;
    }
    state.recognition = buildRecognition();
    if (!state.recognition) {
      micUnavailable();
      return;
    }
    try {
      state.recognition.start();
    } catch (retryError) {
      micUnavailable();
    }
  }
}

function stopListening() {
  clearTimeout(state.listenTimer);
  state.listenRequest += 1;
  if (state.mode === "listening") state.mode = "idle";
  if (state.recognition) {
    try { state.recognition.stop(); } catch (e) { /* ignore */ }
  }
}

/* ---------------- grading helpers ---------------- */

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

const VARIANTS = {
  empathy: ["sympathy"],
};

function matchesTarget(text, word) {
  const tokens = normalize(text).split(" ").filter(Boolean);
  const targets = [word, ...(VARIANTS[word] || [])];
  for (const target of targets) {
    if (tokens.includes(target)) return true;
    if (target.length >= 6 && tokens.some((token) => levenshtein(token, target) <= 1)) return true;
    if (target.length >= 5 && tokens.some((token) => token.startsWith(target) && token.length <= target.length + 3)) return true;
  }
  return false;
}

function detectCommand(text) {
  const norm = normalize(text);
  if (/\b(repeat|say (that|it) again|one more time|again please)\b/.test(norm)) return "repeat";
  if (/\b(skip|next (word|one)|pass)\b/.test(norm)) return "skip";
  if (/\b(hint|help|clue)\b/.test(norm)) return "hint";
  if (/\b(i (don'?t|do not) know|no idea|dunno|give up)\b/.test(norm)) return "idk";
  return null;
}

/* ---------------- UI helpers ---------------- */

function setStatus(text, mode) {
  els.status.textContent = text;
  if (mode === "listening") els.status.style.color = "var(--accent)";
  else if (mode === "speaking") els.status.style.color = "var(--violet)";
  else els.status.style.color = "var(--text)";
}

function setOrb(mode) {
  els.orb.classList.toggle("listening", mode === "listening");
  els.orb.classList.toggle("speaking", mode === "speaking");
}

function addBubble(role, text) {
  const empty = els.transcript.querySelector(".empty-note");
  if (empty) empty.remove();
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  els.transcript.appendChild(bubble);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

function updateHud() {
  els.scoreValue.textContent = String(state.score);
  els.streakValue.textContent = String(state.streak);
  els.roundValue.textContent = `${state.answered}/${ROUND_SIZE}`;
  const pct = Math.min(100, (state.answered / ROUND_SIZE) * 100);
  els.progressFill.style.width = `${pct}%`;
  els.progress.setAttribute("aria-valuenow", String(state.answered));
}

function maskWord(word) {
  return word.replace(/[a-z]/gi, "• ").trim();
}

function renderClue(revealed) {
  const word = state.current;
  if (!word) return;
  els.clueTag.textContent = revealed ? "the word" : `clue ${state.index + 1}/${ROUND_SIZE}`;
  els.clueTag.className = revealed ? "tag live" : "tag";
  els.clueWord.textContent = revealed ? word.word : maskWord(word.word);
  els.clueWord.classList.toggle("hidden-word", !revealed);
  els.clueDefinition.textContent = word.definition.charAt(0).toUpperCase() + word.definition.slice(1) + ".";
  els.clueExample.textContent = word.example;
}

function enableTyping(bySystem = false) {
  if (state.typing) {
    state.typingBySystem = bySystem;
    return;
  }
  state.typing = true;
  state.typingBySystem = bySystem;
  els.typeForm.hidden = false;
  els.typeToggle.textContent = "Hide typing";
}

function disableTyping() {
  state.typing = false;
  state.typingBySystem = false;
  els.typeForm.hidden = true;
  els.typeToggle.textContent = "Type instead";
}

/* ---------------- game flow ---------------- */

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// The agent speaks one line; false means a newer turn took over while it talked.
async function say(line, statusText, turn) {
  state.mode = "speaking";
  setStatus(statusText, "speaking");
  setOrb("speaking");
  addBubble("agent", line);
  await speak(line);
  return turn === state.turn;
}

async function startSession() {
  stopSpeaking();
  stopListening();
  state.turn += 1;
  const turn = state.turn;

  state.queue = shuffle(WORDS).slice(0, ROUND_SIZE);
  state.index = 0;
  state.answered = 0;
  state.correct = 0;
  state.score = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.current = null;
  state.mode = "speaking";

  els.transcript.innerHTML = "";
  els.startBtn.textContent = "Restart round";
  updateHud();

  const intro =
    "Hi, I’m Lingo. I’ll describe a word, you say it back. " +
    `There are ${ROUND_SIZE} words in this round. Here we go.`;
  if (!(await say(intro, "Lingo is speaking…", turn))) return;

  await micReady;
  if (turn !== state.turn) return;
  const permission = micPermissionState();
  if (permission === "denied") {
    blockMic(
      "Your browser is blocking the microphone, so I’ve switched on typing. " +
        "Allow it from the address bar (the lock icon) and I’ll pick your voice up mid-round — or just type your answers below."
    );
  } else if (permission === "prompt") {
    addBubble("agent", "Your browser will ask for microphone access — choose Allow so I can hear you.");
  }

  askCurrentWord();
}

async function askCurrentWord() {
  const word = state.queue[state.index];
  state.current = word;
  state.attempts = 0;
  state.wordClosed = false;
  state.mode = "speaking";
  const turn = ++state.turn;

  renderClue(false);
  updateHud();

  const line = `${word.definition.charAt(0).toUpperCase()}${word.definition.slice(1)}. For example: ${word.example} What’s the word?`;
  if (!(await say(line, "Listen to the clue…", turn))) return;

  startListening();
}

async function repeatClue() {
  if (!state.current || state.mode === "over") return;
  stopListening();
  stopSpeaking();
  const word = state.current;
  const turn = ++state.turn;
  const line = `Here it is again. ${word.definition.charAt(0).toUpperCase()}${word.definition.slice(1)}. ${word.example} What’s the word?`;
  if (!(await say(line, "Listen to the clue…", turn))) return;
  startListening();
}

function hintSentence(word) {
  const first = word.word.charAt(0).toUpperCase();
  return `Here’s a hint: it starts with the letter ${first} and has ${word.word.length} letters.`;
}

async function nextWord() {
  state.index += 1;
  if (state.index >= state.queue.length) {
    finishRound();
    return;
  }
  await askCurrentWord();
}

async function handleAnswer(rawText, alternatives, displayText) {
  if (!state.current || state.mode === "over" || state.mode === "judging" || state.wordClosed) return;
  const heard = String(rawText || "").trim();
  if (!heard) return;

  if (state.mode === "listening") stopListening();
  else if (state.mode === "speaking") stopSpeaking();

  state.mode = "judging";
  state.listenRequest += 1;
  state.turn += 1;
  const turn = state.turn;
  const word = state.current;

  addBubble("user", displayText || heard);

  const command = detectCommand(heard);

  if (command === "repeat") {
    els.transcript.lastChild.remove();
    state.mode = "idle";
    await repeatClue();
    return;
  }

  if (command === "skip") {
    state.wordClosed = true;
    state.streak = 0;
    state.answered += 1;
    updateHud();
    renderClue(true);
    const line = `Skipping that one. The word was ${word.word}, meaning ${word.definition}.`;
    if (!(await say(line, "Moving on…", turn))) return;
    nextWord();
    return;
  }

  if (command === "hint" || (command === "idk" && state.attempts === 0)) {
    state.attempts = Math.max(state.attempts, 1);
    const line = `${hintSentence(word)} ${word.definition.charAt(0).toUpperCase()}${word.definition.slice(1)}. What’s the word?`;
    if (!(await say(line, "Here’s a hint…", turn))) return;
    startListening();
    return;
  }

  const candidates = [heard, ...(Array.isArray(alternatives) ? alternatives : [])];
  const correct = candidates.some((candidate) => matchesTarget(candidate, word.word));

  if (correct) {
    const firstTry = state.attempts === 0;
    const gained = firstTry ? 10 : 5;
    state.wordClosed = true;
    state.score += gained;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.answered += 1;
    state.correct += 1;
    updateHud();
    renderClue(true);

    const praise = firstTry
      ? pick(["Nailed it.", "Spot on.", "Exactly right.", "Perfect."])
      : pick(["That’s the one.", "Right, second time lucky.", "Got it."]);
    const line = `${praise} ${word.word}. It means ${word.definition}. ${firstTry ? "Ten points." : "Five points."}`;
    if (!(await say(line, firstTry ? "Correct! 🎯" : "Correct.", turn))) return;
    nextWord();
    return;
  }

  // wrong answer
  state.attempts += 1;
  state.streak = 0;
  updateHud();

  if (state.attempts === 1) {
    const line = `Not quite. ${hintSentence(word)} ${word.definition.charAt(0).toUpperCase()}${word.definition.slice(1)}. ${word.example} What’s the word?`;
    if (!(await say(line, "Not quite — try again.", turn))) return;
    startListening();
    return;
  }

  state.wordClosed = true;
  state.answered += 1;
  updateHud();
  renderClue(true);
  const line = `The word was ${word.word}, meaning ${word.definition}. We’ll keep going.`;
  if (!(await say(line, `The word was “${word.word}”.`, turn))) return;
  nextWord();
}

async function finishRound() {
  state.mode = "over";
  state.turn += 1;
  const correctCount = state.correct;
  const total = state.queue.length;
  const learned = state.queue.map((item) => item.word);

  renderClue(true);
  els.clueTag.textContent = "round complete";
  els.clueTag.className = "tag live";
  els.clueWord.textContent = `${correctCount}/${total}`;
  els.clueWord.classList.remove("hidden-word");
  els.clueDefinition.textContent = `Words from this round: ${learned.join(", ")}.`;
  els.clueExample.textContent = state.bestStreak
    ? `Best streak: ${state.bestStreak} correct in a row.`
    : "Longest streak: none yet — one more go?";

  els.progressFill.style.width = "100%";
  els.startBtn.textContent = "Play again";
  setStatus(`Round complete — ${correctCount} of ${total}.`, "idle");
  setOrb("idle");
  els.liveText.textContent = "";

  addBubble(
    "score",
    `Round complete: ${correctCount}/${total} words correct, ${state.score} points, best streak ${state.bestStreak}.`
  );

  const closing =
    `That’s the round. You got ${correctCount} out of ${total} words and ${state.score} points. ` +
    `You practised ${learned.join(", ")}. Tap play again for five new words.`;
  await speak(closing);
}

/* ---------------- events ---------------- */

els.startBtn.addEventListener("click", () => {
  startSession();
});

els.repeatBtn.addEventListener("click", () => {
  repeatClue();
});

els.skipBtn.addEventListener("click", () => {
  if (!state.current || state.mode === "over") return;
  handleAnswer("skip word", [], "Skip this one");
});

els.orb.addEventListener("click", () => {
  if (state.mode === "over") {
    startSession();
    return;
  }
  if (!state.current) {
    startSession();
    return;
  }
  if (state.mode === "speaking") {
    stopSpeaking();
    startListening();
    return;
  }
  if (state.mode === "listening") {
    stopListening();
    setOrb("idle");
    setStatus("Paused. Tap the mic when you’re ready.", "idle");
    return;
  }
  if (state.mode === "idle") startListening();
});

els.typeToggle.addEventListener("click", () => {
  if (state.typing) disableTyping();
  else {
    enableTyping();
    els.typeInput.focus();
  }
});

// Enter must submit even where implicit form submission doesn't fire.
els.typeInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (typeof els.typeForm.requestSubmit === "function") els.typeForm.requestSubmit();
  else els.typeForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
});

els.typeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = els.typeInput.value.trim();
  if (!value) return;
  els.typeInput.value = "";
  if (!state.current) {
    addBubble("agent", "Tap “Start session” first and I’ll give you a clue.");
    return;
  }
  handleAnswer(value, []);
});

els.muteBtn.addEventListener("click", () => {
  state.muted = !state.muted;
  if (state.muted) stopSpeaking();
  els.muteBtn.textContent = state.muted ? "Unmute agent voice" : "Mute agent voice";
});

window.addEventListener("beforeunload", () => {
  stopSpeaking();
  stopListening();
});

if (!SpeechRecognitionCtor) enableTyping(true);

const micReady = initMicPermission();

updateHud();
