// ─── FIREBASE SETUP ───────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, push, remove }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
// ACTION_CARDS loaded from cards.json at startup (see initCards below)

const firebaseConfig = {
  apiKey: "AIzaSyAuxxoHSL9OR88BG-c6C8I-Q5HJh4fuSnE",
  authDomain: "on-a-scale-of-1-to-top.firebaseapp.com",
  databaseURL: "https://on-a-scale-of-1-to-top-default-rtdb.firebaseio.com",
  projectId: "on-a-scale-of-1-to-top",
  storageBucket: "on-a-scale-of-1-to-top.firebasestorage.app",
  messagingSenderId: "1071927649754",
  appId: "1:1071927649754:web:293cefcb2feae100d3cce3",
  measurementId: "G-TR6R0KF8CB"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// ─── STATE ────────────────────────────────────────────────────────────────────
let ACTION_CARDS = null;
let myId = null;
let myName = "";
let roomCode = "";
let isHost = false;
let gameState = null;
let selectedGuesses = new Set();
let hasSubmittedGuess = false;
let hasVotedOn = {};        // { red: true/false, yellow: true/false, blue: true/false }
let calledVoteOn = {};      // colors this player called a vote on this round
let unsubscribes = [];

// ─── LOAD CARDS FROM JSON ────────────────────────────────────────────────────
async function initCards() {
  const res = await fetch("./cards.json");
  ACTION_CARDS = await res.json();
}

// Boot: load cards then expose functions
initCards().then(() => {
  window.goToCreate = goToCreate;
  window.goToJoin = goToJoin;
  window.startGame = startGame;
  window.callRedrawVote = callRedrawVote;
  window.castVote = castVote;
  window.advanceToGuessing = advanceToGuessing;
  window.toggleGuess = toggleGuess;
  window.submitGuesses = submitGuesses;
  window.nextRound = nextRound;
  window.endGame = endGame;
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById("screen-" + id).classList.add("active");
}

function showError(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

function randomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomCards() {
  return {
    red: pickRandom(ACTION_CARDS.red),
    yellow: pickRandom(ACTION_CARDS.yellow),
    blue: pickRandom(ACTION_CARDS.blue),
  };
}

function assignIntensityCards(players) {
  const cards = {};
  const colors = ["red", "yellow", "blue"];
  Object.keys(players).forEach(pid => {
    cards[pid] = {
      level: Math.floor(Math.random() * 10) + 1,
      color: colors[Math.floor(Math.random() * 3)],
    };
  });
  return cards;
}

// ─── LANDING ─────────────────────────────────────────────────────────────────
async function goToCreate() {
  const name = document.getElementById("player-name").value.trim();
  if (!name) return showError("landing-error", "Please enter your name.");

  myName = name;
  myId = push(ref(db, "tmp")).key;
  roomCode = randomCode();
  isHost = true;

  await set(ref(db, `rooms/${roomCode}`), {
    host: myId,
    status: "waiting",
    totalRounds: 5,
    currentRound: 0,
    players: {
      [myId]: { name: myName, score: 10, online: true }
    }
  });

  enterWaitingRoom();
}

async function goToJoin() {
  const name = document.getElementById("player-name").value.trim();
  const code = document.getElementById("join-code").value.trim().toUpperCase();
  if (!name) return showError("landing-error", "Please enter your name.");
  if (!code) return showError("landing-error", "Please enter a room code.");

  const snap = await get(ref(db, `rooms/${code}`));
  if (!snap.exists()) return showError("landing-error", "Room not found. Check the code.");
  if (snap.val().status !== "waiting") return showError("landing-error", "Game already started.");

  myName = name;
  myId = push(ref(db, "tmp")).key;
  roomCode = code;
  isHost = false;

  await set(ref(db, `rooms/${roomCode}/players/${myId}`), {
    name: myName, score: 10, online: true
  });

  enterWaitingRoom();
}

// ─── WAITING ROOM ─────────────────────────────────────────────────────────────
function enterWaitingRoom() {
  showScreen("waiting");
  document.getElementById("display-room-code").textContent = roomCode;

  if (isHost) {
    document.getElementById("host-controls").classList.remove("hidden");
  } else {
    document.getElementById("guest-waiting").classList.remove("hidden");
  }

  const unsub = onValue(ref(db, `rooms/${roomCode}`), snap => {
    if (!snap.exists()) return;
    const room = snap.val();
    renderPlayerList(room.players, room.host);

    // If game started, move to game screen (for all players including host)
    if (room.status === "playing" && document.getElementById("screen-waiting").classList.contains("active")) {
      gameState = room;
      enterGameScreen();
    }
  });
  unsubscribes.push(unsub);
}

function renderPlayerList(players, hostId) {
  const list = document.getElementById("player-list");
  const count = Object.keys(players || {}).length;
  document.getElementById("player-count").textContent = count;
  list.innerHTML = Object.entries(players || {}).map(([pid, p]) => `
    <div class="player-chip">
      ${pid === hostId ? '<span class="crown">👑</span>' : '<span class="crown">👤</span>'}
      <span>${p.name}${pid === myId ? " (you)" : ""}</span>
      <span class="ready-dot online"></span>
    </div>
  `).join("");
}

async function startGame() {
  const players = (await get(ref(db, `rooms/${roomCode}/players`))).val();
  if (Object.keys(players).length < 2) {
    return showError("start-error", "Need at least 2 players to start.");
  }
  const totalRounds = parseInt(document.getElementById("rounds-input").value) || 5;
  // First update status so all players enter game screen
  await update(ref(db, `rooms/${roomCode}`), {
    status: "playing",
    totalRounds,
    currentRound: 1,
  });
  // Small delay to let listeners attach before writing round data
  await new Promise(r => setTimeout(r, 800));
  await startRound(players, 1);
}

// ─── GAME ────────────────────────────────────────────────────────────────────
async function startRound(players, roundNum) {
  const intensityCards = assignIntensityCards(players);
  const actionCards = pickRandomCards();

  await update(ref(db, `rooms/${roomCode}`), {
    phase: "action",
    currentRound: roundNum,
    intensityCards,
    actionCards,
    votes: {},
    guesses: {},
    redrawVotes: {},
    redrawUsed: { red: false, yellow: false, blue: false },
  });
}

function enterGameScreen() {
  // Unsubscribe waiting room listener
  unsubscribes.forEach(u => u());
  unsubscribes = [];

  showScreen("game");
  selectedGuesses = new Set();
  hasSubmittedGuess = false;
  hasVotedOn = {};
  calledVoteOn = {};

  const unsub = onValue(ref(db, `rooms/${roomCode}`), snap => {
    if (!snap.exists()) return;
    gameState = snap.val();
    renderGameScreen(gameState);
  });
  unsubscribes.push(unsub);
}

function renderGameScreen(room) {
  // Top bar
  document.getElementById("current-round").textContent = room.currentRound;
  document.getElementById("total-rounds").textContent = room.totalRounds;
  document.getElementById("phase-label").textContent =
    room.phase === "action" ? "🎭 Perform & Vote" :
    room.phase === "guessing" ? "🤔 Submit Guesses" :
    room.phase === "reveal" ? "👀 Reveal" : room.phase;

  // Scores
  const scoresRow = document.getElementById("scores-row");
  const sorted = Object.entries(room.players || {}).sort((a,b) => b[1].score - a[1].score);
  scoresRow.innerHTML = `<span style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--ink-light);margin-right:6px;align-self:center;">Scores</span>`
    + sorted.map(([pid, p]) => `
      <span class="score-chip ${pid === myId ? 'me' : ''}">
        ${p.name}: ${p.score}
      </span>
    `).join("");

  // My intensity card
  const myCard = room.intensityCards?.[myId];
  if (myCard) {
    const cardEl = document.getElementById("my-intensity-card");
    cardEl.className = `intensity-card ${myCard.color}`;
    document.getElementById("my-intensity-number").textContent = myCard.level;
    document.getElementById("my-intensity-label").textContent =
      `Color: ${myCard.color.charAt(0).toUpperCase() + myCard.color.slice(1)}`;
  }

  // Action cards
  const ac = room.actionCards || {};
  ["red", "yellow", "blue"].forEach(color => {
    document.getElementById(`action-text-${color}`).textContent = ac[color] || "...";
    const btn = document.getElementById(`redraw-btn-${color}`);
    const used = room.redrawUsed?.[color];
    btn.disabled = used || calledVoteOn[color] || room.phase !== "action";
    btn.textContent = used ? "Redrawn" : calledVoteOn[color] ? "Vote Called" : "Vote to Redraw";
  });

  // Redraw vote banners
  renderVoteBanners(room);

  // Phase-specific UI
  const hostAdvance = document.getElementById("host-advance-panel");
  if (room.phase === "action") {
    document.getElementById("guess-panel").classList.add("hidden");
    if (isHost) hostAdvance.classList.remove("hidden");
    else hostAdvance.classList.add("hidden");
  } else if (room.phase === "guessing") {
    hostAdvance.classList.add("hidden");
    document.getElementById("guess-panel").classList.remove("hidden");
    renderGuessPanel(room);
  } else if (room.phase === "reveal") {
    hostAdvance.classList.add("hidden");
    renderReveal(room);
  }
}

// ─── REDRAW VOTING ────────────────────────────────────────────────────────────
async function callRedrawVote(color) {
  if (calledVoteOn[color]) return;
  calledVoteOn[color] = true;

  await update(ref(db, `rooms/${roomCode}/redrawVotes/${color}`), {
    calledBy: myId,
    calledByName: myName,
    votes: {},
    status: "open",
  });
}

function renderVoteBanners(room) {
  const container = document.getElementById("vote-banners");
  const redrawVotes = room.redrawVotes || {};
  const players = room.players || {};
  const totalPlayers = Object.keys(players).length;

  let html = "";
  ["red", "yellow", "blue"].forEach(color => {
    const voteData = redrawVotes[color];
    if (!voteData || voteData.status !== "open") return;
    if (voteData.calledBy === myId) {
      html += `<div class="vote-banner" style="margin-bottom:8px;">
        <span class="vote-banner-text">You called a vote to redraw the <strong>${color}</strong> card. Waiting for votes...</span>
      </div>`;
      return;
    }
    if (hasVotedOn[color]) {
      const yesCount = Object.values(voteData.votes || {}).filter(v => v === "yes").length;
      html += `<div class="vote-banner" style="margin-bottom:8px;">
        <span class="vote-banner-text">You voted on the <strong>${color}</strong> redraw. (${yesCount} yes votes so far)</span>
      </div>`;
      return;
    }
    html += `<div class="vote-banner" style="margin-bottom:8px;">
      <span class="vote-banner-text"><strong>${voteData.calledByName}</strong> wants to redraw the <strong>${color}</strong> action card.</span>
      <div class="vote-actions">
        <button class="vote-yes" onclick="castVote('${color}','yes')">Yes</button>
        <button class="vote-no" onclick="castVote('${color}','no')">No</button>
      </div>
    </div>`;
  });

  container.innerHTML = html;
}

async function castVote(color, vote) {
  if (hasVotedOn[color]) return;
  hasVotedOn[color] = true;

  await update(ref(db, `rooms/${roomCode}/redrawVotes/${color}/votes`), {
    [myId]: vote
  });

  // Check if vote threshold met — only host tallies to avoid race conditions
  if (!isHost) return;
  const snap = await get(ref(db, `rooms/${roomCode}`));
  const room = snap.val();
  const players = room.players || {};
  const totalPlayers = Object.keys(players).length;
  const voteData = room.redrawVotes?.[color];
  if (!voteData) return;

  const votes = Object.values(voteData.votes || {});
  const callerExcluded = totalPlayers - 1;
  const yesCount = votes.filter(v => v === "yes").length;
  const noCount = votes.filter(v => v === "no").length;

  // Wait until everyone (except caller) has voted
  if (votes.length < callerExcluded) return;

  if (yesCount >= Math.ceil(callerExcluded * 0.5)) {
    // Redraw
    const newCard = pickRandom(ACTION_CARDS[color]);
    await update(ref(db, `rooms/${roomCode}`), {
      [`actionCards/${color}`]: newCard,
      [`redrawUsed/${color}`]: true,
      [`redrawVotes/${color}/status`]: "done",
    });
  } else {
    await update(ref(db, `rooms/${roomCode}/redrawVotes/${color}`), { status: "done" });
  }
}

// ─── ADVANCE TO GUESSING ───────────────────────────────────────────────────────
// Host-only button to advance from action phase to guessing phase
async function advanceToGuessing() {
  await update(ref(db, `rooms/${roomCode}`), { phase: "guessing" });
}

// ─── GUESSING ─────────────────────────────────────────────────────────────────
function renderGuessPanel(room) {
  const grid = document.getElementById("players-guess-grid");
  const submitBtn = document.getElementById("submit-btn");
  const statusEl = document.getElementById("submit-status");

  if (hasSubmittedGuess) {
    submitBtn.classList.add("hidden");
    statusEl.classList.remove("hidden");
    const submitted = Object.keys(room.guesses || {}).length;
    const total = Object.keys(room.players || {}).length;
    statusEl.textContent = `Waiting for other players... (${submitted}/${total} submitted)`;

    if (submitted >= total && isHost) {
      revealRound(room);
    }
    return;
  }

  submitBtn.classList.remove("hidden");
  statusEl.classList.add("hidden");

  grid.innerHTML = Object.entries(room.players || {})
    .filter(([pid]) => pid !== myId)
    .map(([pid, p]) => `
      <div class="player-guess-card ${selectedGuesses.has(pid) ? 'selected' : ''}"
           onclick="toggleGuess('${pid}')">
        <div class="guess-check">${selectedGuesses.has(pid) ? '✅' : '👤'}</div>
        <div class="player-guess-name">${p.name}</div>
      </div>
    `).join("");
}

function toggleGuess(pid) {
  if (hasSubmittedGuess) return;
  if (selectedGuesses.has(pid)) {
    selectedGuesses.delete(pid);
  } else {
    selectedGuesses.add(pid);
  }
  renderGuessPanel(gameState);
}

async function submitGuesses() {
  hasSubmittedGuess = true;
  const guessArray = Array.from(selectedGuesses);
  await set(ref(db, `rooms/${roomCode}/guesses/${myId}`), guessArray.length ? guessArray : ["__none__"]);
  renderGuessPanel(gameState);
}

// ─── REVEAL ────────────────────────────────────────────────────────────────────
async function revealRound(room) {
  if (!isHost) return;
  const scores = calculateScores(room);
  const updates = {};
  Object.entries(scores).forEach(([pid, delta]) => {
    const current = room.players[pid].score;
    updates[`players/${pid}/score`] = current + delta;
  });
  updates.phase = "reveal";
  updates.scoreDelta = scores;
  await update(ref(db, `rooms/${roomCode}`), updates);
}

function calculateScores(room) {
  const intensityCards = room.intensityCards || {};
  const guesses = room.guesses || {};
  const players = room.players || {};
  const delta = {};
  Object.keys(players).forEach(pid => delta[pid] = 0);

  Object.entries(guesses).forEach(([guesserPid, targets]) => {
    if (!Array.isArray(targets)) return;
    targets.forEach(targetPid => {
      if (targetPid === "__none__") return;
      const guesserLevel = intensityCards[guesserPid]?.level;
      const targetLevel = intensityCards[targetPid]?.level;
      if (guesserLevel == null || targetLevel == null) return;

      const diff = Math.abs(guesserLevel - targetLevel);
      if (diff === 0) {
        // Exact match — both get +1
        delta[guesserPid] = (delta[guesserPid] || 0) + 1;
        delta[targetPid] = (delta[targetPid] || 0) + 1;
      } else if (diff === 1) {
        // One off — no change (0 points, already 0)
      } else {
        // Off by 2+ — guesser loses 1
        delta[guesserPid] = (delta[guesserPid] || 0) - 1;
      }
    });
  });

  return delta;
}

function renderReveal(room) {
  showScreen("reveal");
  document.getElementById("reveal-round").textContent = room.currentRound;

  const intensityCards = room.intensityCards || {};
  const players = room.players || {};
  const delta = room.scoreDelta || {};

  // Card reveal grid
  document.getElementById("reveal-grid").innerHTML = Object.entries(players)
    .map(([pid, p]) => {
      const card = intensityCards[pid] || {};
      const d = delta[pid] || 0;
      const deltaClass = d > 0 ? "delta-plus" : d < 0 ? "delta-minus" : "delta-zero";
      const deltaText = d > 0 ? `+${d} point` : d < 0 ? `${d} point` : "No change";
      return `
        <div class="reveal-card ${card.color || 'blue'}">
          <div class="reveal-player-name">${p.name}${pid === myId ? " (you)" : ""}</div>
          <div class="reveal-level">${card.level || "?"}</div>
          <div style="font-size:11px;color:var(--ink-mid);">${(card.color || "").toUpperCase()}</div>
          <div class="reveal-delta ${deltaClass}">${deltaText}</div>
        </div>
      `;
    }).join("");

  // Leaderboard
  const sorted = Object.entries(players).sort((a,b) => b[1].score - a[1].score);
  document.getElementById("reveal-leaderboard").innerHTML = sorted
    .map(([pid, p], i) => `
      <div class="lb-row ${i === 0 ? 'winner' : ''}">
        <span class="lb-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i+1}</span>
        <span class="lb-name">${p.name}${pid === myId ? " (you)" : ""}</span>
        <span class="lb-score">${p.score}</span>
      </div>
    `).join("");

  // Controls
  const controls = document.getElementById("reveal-controls");
  if (isHost) {
    const isLast = room.currentRound >= room.totalRounds;
    controls.innerHTML = isLast
      ? `<button class="btn btn-primary" onclick="endGame()">See Final Results</button>`
      : `<button class="btn btn-primary" onclick="nextRound()">Next Round →</button>`;
  } else {
    controls.innerHTML = `<p class="status-text waiting-pulse">Waiting for host...</p>`;
  }
}

async function nextRound() {
  const snap = await get(ref(db, `rooms/${roomCode}`));
  const room = snap.val();
  const nextRound = room.currentRound + 1;

  // Reset per-round state
  selectedGuesses = new Set();
  hasSubmittedGuess = false;
  hasVotedOn = {};
  calledVoteOn = {};

  showScreen("game");
  await startRound(room.players, nextRound);
}

async function endGame() {
  await update(ref(db, `rooms/${roomCode}`), { status: "finished", phase: "final" });
  showFinalScreen();
}

function showFinalScreen() {
  showScreen("final");
  const players = gameState?.players || {};
  const sorted = Object.entries(players).sort((a,b) => b[1].score - a[1].score);
  document.getElementById("final-leaderboard").innerHTML = sorted
    .map(([pid, p], i) => `
      <div class="lb-row ${i === 0 ? 'winner' : ''}">
        <span class="lb-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i+1}</span>
        <span class="lb-name">${p.name}${pid === myId ? " (you)" : ""}</span>
        <span class="lb-score">${p.score}</span>
      </div>
    `).join("");
}

// Listen for game-wide phase changes (for non-host players)
function listenForPhaseChanges() {
  onValue(ref(db, `rooms/${roomCode}/phase`), snap => {
    const phase = snap.val();
    if (phase === "reveal" && gameState) renderReveal(gameState);
    if (phase === "final") showFinalScreen();
  });
}

// Functions exposed to HTML via initCards().then() above
