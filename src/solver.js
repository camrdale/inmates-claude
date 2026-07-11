// The restricted logic solver — both the in-game deduction model and the
// generator's fairness oracle. It may only run these human-analog rules to a
// fixpoint, with NO branching and NO backtracking:
//   L1 unary filtering            L3 pairwise arc consistency
//   L4 letter census / coverage   L5 vowel-total bounds
// A puzzle is "fair" iff this reaches one candidate per inmate.

import { facts, maskLetters } from './words.js';

function letterBit(ch) { return 1 << (ch.charCodeAt(0) - 97); }

// Initial candidates: right length, letters within the pool.
export function initialCandidates(lengths, poolMask, dict) {
  return lengths.map((L) =>
    dict[L].filter((w) => (facts(w).mask & ~poolMask) === 0).map(facts));
}

// Standing rule: every pool letter appears in at least one word.
function coverageClauses(poolMask, n) {
  return maskLetters(poolMask).map((x) => ({ letter: x, kMin: 1, kMax: n }));
}

export function solve(cands0, clues, poolMask) {
  const n = cands0.length;
  const cands = cands0.map((c) => c.slice());
  const trace = [];
  const censuses = clues.filter((c) => c.census).map((c) => ({ clue: c, ...c.census }))
    .concat(coverageClauses(poolMask, n).map((c) => ({ clue: null, ...c })));
  const vowelTotals = clues.filter((c) => c.vowelTotal);

  const filter = (i, pred, rule, clue) => {
    const before = cands[i].length;
    if (before === 0) return;
    cands[i] = cands[i].filter(pred);
    if (cands[i].length < before) {
      trace.push({ rule, clue: clue ? clue.id : null, inmate: i, removed: before - cands[i].length });
    }
  };

  let changed = true;
  let rounds = 0;
  while (changed && rounds++ < 60) {
    const sizes = cands.map((c) => c.length);

    // L1: unary clues (and allUnary, e.g. exclusions).
    for (const c of clues) {
      if (c.unary) filter(c.unary.i, c.unary.pred, 'L1', c);
      if (c.allUnary) for (let i = 0; i < n; i++) filter(i, c.allUnary.pred, 'L1', c);
    }

    // L3: arc consistency on binary clues.
    for (const c of clues) {
      if (!c.binary) continue;
      const { i, j, pred } = c.binary;
      filter(i, (f) => cands[j].some((g) => pred(f, g) && f.word !== g.word), 'L3', c);
      filter(j, (g) => cands[i].some((f) => pred(f, g) && f.word !== g.word), 'L3', c);
    }

    // All-different: a solved inmate's word is off-limits to the others.
    for (let i = 0; i < n; i++) {
      if (cands[i].length !== 1) continue;
      const w = cands[i][0].word;
      for (let j = 0; j < n; j++) {
        if (j !== i) filter(j, (g) => g.word !== w, 'L3', null);
      }
    }

    // L4: letter census (clued counts + standing coverage rule).
    for (const cz of censuses) {
      const b = letterBit(cz.letter);
      const may = [], must = [];
      for (let i = 0; i < n; i++) {
        if (cands[i].some((f) => f.mask & b)) may.push(i);
        if (cands[i].length && cands[i].every((f) => f.mask & b)) must.push(i);
      }
      if (may.length === cz.kMin) {
        for (const i of may) filter(i, (f) => (f.mask & b) !== 0, 'L4', cz.clue);
      }
      if (must.length === cz.kMax) {
        for (let i = 0; i < n; i++) {
          if (!must.includes(i)) filter(i, (f) => (f.mask & b) === 0, 'L4', cz.clue);
        }
      }
    }

    // L5: vowel-total bounds propagation.
    for (const c of vowelTotals) {
      const k = c.vowelTotal.k;
      const mins = cands.map((cd) => Math.min(...cd.map((f) => f.vowels)));
      const maxs = cands.map((cd) => Math.max(...cd.map((f) => f.vowels)));
      const minSum = mins.reduce((a, x) => a + x, 0);
      const maxSum = maxs.reduce((a, x) => a + x, 0);
      for (let i = 0; i < n; i++) {
        const lo = k - (maxSum - maxs[i]);
        const hi = k - (minSum - mins[i]);
        filter(i, (f) => f.vowels >= lo && f.vowels <= hi, 'L5', c);
      }
    }

    changed = cands.some((c, i) => c.length !== sizes[i]);
  }

  return {
    cands,
    trace,
    solved: cands.every((c) => c.length === 1),
    contradiction: cands.some((c) => c.length === 0),
  };
}

const RULE_WEIGHTS = { L1: 1, L3: 4, L4: 4, L5: 5 };

// Difficulty from the solve trace: each rule firing costs its weight, and
// clue weights add color (relational/global clues imply harder reasoning).
export function scoreTrace(trace, clues) {
  const byId = new Map(clues.map((c) => [c.id, c]));
  let s = 0;
  for (const t of trace) {
    s += RULE_WEIGHTS[t.rule] || 1;
    const c = t.clue && byId.get(t.clue);
    if (c) s += (c.weight - 1) * 0.5;
  }
  return Math.round(s);
}
