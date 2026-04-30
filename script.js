/* ---------- CONSOLE NAV ---------- */

const launcher = document.getElementById("launcher");
const screens = document.querySelectorAll(".game-screen");

/* ---------- WEB AUDIO: SFX + RETRO BGM ---------- */

const BGM_STORAGE_KEY = "gaming-console-bgm-muted";

let consoleAudioCtx = null;
let sfxBus = null;
let bgmBus = null;
let bgmSourceNode = null;
let bgmBufferCached = null;
let bgmBufferCachedRate = null;
let bgmStarting = false;
let audioUnlocked = false;
let bgmMuted = false;

try {
  bgmMuted = localStorage.getItem(BGM_STORAGE_KEY) === "1";
} catch (_) {
  bgmMuted = false;
}

function ensureAudioGraph() {
  const ACtx = window.AudioContext || window.webkitAudioContext;
  if (!ACtx) return null;
  if (!consoleAudioCtx) {
    consoleAudioCtx = new ACtx();
    sfxBus = consoleAudioCtx.createGain();
    sfxBus.gain.value = 0.92;
    sfxBus.connect(consoleAudioCtx.destination);
    bgmBus = consoleAudioCtx.createGain();
    bgmBus.gain.value = 0;
    bgmBus.connect(consoleAudioCtx.destination);
  }
  return { ctx: consoleAudioCtx, sfxOut: sfxBus, bgmOut: bgmBus };
}

function noteScheduleOffline(ctx, t0, freq, duration, velocity, type = "square") {
  const osc = ctx.createOscillator();
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = type === "square" ? 2400 : 5200;
  filt.Q.value = 0.6;
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  const a = 0.004;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(velocity, t0 + a);
  const sustainEnd = t0 + Math.max(duration - 0.008, a + 0.01);
  g.gain.setValueAtTime(velocity, sustainEnd);
  g.gain.linearRampToValueAtTime(0, t0 + duration);
  osc.connect(filt);
  filt.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

function hatScheduleOffline(ctx, t0, sampleRate, velocity) {
  const len = Math.ceil(0.028 * sampleRate);
  const buf = ctx.createBuffer(1, len, sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++)
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.22));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 5200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(velocity, t0);
  g.gain.exponentialRampToValueAtTime(0.0009, t0 + 0.028);
  src.connect(hp);
  hp.connect(g);
  g.connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + 0.035);
}

function renderRetroBgmBuffer(sampleRate) {
  const bpm = 116;
  const beat = 60 / bpm;
  const nBeats = 8;
  const duration = nBeats * beat;
  const offline = new OfflineAudioContext(
    1,
    Math.ceil(duration * sampleRate),
    sampleRate
  );

  const chords = [
    { root: 110, tri: [220, 261.63, 329.63] },
    { root: 87.31, tri: [174.61, 220, 261.63] },
    { root: 130.81, tri: [261.63, 329.63, 392] },
    { root: 98, tri: [196, 246.94, 293.66] },
  ];

  for (let b = 0; b < nBeats; b++) {
    const ch = chords[Math.floor(b / 2) % 4];
    const t = b * beat;
    noteScheduleOffline(
      offline,
      t,
      ch.root,
      beat * 0.94,
      0.1,
      "square"
    );
    for (let s = 0; s < 2; s++) {
      const tt = t + s * (beat / 2);
      const noteIdx = (b * 2 + s) % 3;
      noteScheduleOffline(
        offline,
        tt,
        ch.tri[noteIdx],
        beat * 0.42,
        0.048,
        "triangle"
      );
    }
    hatScheduleOffline(offline, t + beat * 0.5, sampleRate, 0.035);
  }

  return offline.startRendering();
}

function getBgmBuffer(sampleRate) {
  if (bgmBufferCached && bgmBufferCachedRate === sampleRate)
    return Promise.resolve(bgmBufferCached);
  return renderRetroBgmBuffer(sampleRate).then((buf) => {
    bgmBufferCached = buf;
    bgmBufferCachedRate = sampleRate;
    return buf;
  });
}

function stopBgm() {
  if (bgmSourceNode) {
    try {
      bgmSourceNode.stop();
    } catch (_) {}
    try {
      bgmSourceNode.disconnect();
    } catch (_) {}
    bgmSourceNode = null;
  }
  if (consoleAudioCtx && bgmBus) {
    bgmBus.gain.cancelScheduledValues(consoleAudioCtx.currentTime);
    bgmBus.gain.setValueAtTime(0, consoleAudioCtx.currentTime);
  }
}

