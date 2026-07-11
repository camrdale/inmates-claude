// Brute-force uniqueness check, independent of the solver. Test/CI only —
// fairness already implies uniqueness; this guards against solver bugs.

import { facts, maskLetters } from './words.js';
import { checkClue } from './clues.js';
import { initialCandidates } from './solver.js';

export function countSolutions(puzzle, dict, cap = 5) {
  const { lengths, poolMask, clues } = puzzle;
  const cands = initialCandidates(lengths, poolMask, dict);
  const n = lengths.length;
  const poolLetters = maskLetters(poolMask);

  // Unary prefilter, then depth-first with early pairwise/global checks.
  const unaryFiltered = cands.map((list, i) =>
    list.filter((f) => clues.every((c) =>
      (c.unary && c.unary.i === i) ? c.unary.pred(f) :
      c.allUnary ? c.allUnary.pred(f) : true)));

  const binByPair = clues.filter((c) => c.binary);
  const solutions = [];
  const pick = new Array(n);

  function rec(i) {
    if (solutions.length >= cap) return;
    if (i === n) {
      const fs = pick.slice();
      let m = 0;
      for (const f of fs) m |= f.mask;
      for (const x of poolLetters) if (!(m & (1 << (x.charCodeAt(0) - 97)))) return;
      if (!clues.every((c) => checkClue(c, fs))) return;
      solutions.push(fs.map((f) => f.word));
      return;
    }
    outer: for (const f of unaryFiltered[i]) {
      for (let j = 0; j < i; j++) if (pick[j].word === f.word) continue outer;
      for (const c of binByPair) {
        const { i: a, j: b, pred } = c.binary;
        if (a < i && b === i && !pred(pick[a], f)) continue outer;
        if (b < i && a === i && !pred(f, pick[b])) continue outer;
      }
      pick[i] = f;
      rec(i + 1);
    }
  }
  rec(0);
  return solutions;
}
