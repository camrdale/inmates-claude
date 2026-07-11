// UI: the warden's desk. All game logic lives in generator/solver; this file
// only renders state and records the player's notebook marks.

import { generate, TIERS } from './generator.js';
import { maskLetters } from './words.js';
import { randomSeedCode } from './rng.js';
import { WORDS4, WORDS5 } from './dictionary.js';

const $id = (x) => document.getElementById(x);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const game = {
  puzzle: null,
  poolLetters: [],
  startAt: 0,
  timerId: null,
  wrong: 0,
  checks: 0,
  reveals: 0,
  assisted: false,
  done: false,
};

/* ---------- stats ---------- */

function loadStats() {
  try { return JSON.parse(localStorage.getItem('cellmates-stats') || '{}'); }
  catch { return {}; }
}

function recordWin(tier, ms, clean, assisted) {
  const s = loadStats();
  const t = s[tier] || { solved: 0, clean: 0, streak: 0, bestMs: null, cold: 0, assisted: 0 };
  if (assisted) {
    // A helped solve is a lesser result: counted apart, no streak, no best time.
    t.assisted = (t.assisted || 0) + 1;
    t.streak = 0;
  } else {
    t.solved++;
    if (clean) { t.clean++; t.streak++; } else { t.streak = 0; }
    if (t.bestMs === null || ms < t.bestMs) t.bestMs = ms;
  }
  s[tier] = t;
  try { localStorage.setItem('cellmates-stats', JSON.stringify(s)); } catch { /* private mode */ }
  return t;
}

function recordCold(tier) {
  const s = loadStats();
  const t = s[tier] || { solved: 0, clean: 0, streak: 0, bestMs: null, cold: 0 };
  t.cold = (t.cold || 0) + 1;
  t.streak = 0;
  s[tier] = t;
  try { localStorage.setItem('cellmates-stats', JSON.stringify(s)); } catch { /* private mode */ }
  return t;
}

/* ---------- timer ---------- */

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function startTimer() {
  clearInterval(game.timerId);
  game.startAt = Date.now();
  game.timerId = setInterval(() => {
    $id('timer').textContent = fmtTime(Date.now() - game.startAt);
  }, 500);
  $id('timer').textContent = '0:00';
}

/* ---------- overlay sheets ---------- */

function showSheet(html) {
  const ov = $id('overlay');
  ov.innerHTML = `<div class="sheet">${html}</div>`;
  ov.classList.remove('hidden');
  return ov;
}

function hideSheet() { $id('overlay').classList.add('hidden'); }

/* ---------- puzzle lifecycle ---------- */

function newCase(tierKey, seedCode) {
  const code = seedCode || randomSeedCode(tierKey);
  showSheet(`<div class="stamp">INTAKE</div>
    <p class="spin">Processing paperwork for case ${code}&hellip;</p>`);
  setTimeout(() => {
    const p = generate(code, tierKey);
    if (!p) {
      showSheet(`<div class="stamp">LOST FILE</div>
        <p class="spin">Case ${code} went missing in the records room.</p>
        <div class="btns"><button id="retryBtn">Draw another case</button></div>`);
      $id('retryBtn').onclick = () => newCase(tierKey);
      return;
    }
    game.puzzle = p;
    game.poolLetters = maskLetters(p.poolMask);
    game.wrong = 0;
    game.checks = 0;
    game.reveals = 0;
    game.assisted = false;
    game.done = false;
    renderPuzzle();
    startTimer();
    hideSheet();
  }, 60);
}