async function startBgmIfNeeded() {
  const g = ensureAudioGraph();
  if (!g || bgmMuted || bgmSourceNode || bgmStarting) return;
  bgmStarting = true;
  try {
    await consoleAudioCtx.resume();
    const buffer = await getBgmBuffer(consoleAudioCtx.sampleRate);
    if (bgmMuted || bgmSourceNode) return;
    stopBgm();
    bgmSourceNode = consoleAudioCtx.createBufferSource();
    bgmSourceNode.buffer = buffer;
    bgmSourceNode.loop = true;
    const now = consoleAudioCtx.currentTime;
    bgmBus.gain.cancelScheduledValues(now);
    bgmBus.gain.setValueAtTime(0, now);
    bgmBus.gain.linearRampToValueAtTime(0.14, now + 0.35);
    bgmSourceNode.connect(bgmBus);
    bgmSourceNode.start(0);
  } finally {
    bgmStarting = false;
  }
}

function playCartridgeInsertSound() {
  try {
    unlockAudio();
    const g = ensureAudioGraph();
    if (!g) return;
    const ctx = g.ctx;
    void ctx.resume();
    const out = g.sfxOut;
    const t0 = ctx.currentTime;
    const durNoise = 0.048;

    const noiseBuf = ctx.createBuffer(
      1,
      Math.ceil(ctx.sampleRate * durNoise),
      ctx.sampleRate
    );
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.15;
    bp.frequency.setValueAtTime(3200, t0);
    bp.frequency.exponentialRampToValueAtTime(750, t0 + durNoise);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.07, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.0008, t0 + durNoise);
    noiseSrc.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(out);
    noiseSrc.start(t0);
    noiseSrc.stop(t0 + durNoise + 0.02);

    const thunk = ctx.createOscillator();
    thunk.type = "triangle";
    const thunkGain = ctx.createGain();
    thunk.frequency.setValueAtTime(210, t0 + 0.01);
    thunk.frequency.exponentialRampToValueAtTime(88, t0 + 0.12);
    thunkGain.gain.setValueAtTime(0, t0);
    thunkGain.gain.linearRampToValueAtTime(0.2, t0 + 0.016);
    thunkGain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.15);
    thunk.connect(thunkGain);
    thunkGain.connect(out);
    thunk.start(t0);
    thunk.stop(t0 + 0.16);

    const seat = ctx.createOscillator();
    seat.type = "sine";
    const seatGain = ctx.createGain();
    seat.frequency.setValueAtTime(1350, t0 + 0.006);
    seat.frequency.exponentialRampToValueAtTime(420, t0 + 0.038);
    seatGain.gain.setValueAtTime(0, t0);
    seatGain.gain.linearRampToValueAtTime(0.09, t0 + 0.012);
    seatGain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.052);
    seat.connect(seatGain);
    seatGain.connect(out);
    seat.start(t0);
    seat.stop(t0 + 0.055);
  } catch (_) {
    /* ignore */
  }
}

