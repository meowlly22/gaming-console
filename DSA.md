# Data structures & algorithms in **Gaming Console**

This project is a static **HTML / CSS / JavaScript** “console” of small games. The interesting computer-science material lives almost entirely in [`script.js`](script.js). Below is a concise map of **which structures and algorithms** each mode uses, **how** they show up in the code, and **why** they are the right tool.

---

## Quick reference

| Cartridge        | Main ideas | Where in `script.js` |
|------------------|------------|----------------------|
| Sudoku           | 2D array, **backtracking**, constraint checks | `getBoard` … `solveSudoku` |
| Minesweeper      | 2D boolean/count arrays, **random permutation**, **stack-based flood fill** | `MS_ROWS` … `msNewGame` |
| Crossword        | 2D layout grid, **string-keyed maps**, **word = list of coordinates** | `cwData` … `checkCrossword` |
| Bracket Stack    | **Stack (LIFO)**, delimiter matching | `OPEN` … stack validator |
| Sort Studio      | **Insertion sort**, **merge sort** (split + merge) | `sort-run` handler |
| Binary Search    | **Sorted array**, **two pointers** `lo` / `hi`, halving | `binArr` … `binary-step` |

---

## Sudoku solver — backtracking on a 2D grid

**Data structure:** `board` is a **9×9 matrix** (array of rows, each row an array of integers). Empty cells are `0`.

**Algorithm:**

1. **`isSafe(board, r, c, n)`** — before placing digit `n` at `(r, c)`, verify **row**, **column**, and **3×3 box** constraints in **O(1)** per check with simple loops over fixed-size ranges (9 or 3×3).
2. **`solve(board)`** — **recursive backtracking**:
   - Scan for the first empty cell `(r, c)`.
   - For digits `1..9`, if `isSafe`, **assign** and **recurse**.
   - If recursion fails, **undo** (`board[r][c] = 0`) and try the next digit — classic “try, recurse, backtrack.”
   - If no empty cells remain, the board is complete → **success**.

**Concepts:** **Constraint satisfaction**, **depth-first search** over the assignment space, **backtracking** when a partial assignment cannot extend to a solution.

**Complexity (worst case):** exponential in the number of blanks (Sudoku is NP-complete in general); `isSafe` keeps each branch’s local work small.

```75:103:script.js
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
```

*(The `async` / `await` calls only slow the search for animation; the logic is standard backtracking.)*

---

## Minesweeper — grids, shuffling, neighbor counts, flood fill

**Data structures (all 2D, same dimensions):**

- `msMine[r][c]` — **boolean** “is this cell a mine?”
- `msAdj[r][c]` — **integer** 0–8, number of mines in the **8 neighbors**
- `msRevealed[r][c]`, `msFlagged[r][c]` — game state per cell

**Algorithms / ideas:**

1. **First-click safety** — mines are placed **after** the first reveal. Candidate cells are all positions **outside** the 3×3 neighborhood of the first click (`msIsExcludedFromMines`), so the opening click never lands on a mine and (in this build) the whole 3×3 block is mine-free.
2. **Random mine placement** — build a **list of coordinates** `cand`, then **shuffle** with the **Fisher–Yates** loop (swap each index with a random earlier one), then take the first `MS_MINES` entries. That yields a **uniform random subset** of allowed cells.
3. **Adjacency counts** — for each non-mine cell, **count** neighboring mines by nested loops over `dr, dc ∈ {-1,0,1}` (skipping `(0,0)`). This is **O(rows × cols × 9)** = **O(n)** for fixed neighborhood size.
4. **Revealing empty regions** — when you open a cell with **0** adjacent mines, the code expands using an **explicit stack** (`while (stack.length) { pop; reveal; if count 0, push all 8 neighbors }`). That is **depth-first flood fill** on the grid of safe cells; each cell is revealed at most once, so the work is **O(number of cells opened)** in that component.
5. **Win condition** — count revealed cells; win when `revealed === rows×cols − mineCount` (all non-mine cells opened).

**Concepts:** **2D array indexing**, **random permutation**, **local neighborhood / convolution-style counting**, **graph traversal** (implicit grid graph) via **stack (DFS)**.

```142:172:script.js
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
```

```273:288:script.js
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
```

---

## Crossword — layout matrix + answer map + word lists

**Data structures:**

- **`cwData.grid`** — 2D **0/1** (or truthy) layout: which cells are blacked out vs playable. This is a static **bitmap** of the puzzle shape.
- **`cwData.answers`** — **map** from `"row,col"` string keys to the correct letter. Conceptually a **sparse dictionary** over coordinates (only white cells that matter are stored).
- **`cwWords`** — each clue is a **string** `answer` plus an ordered **list of `[r,c]` pairs** — the **path** of that word through the grid. Shared cells (e.g. a letter belonging to both an across and a down) simply appear in two word definitions.

**Algorithm (`checkCrossword`):** for each word, **concatenate** letters by reading inputs at the listed coordinates, then **compare** to the expected string (exact match, case-normalized). Report per-word success/failure.

**Concepts:** **2D indexing**, **symbol tables / maps** for answers, **strings as sequences**, **validation** over structured data.

```388:458:script.js
const cwWords = [
  { label: "1 Across", answer: "STACK", cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { label: "2 Down", answer: "APT", cells: [[0, 2], [1, 2], [2, 2]] },
  // ...
];

function checkCrossword() {
  // ...
  for (const w of cwWords) {
    let typed = "";
    for (const [r, c] of w.cells) {
      typed += getCwLetter(r, c);
    }
    const ok = typed === w.answer;
    // ...
  }
}
```