function renderPuzzle() {
  const p = game.puzzle;
  $id('tierBadge').textContent = p.tierName;
  $id('secBadge').textContent = 'SECURITY ' + '▮'.repeat(p.security) + '▯'.repeat(5 - p.security);
  $id('seedLine').textContent = `CASE ${p.seed}`;

  const pool = $id('pool');
  pool.innerHTML = '';
  for (const x of game.poolLetters) {
    const t = el('span', 'tile', x.toUpperCase());
    t.dataset.letter = x;
    pool.appendChild(t);
  }

  const inmates = $id('inmates');
  inmates.innerHTML = '';
  p.lengths.forEach((L, i) => {
    const card = el('article', 'card');
    card.dataset.i = i;

    const head = el('div', 'card-head');
    head.appendChild(el('span', 'mug-num', `INMATE NO. ${i + 1}`));
    head.appendChild(el('span', 'verdict'));
    const tools = el('span', 'head-right');
    tools.appendChild(el('span', 'mug-len', `${L} LETTERS`));
    const checkB = el('button', 'tool-btn check-word', 'Check');
    checkB.dataset.i = i;
    checkB.title = 'Verify this name — marks the case as an assisted escape';
    const revealB = el('button', 'tool-btn reveal-word', 'Reveal');
    revealB.dataset.i = i;
    revealB.title = 'Reveal this name — marks the case as an assisted escape';
    tools.appendChild(checkB);
    tools.appendChild(revealB);
    head.appendChild(tools);
    card.appendChild(head);

    const slots = el('div', 'slots');
    for (let k = 0; k < L; k++) {
      const inp = el('input', 'slot');
      inp.maxLength = 1;
      inp.autocomplete = 'off';
      inp.setAttribute('aria-label', `Inmate ${i + 1}, letter ${k + 1}`);
      inp.dataset.i = i;
      inp.dataset.k = k;
      slots.appendChild(inp);
    }
    card.appendChild(slots);

    const marks = el('div', 'marks');
    for (const x of game.poolLetters) {
      const b = el('button', 'mark', x.toUpperCase());
      b.dataset.state = '0';
      b.dataset.letter = x;
      b.title = `Cycle: unknown → in → out → maybe (${x.toUpperCase()} for inmate ${i + 1})`;
      marks.appendChild(b);
    }
    card.appendChild(marks);
    card.appendChild(el('div', 'marks-hint',
      'tap letters to mark: green ring = in the name, red strike = not, dashed = maybe'));

    const scratch = el('input', 'scratch');
    scratch.placeholder = 'suspects…';
    scratch.autocomplete = 'off';
    card.appendChild(scratch);

    inmates.appendChild(card);
  });

  const list = $id('clues');
  list.innerHTML = '';
  for (const c of p.clues) {
    const li = el('li', 'clue');
    li.dataset.inmates = c.inmates.join(',');
    li.dataset.letters = c.letters.join(',');
    const box = el('input');
    box.type = 'checkbox';
    box.className = 'filed';
    box.setAttribute('aria-label', 'Mark report as fully used');
    li.appendChild(box);
    li.appendChild(el('span', 'num', String(c.num) + '.'));
    li.appendChild(el('span', 'clue-text', c.text));
    list.appendChild(li);
  }
}

/* ---------- assists: check or reveal a single word ---------- */

// First assist in a case asks for consent; after that, help flows freely.
function withAssistConsent(run) {
  if (game.assisted) { run(); return; }
  showSheet(`<div class="stamp amber">CALL FOR HELP?</div>
    <p class="meta">Checking or revealing a name marks this whole case as an
    <strong>assisted escape</strong> — no clean badge, your streak resets, and
    it won't count toward your escape record.</p>
    <div class="btns">
      <button id="aloneBtn">Keep working alone</button>
      <button id="helpBtn">Take the help</button>
    </div>`);
  $id('aloneBtn').onclick = hideSheet;
  $id('helpBtn').onclick = () => { game.assisted = true; hideSheet(); run(); };
}

function setVerdict(i, text, cls) {
  const v = document.querySelector(`.card[data-i="${i}"] .verdict`);
  if (v) { v.textContent = text; v.className = 'verdict' + (cls ? ' ' + cls : ''); }
}

function checkWord(i) {
  const entry = currentEntries()[i];
  if (entry.includes(' ')) { setVerdict(i, 'FILL EVERY SLOT FIRST', 'info'); return; }
  withAssistConsent(() => {
    game.checks++;
    const right = entry === game.puzzle.solution[i];
    setVerdict(i, right ? 'CONFIRMED' : 'NOT THE ONE', right ? 'ok' : 'bad');
  });
}

function revealWord(i) {
  withAssistConsent(() => {
    game.reveals++;
    const w = game.puzzle.solution[i];
    document.querySelectorAll(`.slot[data-i="${i}"]`).forEach((s, k) => {
      s.value = w[k].toUpperCase();
      s.readOnly = true;
    });
    setVerdict(i, 'REVEALED', 'info');
    document.querySelectorAll(`.tool-btn[data-i="${i}"]`).forEach((b) => { b.disabled = true; });
  });
}

/* ---------- submission ---------- */

function currentEntries() {
  return game.puzzle.lengths.map((L, i) => {
    let w = '';
    document.querySelectorAll(`.slot[data-i="${i}"]`).forEach((s) => { w += (s.value || ' '); });
    return w.toLowerCase();
  });
}