function syncBgmToggleUi() {
  const btn = document.getElementById("bgm-toggle");
  if (!btn) return;
  const on = !bgmMuted;
  btn.classList.toggle("bgm-toggle--muted", !on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.setAttribute(
    "aria-label",
    on
      ? "Background music on. Click to mute."
      : "Background music muted. Click to play."
  );
}

function setBgmMuted(muted) {
  bgmMuted = muted;
  try {
    if (muted) localStorage.setItem(BGM_STORAGE_KEY, "1");
    else localStorage.removeItem(BGM_STORAGE_KEY);
  } catch (_) {}
  syncBgmToggleUi();
  if (muted) stopBgm();
  else void startBgmIfNeeded();
}

function unlockAudio() {
  if (audioUnlocked) return;
  const g = ensureAudioGraph();
  if (!g) return;
  audioUnlocked = true;
  void g.ctx.resume();
  if (!bgmMuted) void startBgmIfNeeded();
}

document.addEventListener(
  "pointerdown",
  (e) => {
    if (e.target.closest("#bgm-toggle")) return;
    unlockAudio();
  },
  { once: true, capture: true }
);

document.addEventListener(
  "click",
  (e) => {
    if (e.target.closest("#bgm-toggle")) return;
    unlockAudio();
  },
  { once: true, capture: true }
);

document.addEventListener(
  "click",
  (e) => {
    const btn = e.target.closest("button");
    if (!btn || btn.disabled) return;
    if (btn.closest(".minesweeper")) return;
    if (btn.id === "bgm-toggle") return;
    playCartridgeInsertSound();
  },
  true
);

const bgmToggleEl = document.getElementById("bgm-toggle");
if (bgmToggleEl) {
  bgmToggleEl.addEventListener("click", () => {
    if (!audioUnlocked) {
      unlockAudio();
      return;
    }
    setBgmMuted(!bgmMuted);
  });
}
syncBgmToggleUi();

function setActiveGame(id) {
  screens.forEach((el) => {
    const on = el.dataset.screen === id;
    el.hidden = !on;
    el.classList.toggle("active", on);
    el.classList.remove("screen-enter");
  });
  const next = document.querySelector(`[data-screen="${id}"]`);
  if (next && !next.hidden) {
    void next.offsetWidth;
    next.classList.add("screen-enter");
  }
  launcher.querySelectorAll(".cart").forEach((btn) => {
    const on = btn.dataset.game === id;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

launcher.addEventListener("click", (e) => {
  const btn = e.target.closest(".cart");
  if (!btn) return;
  const id = btn.dataset.game;
  if (id) setActiveGame(id);
});

requestAnimationFrame(() => {
  const first = document.querySelector(".game-screen.active");
  if (first && !first.classList.contains("screen-enter")) {
    void first.offsetWidth;
    first.classList.add("screen-enter");
  }
});

/* ---------- SUDOKU ---------- */

const sudoku = document.getElementById("sudoku");

for (let i = 0; i < 81; i++) {
  const r = Math.floor(i / 9);
  const c = i % 9;
  const input = document.createElement("input");
  input.type = "number";
  input.min = 1;
  input.max = 9;
  if (c === 2 || c === 5) input.classList.add("block-right");
  if (r === 2 || r === 5) input.classList.add("block-bottom");
  sudoku.appendChild(input);
}

const sudokuStatusEl = document.getElementById("sudoku-status");

function sudokuReadBoard() {
  const inputs = document.querySelectorAll("#sudoku input");
  const board = [];
  const formatErrors = new Set();
  for (let i = 0; i < 9; i++) {
    board[i] = [];
    for (let j = 0; j < 9; j++) {
      const raw = inputs[i * 9 + j].value.trim();
      if (!raw) {
        board[i][j] = 0;
        continue;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 9) {
        formatErrors.add(`${i},${j}`);
        board[i][j] = 0;
      } else {
        board[i][j] = n;
      }
    }
  }
  return { board, formatErrors };
}

function sudokuFindConflicts(board) {
  const conflicts = new Set();
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const n = board[r][c];
      if (n < 1 || n > 9) continue;
      for (let cc = 0; cc < 9; cc++) {
        if (cc !== c && board[r][cc] === n) {
          conflicts.add(`${r},${c}`);
          conflicts.add(`${r},${cc}`);
        }
      }
      for (let rr = 0; rr < 9; rr++) {
        if (rr !== r && board[rr][c] === n) {
          conflicts.add(`${r},${c}`);
          conflicts.add(`${rr},${c}`);
        }
      }
      const sr = r - (r % 3);
      const sc = c - (c % 3);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const rr = sr + i;
          const cc = sc + j;
          if (rr === r && cc === c) continue;
          if (board[rr][cc] === n) {
            conflicts.add(`${r},${c}`);
            conflicts.add(`${rr},${cc}`);
          }
        }
      }
    }
  }
  return conflicts;
}

function sudokuRefreshValidation() {
  const inputs = document.querySelectorAll("#sudoku input");
  inputs.forEach((el) => {
    el.classList.remove("sudoku-cell-conflict");
    el.removeAttribute("aria-invalid");
  });

  const { board, formatErrors } = sudokuReadBoard();
  const conflicts = sudokuFindConflicts(board);

  for (const key of formatErrors) {
    const [r, c] = key.split(",").map(Number);
    const el = inputs[r * 9 + c];
    el.classList.add("sudoku-cell-conflict");
    el.setAttribute("aria-invalid", "true");
  }
  for (const key of conflicts) {
    const [r, c] = key.split(",").map(Number);
    const el = inputs[r * 9 + c];
    el.classList.add("sudoku-cell-conflict");
    el.setAttribute("aria-invalid", "true");
  }

  const badFormat = formatErrors.size > 0;
  const badConflict = conflicts.size > 0;

  if (sudokuStatusEl) {
    if (!badFormat && !badConflict) {
      sudokuStatusEl.textContent = "";
      sudokuStatusEl.className = "result-msg";
    } else {
      const parts = [];
      if (badFormat)
        parts.push("Each cell must be blank or a whole number from 1 to 9.");
      if (badConflict)
        parts.push(
          "Some digits repeat in the same row, column, or 3×3 box."
        );
      sudokuStatusEl.textContent = parts.join(" ");
      sudokuStatusEl.className = "result-msg result-msg--bad";
    }
  }

  return !badFormat && !badConflict;
}