---

## Bracket Stack — LIFO stack for balanced delimiters

**Data structure:** `stack` is a **JavaScript array** used only with **`push`** (end) and **`pop`** / peek at the **last element** — i.e. a **stack**: Last-In-First-Out.

**Algorithm:** Single **left-to-right scan** of the input string:

- Opening bracket `( [ {` → **push** onto the stack.
- Closing bracket → look up the required opening partner with a **map** `pairs` (e.g. `')' → '('`). If the **top** of the stack is not that partner, **reject**. Otherwise **pop**.
- Non-bracket characters are ignored.
- After the scan, if the stack is **non-empty**, some opener was never closed → **reject**.

**Concepts:** **Stack**, **parenthesis / delimiter languages**, typical **parser** primitive for nested structure.

**Why a stack:** The **most recent** unmatched opener must pair with the **next** matching closer — perfect LIFO behavior.

```483:508:script.js
  const stack = [];
  // ...
    if (oi >= 0) {
      stack.push(ch);
      lines.push(`[${i}] '${ch}' → PUSH stack=${JSON.stringify(stack)}`);
    } else if (ci >= 0) {
      const want = pairs[ch];
      const top = stack.length ? stack[stack.length - 1] : null;
      if (top !== want) {
        // ...
        return;
      }
      stack.pop();
      lines.push(`[${i}] '${ch}' → POP match stack=${JSON.stringify(stack)}`);
    }
```

---

## Sort Studio — insertion sort and merge sort

Both algorithms operate on a **1D array** (copy of user input).

### Insertion sort

**Idea:** Maintain a **sorted prefix** `[0 .. i-1]`. For each new element `key = a[i]`, shift larger elements **right** one slot until you find the insertion point, then write `key`.

**Properties:** **In-place** (only a few extra variables), **stable** in typical implementations, **O(n²)** comparisons in the worst case for reverse-sorted input.

**Concept:** Reduce “sort whole array” to **extending a sorted subarray** one element at a time.

### Merge sort

**Idea (divide and conquer):**

1. **Split** the current segment `[left, right)` at `mid`.
2. **Recurse** on `[left, mid)` and `[mid, right)` until segments of length 1 (trivially sorted).
3. **Merge** two sorted halves into one sorted range by comparing **front elements** of left and right temporary arrays — classic **two-pointer merge** into output.

**Properties:** **O(n log n)** time in the worst case (for typical implementations), uses **O(n)** extra space for the slices / merge buffer in this code.

```611:639:script.js
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
```

---

## Binary Search — sorted array + invariant on `[lo, hi]`

**Precondition:** The user’s array must be **non-decreasing** (verified in a simple **linear scan** before search starts — **O(n)** validation, not part of the binary search itself).

**Data structure:** `binArr` — **sorted 1D array**; two **integer indices** `binLo` and `binHi` bound the **remaining search interval** (inclusive).

**Algorithm (per step):**

- `mid = lo + floor((hi - lo) / 2)` — avoids overflow compared to `(lo+hi)/2` in some languages.
- If `a[mid] === target` → **found**.
- If `a[mid] < target` → discard left half: `lo = mid + 1`.
- Else → discard right half: `hi = mid - 1`.
- If `lo > hi` → **empty range**, target absent.

**Concepts:** **Divide search space by half** each step → **O(log n)** steps; relies entirely on **sorted order** and the **transitive** comparison property.

```750:767:script.js
  const mid = binLo + Math.floor((binHi - binLo) / 2);
  const midVal = binArr[mid];
  binaryLog.textContent += `\nStep: lo=${binLo}, hi=${binHi}, mid=${mid}, a[mid]=${midVal}`;

  if (midVal === binTarget) {
    binaryStatus.textContent = `Found at index ${mid}.`;
    // ...
    return;
  }
  if (midVal < binTarget) {
    binaryLog.textContent += ` → ${midVal} < ${binTarget}, go right: lo=${mid + 1}`;
    binLo = mid + 1;
  } else {
    binaryLog.textContent += ` → ${midVal} > ${binTarget}, go left: hi=${mid - 1}`;
    binHi = mid - 1;
  }
```

`parseNumberList` (shared idea for Sort Studio and Binary Search) is a small **string tokenizer**: split on commas/whitespace, **parse** numbers, **reject** non-finite values — not a classic DSA “algorithm,” but it is the **input pipeline** to the array algorithms.

---

## What is *not* heavy DSA here

- **UI / navigation** (`setActiveGame`, DOM updates) is ordinary event-driven code.
- **Styling and layout** live in [`style.css`](style.css) and do not implement algorithmic core logic.

---

## Suggested reading order for learners

1. **Stack** (brackets) — smallest, full trace in the UI.  
2. **Binary search** — one clear invariant.  
3. **Insertion vs merge sort** — compare **quadratic** vs **n log n** and **recursive** structure.  
4. **Minesweeper flood fill** — see **DFS** on an implicit graph.  
5. **Sudoku** — see **backtracking** with explicit undo.  
6. **Crossword** — see **data modeling** (grid + maps + word paths) more than algorithmic complexity.

If you extend the project, natural next steps are: **BFS** (queue instead of stack for minesweeper — same reachable set, different order), **union–find** or **graph** for advanced mine inference, and **constraint propagation** for Sudoku (human-style techniques).