function submit() {
  if (game.done) return;
  const entries = currentEntries();
  if (entries.some((w) => w.includes(' '))) {
    showSheet(`<div class="stamp">HOLD ON</div>
      <p class="meta">Every inmate needs a full name before you call the warden.</p>
      <div class="btns"><button id="backBtn">Back to the case</button></div>`);
    $id('backBtn').onclick = hideSheet;
    return;
  }
  const right = entries.join() === game.puzzle.solution.join();
  if (!right) {
    game.wrong++;
    showSheet(`<div class="stamp">DENIED</div>
      <p class="meta">The warden is not convinced. No hints leave this office —
      the reports alone hold the answer.<br>Denied attempts on this case: ${game.wrong}</p>
      <div class="btns"><button id="backBtn">Back to the case</button></div>`);
    $id('backBtn').onclick = hideSheet;
    return;
  }

  game.done = true;
  clearInterval(game.timerId);
  const ms = Date.now() - game.startAt;
  const assisted = game.assisted;
  const clean = game.wrong === 0 && !assisted;
  const t = recordWin(game.puzzle.tier, ms, clean, assisted);

  const helpNote = assisted
    ? ` &middot; helped out (${game.checks} check${game.checks === 1 ? '' : 's'}, ${game.reveals} revealed)`
    : clean ? ' &middot; CLEAN ESCAPE'
    : ` &middot; ${game.wrong} denied attempt${game.wrong === 1 ? '' : 's'}`;
  const mugs = game.puzzle.solution.map((w, i) =>
    `<span class="mug"><span class="n">NO. ${i + 1}</span><br><span class="w">${w.toUpperCase()}</span></span>`).join('');
  showSheet(`<div class="stamp ${assisted ? 'amber' : 'green'}">${assisted ? 'ESCAPED &middot; ASSISTED' : 'ESCAPED'}</div>
    <div class="reveal">${mugs}</div>
    <p class="meta">${game.puzzle.tierName} &middot; case ${game.puzzle.seed} &middot; out in ${fmtTime(ms)}${helpNote}<br>
    tier record: ${t.solved} escaped &middot; ${t.clean} clean &middot; streak ${t.streak}
    &middot; best ${t.bestMs === null ? '&mdash;' : fmtTime(t.bestMs)}
    &middot; ${t.assisted || 0} assisted &middot; ${t.cold || 0} cold</p>
    <div class="btns">
      <button id="shareBtn">Copy brag sheet</button>
      <button id="againBtn">New case</button>
    </div>`);
  $id('shareBtn').onclick = () => {
    const txt = `CELLMATES · ${game.puzzle.tierName} · case ${game.puzzle.seed} · escaped in ${fmtTime(ms)}${clean ? ' · CLEAN ESCAPE' : assisted ? ' · assisted' : ''}`;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
      .then(() => { $id('shareBtn').textContent = 'Copied'; })
      .catch(() => { $id('shareBtn').textContent = txt; });
  };
  $id('againBtn').onclick = () => newCase($id('tierSelect').value);
}

/* ---------- giving up ---------- */

function giveUp() {
  if (game.done || !game.puzzle) return;
  showSheet(`<div class="stamp">GIVE UP?</div>
    <p class="meta">The answer is revealed, the case goes cold, and your streak resets.<br>
    There is no way back into this one.</p>
    <div class="btns">
      <button id="stayBtn">Keep working</button>
      <button id="coldBtn">Reveal the answer</button>
    </div>`);
  $id('stayBtn').onclick = hideSheet;
  $id('coldBtn').onclick = () => {
    game.done = true;
    clearInterval(game.timerId);
    const t = recordCold(game.puzzle.tier);
    // Write the answer onto the cards so the reports can be studied against it.
    game.puzzle.solution.forEach((w, i) => {
      document.querySelectorAll(`.slot[data-i="${i}"]`).forEach((s, k) => {
        s.value = w[k].toUpperCase();
      });
    });
    const mugs = game.puzzle.solution.map((w, i) =>
      `<span class="mug"><span class="n">NO. ${i + 1}</span><br><span class="w">${w.toUpperCase()}</span></span>`).join('');
    showSheet(`<div class="stamp">COLD CASE</div>
      <div class="reveal">${mugs}</div>
      <p class="meta">The inmates walked. ${game.puzzle.tierName} &middot; case ${game.puzzle.seed}<br>
      tier record: ${t.solved} escaped &middot; ${t.cold} cold &middot; streak reset</p>
      <div class="btns">
        <button id="studyBtn">Study the file</button>
        <button id="againBtn">New case</button>
      </div>`);
    $id('studyBtn').onclick = hideSheet;
    $id('againBtn').onclick = () => newCase($id('tierSelect').value);
  };
}

/* ---------- wiring ---------- */