sudoku.addEventListener("input", sudokuRefreshValidation);

function getBoard() {
  return sudokuReadBoard().board;
}

function setBoard(board) {
  const inputs = document.querySelectorAll("#sudoku input");
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 9; j++) inputs[i * 9 + j].value = board[i][j];
}

function isSafe(board, r, c, n) {
  for (let x = 0; x < 9; x++)
    if (board[r][x] === n || board[x][c] === n) return false;
  const sr = r - (r % 3);
  const sc = c - (c % 3);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if (board[sr + i][sc + j] === n) return false;
  return true;
}

async function solve(board) {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (board[r][c] === 0) {
        for (let n = 1; n <= 9; n++) {
          if (isSafe(board, r, c, n)) {
            board[r][c] = n;
            setBoard(board);
            await new Promise((res) => setTimeout(res, 20));
            if (await solve(board)) return true;
            board[r][c] = 0;
            setBoard(board);
          }
        }
        return false;
      }
  return true;
}

async function solveSudoku() {
  if (!sudokuRefreshValidation()) return;
  const board = getBoard();
  await solve(board);
}

/* ---------- MINESWEEPER ---------- */

const MS_ROWS = 10;
const MS_COLS = 10;
const MS_MINES = 14;

const msBoardEl = document.getElementById("minesweeper");
const msMinesLeftEl = document.getElementById("ms-mines-left");
const msStatusEl = document.getElementById("ms-status");

let msMine = [];
let msAdj = [];
let msRevealed = [];
let msFlagged = [];
let msStarted = false;
let msOver = false;
let msCells = [];

function msInBounds(r, c) {
  return r >= 0 && r < MS_ROWS && c >= 0 && c < MS_COLS;
}

function msIsExcludedFromMines(r, c, safeR, safeC) {
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const nr = safeR + dr;
      const nc = safeC + dc;
      if (nr === r && nc === c) return true;
    }
  return false;
}

function msPlaceMines(safeR, safeC) {
  const cand = [];
  for (let r = 0; r < MS_ROWS; r++)
    for (let c = 0; c < MS_COLS; c++)
      if (!msIsExcludedFromMines(r, c, safeR, safeC)) cand.push([r, c]);

  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cand[i], cand[j]] = [cand[j], cand[i]];
  }

  msMine = Array.from({ length: MS_ROWS }, () => Array(MS_COLS).fill(false));
  for (let k = 0; k < MS_MINES && k < cand.length; k++) {
    const [r, c] = cand[k];
    msMine[r][c] = true;
  }

  msAdj = Array.from({ length: MS_ROWS }, () => Array(MS_COLS).fill(0));
  for (let r = 0; r < MS_ROWS; r++)
    for (let c = 0; c < MS_COLS; c++) {
      if (msMine[r][c]) continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if (dr || dc) {
            const nr = r + dr;
            const nc = c + dc;
            if (msInBounds(nr, nc) && msMine[nr][nc]) n++;
          }
      msAdj[r][c] = n;
    }
}

function msRevealAllMines() {
  for (let r = 0; r < MS_ROWS; r++)
    for (let c = 0; c < MS_COLS; c++) {
      if (!msMine[r][c]) continue;
      const el = msCells[r][c];
      if (!msRevealed[r][c] && !msFlagged[r][c]) {
        el.className = "ms-cell ms-revealed ms-mine-reveal";
        el.textContent = "✦";
      }
    }
}

function msUpdateDom(r, c) {
  const el = msCells[r][c];
  el.className = "ms-cell";

  if (msFlagged[r][c]) {
    el.classList.add("ms-hidden", "ms-flagged");
    el.textContent = "⚑";
    el.setAttribute("aria-label", "Flagged");
    return;
  }
  if (!msRevealed[r][c]) {
    el.classList.add("ms-hidden");
    el.textContent = "";
    el.setAttribute("aria-label", "Hidden cell");
    return;
  }

  el.classList.add("ms-revealed");
  if (msMine[r][c]) {
    el.classList.add("ms-hit");
    el.textContent = "✦";
    el.setAttribute("aria-label", "Mine");
    return;
  }

  const n = msAdj[r][c];
  if (n > 0) {
    el.textContent = String(n);
    el.classList.add("ms-n" + n);
    el.setAttribute("aria-label", n + " adjacent mines");
  } else {
    el.textContent = "";
    el.setAttribute("aria-label", "Empty");
  }
}

