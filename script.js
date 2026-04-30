/* ---------- CONSOLE NAV ---------- */

const launcher = document.getElementById("launcher");
const screens = document.querySelectorAll(".game-screen");

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

function getBoard() {
  const inputs = document.querySelectorAll("#sudoku input");
  const board = [];
  for (let i = 0; i < 9; i++) {
    board[i] = [];
    for (let j = 0; j < 9; j++) {
      const val = inputs[i * 9 + j].value;
      board[i][j] = val ? parseInt(val, 10) : 0;
    }
  }
  return board;
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

function msRefreshToolbar() {
  let flags = 0;
  for (let r = 0; r < MS_ROWS; r++)
    for (let c = 0; c < MS_COLS; c++) if (msFlagged[r][c]) flags++;
  msMinesLeftEl.textContent = String(Math.max(0, MS_MINES - flags));
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
  msMinesLeftEl.textContent = String(MS_MINES);

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