function wire() {
  const tierSel = $id('tierSelect');
  for (const [key, cfg] of Object.entries(TIERS)) {
    const o = el('option', '', `${cfg.name} (${cfg.lengths.length} × ${cfg.lengths[0]}-letter)`);
    o.value = key;
    tierSel.appendChild(o);
  }
  tierSel.value = 'JAIL';

  $id('newBtn').onclick = () => newCase(tierSel.value);
  $id('submitBtn').onclick = submit;
  $id('giveupBtn').onclick = giveUp;

  $id('seedBtn').onclick = () => $id('seedForm').classList.toggle('open');
  $id('seedGo').onclick = () => {
    const code = $id('seedInput').value.trim().toUpperCase();
    const m = code.match(/^(HOLD|JAIL|PRIS|ROCK)-[A-Z0-9]{5}$/);
    if (!m) { $id('seedInput').value = ''; $id('seedInput').placeholder = 'BAD CODE'; return; }
    $id('seedForm').classList.remove('open');
    tierSel.value = m[1];
    newCase(m[1], code);
  };

  $id('seedLine').onclick = () => {
    if (!game.puzzle) return;
    if (navigator.clipboard) navigator.clipboard.writeText(game.puzzle.seed);
    $id('seedLine').textContent = 'COPIED';
    setTimeout(() => { $id('seedLine').textContent = `CASE ${game.puzzle.seed}`; }, 900);
  };

  const doCheck = () => {
    const w = $id('checkInput').value.trim().toLowerCase();
    const res = $id('checkResult');
    if (!/^[a-z]{4,5}$/.test(w)) { res.textContent = '4 or 5 letters'; res.className = ''; return; }
    const ok = (w.length === 4 ? WORDS4 : WORDS5).includes(w);
    res.textContent = ok ? `${w.toUpperCase()} is in the book` : `${w.toUpperCase()}: not in the book`;
    res.className = ok ? 'ok' : 'no';
  };
  $id('checkBtn').onclick = doCheck;
  $id('checkInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doCheck(); });

  // Slots: typing, auto-advance, backspace navigation (skipping revealed letters).
  const slotAt = (i, k) => document.querySelector(`.slot[data-i="${i}"][data-k="${k}"]`);
  $id('inmates').addEventListener('input', (e) => {
    const s = e.target;
    if (!s.classList.contains('slot')) return;
    s.value = s.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
    setVerdict(s.dataset.i, '', '');
    if (s.value) {
      let next = slotAt(s.dataset.i, +s.dataset.k + 1);
      while (next && next.readOnly) next = slotAt(s.dataset.i, +next.dataset.k + 1);
      if (next) next.focus();
    }
  });
  $id('inmates').addEventListener('keydown', (e) => {
    const s = e.target;
    if (!s.classList.contains('slot')) return;
    if (e.key === 'Backspace' && !s.value) {
      let prev = slotAt(s.dataset.i, +s.dataset.k - 1);
      while (prev && prev.readOnly) prev = slotAt(s.dataset.i, +prev.dataset.k - 1);
      if (prev) { prev.focus(); prev.value = ''; setVerdict(s.dataset.i, '', ''); e.preventDefault(); }
    }
  });

  // Letter-status marks and per-word assists.
  $id('inmates').addEventListener('click', (e) => {
    const b = e.target.closest('.mark');
    if (b) b.dataset.state = String((+b.dataset.state + 1) % 4);
    const t = e.target.closest('.tool-btn');
    if (t && !game.done && !t.disabled) {
      if (t.classList.contains('check-word')) checkWord(+t.dataset.i);
      else revealWord(+t.dataset.i);
    }
  });

  // Clue hover highlights the inmates and letters it mentions.
  const list = $id('clues');
  list.addEventListener('mouseover', (e) => {
    const li = e.target.closest('.clue');
    if (li) setHighlight(li, true);
  });
  list.addEventListener('mouseout', (e) => {
    const li = e.target.closest('.clue');
    if (li) setHighlight(li, false);
  });
  list.addEventListener('change', (e) => {
    if (e.target.classList.contains('filed')) {
      e.target.closest('.clue').classList.toggle('filed', e.target.checked);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !game.done) hideSheet();
  });
}

function setHighlight(li, on) {
  for (const i of li.dataset.inmates.split(',').filter((x) => x !== '')) {
    const card = document.querySelector(`.card[data-i="${i}"]`);
    if (card) card.classList.toggle('hl', on);
  }
  for (const x of li.dataset.letters.split(',').filter((x) => x !== '')) {
    const tile = document.querySelector(`.tile[data-letter="${x}"]`);
    if (tile) tile.classList.toggle('hl', on);
  }
}

wire();
newCase('JAIL');