function msMinesRemainingLabel(remaining) {
  const n = Math.max(0, remaining);
  return n === 1 ? "1 mine" : `${n} mines`;
}

function msRefreshToolbar() {
  let flags = 0;
  for (let r = 0; r < MS_ROWS; r++)
    for (let c = 0; c < MS_COLS; c++) if (msFlagged[r][c]) flags++;
  msMinesLeftEl.textContent = msMinesRemainingLabel(MS_MINES - flags);
}

function msCheckWin() {
  let revealed = 0;
  for (let r = 0; r < MS_ROWS; r++)
    for (let c = 0; c < MS_COLS; c++) if (msRevealed[r][c]) revealed++;
  if (revealed === MS_ROWS * MS_COLS - MS_MINES) {
    msOver = true;
    msStatusEl.textContent = "You cleared the field — nice!";
    msStatusEl.className = "result-msg ms-status-line result-msg--ok";
    for (let r = 0; r < MS_ROWS; r++)
      for (let c = 0; c < MS_COLS; c++)
        if (msMine[r][c] && !msFlagged[r][c]) {
          const el = msCells[r][c];
          el.className = "ms-cell ms-revealed ms-flag-won";
          el.textContent = "⚑";
        }
  }
}

function msLose(hitR, hitC) {
  msOver = true;
  msStatusEl.textContent = "Mine — game over";
  msStatusEl.className = "result-msg ms-status-line result-msg--bad";
  msRevealAllMines();
  msUpdateDom(hitR, hitC);
}

function msRevealCell(r, c) {
  if (msOver || msFlagged[r][c]) return;

  if (!msStarted) {
    msPlaceMines(r, c);
    msStarted = true;
  }

  if (msRevealed[r][c]) return;

  if (msMine[r][c]) {
    msRevealed[r][c] = true;
    msUpdateDom(r, c);
    msLose(r, c);
    return;
  }

  const stack = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    if (!msInBounds(cr, cc)) continue;
    if (msFlagged[cr][cc]) continue;
    if (msRevealed[cr][cc]) continue;

    msRevealed[cr][cc] = true;
    msUpdateDom(cr, cc);

    if (msAdj[cr][cc] === 0) {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if (dr || dc) stack.push([cr + dr, cc + dc]);
    }
  }

  msRefreshToolbar();
  msCheckWin();
}

function msToggleFlag(r, c) {
  if (msOver || msRevealed[r][c]) return;
  msFlagged[r][c] = !msFlagged[r][c];
  msUpdateDom(r, c);
  msRefreshToolbar();
}

function msNewGame() {
  msStarted = false;
  msOver = false;
  msMine = [];
  msAdj = [];
  msRevealed = Array.from({ length: MS_ROWS }, () => Array(MS_COLS).fill(false));
  msFlagged = Array.from({ length: MS_ROWS }, () => Array(MS_COLS).fill(false));
  msStatusEl.textContent = "";
  msStatusEl.className = "result-msg ms-status-line";
  msMinesLeftEl.textContent = msMinesRemainingLabel(MS_MINES);

  for (let r = 0; r < MS_ROWS; r++)
    for (let c = 0; c < MS_COLS; c++) {
      const el = msCells[r][c];
      el.className = "ms-cell ms-hidden";
      el.textContent = "";
      el.removeAttribute("aria-label");
    }
}

msBoardEl.style.gridTemplateColumns = `repeat(${MS_COLS}, var(--ms-cell))`;

msCells = [];
for (let r = 0; r < MS_ROWS; r++) {
  msCells[r] = [];
  for (let c = 0; c < MS_COLS; c++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "ms-cell ms-hidden";
    cell.dataset.row = String(r);
    cell.dataset.col = String(c);
    cell.addEventListener("click", (e) => {
      e.preventDefault();
      if (msOver) return;
      msRevealCell(r, c);
    });
    cell.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (msOver) return;
      msToggleFlag(r, c);
    });
    msBoardEl.appendChild(cell);
    msCells[r][c] = cell;
  }
}

document.getElementById("ms-new-game").addEventListener("click", () => {
  msNewGame();
});

msNewGame();

/* ---------- CROSSWORD ---------- */

const cwData = {
  cols: 5,
  grid: [
    [1, 1, 1, 1, 1],
    [0, 0, 1, 0, 0],
    [1, 1, 1, 1, 0],
    [0, 0, 0, 1, 0],
    [0, 0, 0, 1, 0],
    [0, 1, 1, 1, 1],
    [0, 0, 0, 1, 0],
  ],
  numbers: { "0,0": 1, "0,2": 2, "2,0": 3, "2,3": 4, "5,1": 5 },
  answers: {
    "0,0": "S",
    "0,1": "T",
    "0,2": "A",
    "0,3": "C",
    "0,4": "K",
    "1,2": "P",
    "2,0": "B",
    "2,1": "Y",
    "2,2": "T",
    "2,3": "E",
    "3,3": "R",
    "4,3": "R",
    "5,1": "L",
    "5,2": "O",
    "5,3": "O",
    "5,4": "P",
    "6,3": "R",
  },
};

/** Each numbered clue: cells row-major within that answer (matches puzzle layout). */
const cwWords = [
  { label: "1 Across", answer: "STACK", cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { label: "2 Down", answer: "APT", cells: [[0, 2], [1, 2], [2, 2]] },
  { label: "3 Across", answer: "BYTE", cells: [[2, 0], [2, 1], [2, 2], [2, 3]] },
  { label: "4 Down", answer: "ERROR", cells: [[2, 3], [3, 3], [4, 3], [5, 3], [6, 3]] },
  { label: "5 Across", answer: "LOOP", cells: [[5, 1], [5, 2], [5, 3], [5, 4]] },
];

const cwDiv = document.getElementById("crossword");
cwDiv.style.gridTemplateColumns = "repeat(" + cwData.cols + ",36px)";

for (let r = 0; r < cwData.grid.length; r++) {
  for (let c = 0; c < cwData.cols; c++) {
    const cell = document.createElement("div");
    cell.className = "cw-cell";

    if (cwData.grid[r][c] === 0) {
      cell.classList.add("black");
    } else {
      cell.classList.add("white");
      const inp = document.createElement("input");
      inp.maxLength = 1;
      inp.dataset.row = r;
      inp.dataset.col = c;
      inp.addEventListener("input", function () {
        this.value = this.value.slice(-1);
        let next = this.parentElement.nextElementSibling;
        while (next && !next.querySelector("input"))
          next = next.nextElementSibling;
        if (next) next.querySelector("input").focus();
      });
      cell.appendChild(inp);
    }

    const num = cwData.numbers[r + "," + c];
    if (num) {
      const span = document.createElement("span");
      span.className = "cw-number";
      span.textContent = num;
      cell.appendChild(span);
    }

    cwDiv.appendChild(cell);
  }
}

function getCwLetter(r, c) {
  const inp = cwDiv.querySelector(`input[data-row="${r}"][data-col="${c}"]`);
  return inp && inp.value ? inp.value.trim().toUpperCase() : "";
}

function checkCrossword() {
  const feedbackEl = document.getElementById("crossword-feedback");
  const lines = [];
  let allOk = true;

  for (const w of cwWords) {
    let typed = "";
    for (const [r, c] of w.cells) {
      typed += getCwLetter(r, c);
    }
    const ok = typed === w.answer;
    if (!ok) allOk = false;
    const detail = ok
      ? "complete"
      : typed.length < w.answer.length
        ? `incomplete ("${typed || "(empty)"}" vs ${w.answer})`
        : `"${typed}" ≠ ${w.answer}`;
    lines.push(`${ok ? "✓" : "✗"} ${w.label}: ${detail}`);
  }

  feedbackEl.innerHTML = lines.map((line) => `<div>${line}</div>`).join("");
  cwDiv.classList.remove("cw-correct", "cw-wrong");
  if (allOk) {
    cwDiv.classList.add("cw-correct");
  } else {
    cwDiv.classList.add("cw-wrong");
    setTimeout(() => cwDiv.classList.remove("cw-wrong"), 500);
  }
}

window.checkCrossword = checkCrossword;

/* ---------- BRACKET STACK ---------- */

const OPEN = "([{";
const CLOSE = ")]}";
const pairs = { ")": "(", "]": "[", "}": "{" };

document.getElementById("stack-run").addEventListener("click", () => {
  const raw = document.getElementById("stack-input").value;
  const traceEl = document.getElementById("stack-trace");
  const resultEl = document.getElementById("stack-result");

  const stack = [];
  const lines = [];
  lines.push("Scan (left → right). Stack is LIFO.");

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const oi = OPEN.indexOf(ch);
    const ci = CLOSE.indexOf(ch);

    if (oi >= 0) {
      stack.push(ch);
      lines.push(`[${i}] '${ch}' → PUSH stack=${JSON.stringify(stack)}`);
    } else if (ci >= 0) {
      const want = pairs[ch];
      const top = stack.length ? stack[stack.length - 1] : null;
      if (top !== want) {
        lines.push(
          `[${i}] '${ch}' → expected '${want}' on top, got ${top === null ? "empty" : "'" + top + "'"} → INVALID`
        );
        traceEl.textContent = lines.join("\n");
        resultEl.textContent = "Not balanced.";
        resultEl.className = "result-msg result-msg--bad";
        return;
      }
      stack.pop();
      lines.push(`[${i}] '${ch}' → POP match stack=${JSON.stringify(stack)}`);
    }
  }

  if (stack.length) {
    lines.push(`End: stack not empty ${JSON.stringify(stack)} → INVALID`);
    traceEl.textContent = lines.join("\n");
    resultEl.textContent = "Not balanced (unclosed opening brackets).";
    resultEl.className = "result-msg result-msg--bad";
    return;
  }

  lines.push("End: stack empty → OK");
  traceEl.textContent = lines.join("\n");
  resultEl.textContent = "Balanced.";
  resultEl.className = "result-msg result-msg--ok";
});

document.getElementById("stack-clear").addEventListener("click", () => {
  document.getElementById("stack-trace").textContent = "";
  document.getElementById("stack-result").textContent = "";
  document.getElementById("stack-result").className = "result-msg";
});

/* ---------- SORT STUDIO ---------- */

const sortBars = document.getElementById("sort-bars");
const sortLog = document.getElementById("sort-log");

function parseNumberList(str) {
  return str
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const n = Number(s);
      if (!Number.isFinite(n)) throw new Error("non-numeric");
      return n;
    });
}

function renderSortBars(arr, hi, lo, extraClass) {
  sortBars.innerHTML = "";
  const max = Math.max(...arr.map(Math.abs), 1);
  arr.forEach((v, i) => {
    const bar = document.createElement("div");
    bar.className = "sort-bar";
    if (i === hi || i === lo) bar.classList.add("sort-bar--focus");
    if (extraClass && extraClass(i)) bar.classList.add(extraClass(i));
    bar.style.height = `${(Math.abs(v) / max) * 100}%`;
    bar.title = String(v);
    sortBars.appendChild(bar);
  });
}

document.getElementById("sort-reset").addEventListener("click", () => {
  sortBars.innerHTML = "";
  sortLog.textContent = "";
});

document.getElementById("sort-run").addEventListener("click", () => {
  sortLog.textContent = "";
  let nums;
  try {
    nums = parseNumberList(document.getElementById("sort-input").value);
  } catch {
    sortLog.textContent = "Use comma-separated integers only.";
    return;
  }
  if (nums.length === 0) {
    sortLog.textContent = "Enter at least one number.";
    return;
  }

  const algo = document.getElementById("sort-algo").value;
  const lines = [];

  if (algo === "insertion") {
    lines.push("Insertion sort: grow sorted prefix [0..i).");
    const a = nums.slice();
    renderSortBars(a);
    for (let i = 1; i < a.length; i++) {
      const key = a[i];
      let j = i - 1;
      lines.push(`i=${i}, key=${key}: shift larger elements right`);
      while (j >= 0 && a[j] > key) {
        lines.push(`  compare a[${j}]=${a[j]} > key → move`);
        a[j + 1] = a[j];
        j--;
      }
      a[j + 1] = key;
      lines.push(`  insert key at j+1=${j + 1}`);
    }
    lines.push("Result: " + JSON.stringify(a));
    renderSortBars(a);
    sortLog.textContent = lines.join("\n");
    return;
  }

  if (algo === "merge") {
    lines.push("Merge sort: recursive split + merge of sorted halves.");
    const a = nums.slice();

    function merge(L, R, left, mid, right) {
      const out = [];
      let i = 0;
      let j = 0;
      while (i < L.length && j < R.length) {
        if (L[i] <= R[j]) {
          lines.push(`merge: pick ${L[i]} from left`);
          out.push(L[i++]);
        } else {
          lines.push(`merge: pick ${R[j]} from right`);
          out.push(R[j++]);
        }
      }
      while (i < L.length) out.push(L[i++]);
      while (j < R.length) out.push(R[j++]);
      for (let k = 0; k < out.length; k++) a[left + k] = out[k];
    }

    function ms(left, right) {
      if (right - left <= 1) return;
      const mid = left + Math.floor((right - left) / 2);
      lines.push(`split [${left},${right}) at mid=${mid}`);
      ms(left, mid);
      ms(mid, right);
      const L = a.slice(left, mid);
      const R = a.slice(mid, right);
      lines.push(`merge ranges [${left},${mid}) and [${mid},${right})`);
      merge(L, R, left, mid, right);
    }

    ms(0, a.length);
    lines.push("Result: " + JSON.stringify(a));
    renderSortBars(a);
    sortLog.textContent = lines.join("\n");
  }
});

/* ---------- BINARY SEARCH ---------- */

let binArr = [];
let binLo = 0;
let binHi = 0;
let binTarget = 0;
/** When true, next "Next step" loads array/target from inputs again. */
let binDone = true;

const binaryVisual = document.getElementById("binary-visual");
const binaryLog = document.getElementById("binary-log");
const binaryStatus = document.getElementById("binary-status");

function renderBinaryVisual() {
  binaryVisual.innerHTML = "";
  binArr.forEach((v, i) => {
    const cell = document.createElement("div");
    cell.className = "bin-cell";
    if (i === binLo || i === binHi) cell.classList.add("bin-cell--bound");
    const val = document.createElement("span");
    val.className = "bin-val";
    val.textContent = String(v);
    const idx = document.createElement("span");
    idx.className = "bin-idx";
    idx.textContent = String(i);
    cell.appendChild(val);
    cell.appendChild(idx);
    binaryVisual.appendChild(cell);
  });
}

function binaryReset() {
  binaryLog.textContent = "";
  binaryStatus.textContent = "";
  binaryStatus.className = "result-msg";
  binaryVisual.innerHTML = "";
  binArr = [];
  binDone = true;
}

document.getElementById("binary-reset").addEventListener("click", () => {
  binaryReset();
});

document.getElementById("binary-step").addEventListener("click", () => {
  if (binArr.length === 0 || binDone) {
    let arr;
    try {
      arr = parseNumberList(document.getElementById("binary-array").value);
    } catch {
      binaryStatus.textContent = "Invalid array (comma-separated integers).";
      binaryStatus.className = "result-msg result-msg--bad";
      return;
    }
    const tRaw = document.getElementById("binary-target").value.trim();
    const target = Number(tRaw);
    if (!Number.isFinite(target)) {
      binaryStatus.textContent = "Enter a numeric target.";
      binaryStatus.className = "result-msg result-msg--bad";
      return;
    }
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] < arr[i - 1]) {
        binaryStatus.textContent =
          "Array must be sorted in non-decreasing order.";
        binaryStatus.className = "result-msg result-msg--bad";
        return;
      }
    }
    if (arr.length === 0) {
      binaryStatus.textContent = "Enter at least one integer in the array.";
      binaryStatus.className = "result-msg result-msg--bad";
      return;
    }
    binArr = arr;
    binTarget = target;
    binLo = 0;
    binHi = arr.length - 1;
    binDone = false;
    binaryLog.textContent =
      `Init: search [${binLo}, ${binHi}] for ${binTarget} in ` +
      JSON.stringify(binArr) +
      "\nClick Next step again to compare at mid.";
    binaryStatus.textContent = "Step through…";
    binaryStatus.className = "result-msg";
    renderBinaryVisual();
    return;
  }

  if (binArr.length === 0) {
    binaryStatus.textContent = "Load array and target, then use Next step.";
    return;
  }

  if (binLo > binHi) {
    binaryLog.textContent += "\nNot found (empty range).";
    binaryStatus.textContent = "Target not in array.";
    binaryStatus.className = "result-msg result-msg--bad";
    binDone = true;
    return;
  }

  const mid = binLo + Math.floor((binHi - binLo) / 2);
  const midVal = binArr[mid];
  binaryLog.textContent += `\nStep: lo=${binLo}, hi=${binHi}, mid=${mid}, a[mid]=${midVal}`;

  if (midVal === binTarget) {
    binaryStatus.textContent = `Found at index ${mid}.`;
    binaryStatus.className = "result-msg result-msg--ok";
    binDone = true;
    renderBinaryVisual();
    return;
  }
  if (midVal < binTarget) {
    binaryLog.textContent += ` → ${midVal} < ${binTarget}, go right: lo=${mid + 1}`;
    binLo = mid + 1;
  } else {
    binaryLog.textContent += ` → ${midVal} > ${binTarget}, go left: hi=${mid - 1}`;
    binHi = mid - 1;
  }
  renderBinaryVisual();

  if (binLo > binHi) {
    binaryLog.textContent += "\nNot found (empty range).";
    binaryStatus.textContent = "Target not in array.";
    binaryStatus.className = "result-msg result-msg--bad";
    binDone = true;
  }
});
