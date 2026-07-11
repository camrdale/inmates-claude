// Puzzle generation: SAMPLE a word tuple, ENUMERATE true clues, SELECT a
// clue subset the restricted solver can finish, STRIP redundant clues.
// Reaching a one-candidate-per-inmate fixpoint with only sound rules also
// proves the solution unique, so fairness subsumes uniqueness.

import { WORDS4, WORDS5 } from './dictionary.js';
import { facts, popcount } from './words.js';
import { enumerateClues } from './clues.js';
import { initialCandidates, solve, scoreTrace } from './solver.js';
import { hashSeed, mulberry32, randInt, shuffle } from './rng.js';

const DICT = { 4: WORDS4, 5: WORDS5 };

export const TIERS = {
  HOLD: {
    name: 'Holding Cell', level: 1, lengths: [4, 4],
    poolMin: 6, poolMax: 7, minCands: 10, maxCands: 90,
    strategy: 'strong', maxClues: 8, minClues: 4,
  },
  JAIL: {
    name: 'County Jail', level: 2, lengths: [4, 4, 4],
    poolMin: 7, poolMax: 8, minCands: 15, maxCands: 130,
    strategy: 'mixed', maxClues: 10, minClues: 5,
  },
  PRIS: {
    name: 'State Prison', level: 3, lengths: [5, 5, 5],
    poolMin: 8, poolMax: 9, minCands: 15, maxCands: 160,
    strategy: 'mixed', maxClues: 12, minClues: 5,
  },
  ROCK: {
    name: 'The Rock', level: 4, lengths: [5, 5, 5, 5],
    poolMin: 9, poolMax: 10, minCands: 15, maxCands: 200,
    strategy: 'weak', maxClues: 14, minClues: 6,
  },
};

function sampleWords(rng, cfg) {
  for (let tries = 0; tries < 400; tries++) {
    const chosen = [];
    const used = new Set();
    let mask = 0;
    let ok = true;
    for (const L of cfg.lengths) {
      const dict = DICT[L];
      let w = null;
      for (let t = 0; t < 40; t++) {
        const cand = dict[randInt(rng, dict.length)];
        const m = mask | facts(cand).mask;
        if (!used.has(cand) && popcount(m) <= cfg.poolMax) { w = cand; break; }
      }
      if (!w) { ok = false; break; }
      chosen.push(w);
      used.add(w);
      mask |= facts(w).mask;
    }
    if (!ok || popcount(mask) < cfg.poolMin) continue;

    const cands = initialCandidates(cfg.lengths, mask, DICT);
    if (cands.some((c) => c.length < cfg.minCands || c.length > cfg.maxCands)) continue;
    return { words: chosen, poolMask: mask };
  }
  return null;
}

// Pick the next clue per tier strategy: 'strong' collapses fast (easy feel),
// 'weak' prefers small steps (long chains), 'mixed' is anything that helps.
function pickClue(rng, scored, strategy) {
  const positive = scored.filter((s) => s.gain > 0);
  if (positive.length === 0) return scored[randInt(rng, scored.length)];
  if (strategy === 'strong') {
    const best = Math.max(...positive.map((s) => s.gain));
    const top = positive.filter((s) => s.gain === best);
    return top[randInt(rng, top.length)];
  }
  if (strategy === 'weak') {
    positive.sort((a, b) => a.gain - b.gain);
    return positive[randInt(rng, Math.min(3, positive.length))];
  }
  return positive[randInt(rng, positive.length)];
}

export function generate(seedCode, tierKey) {
  const cfg = TIERS[tierKey];
  const baseRng = mulberry32(hashSeed(seedCode + '|' + tierKey));

  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = mulberry32(hashSeed(seedCode + '|' + tierKey + '|' + attempt));
    const sample = sampleWords(rng, cfg);
    if (!sample) continue;
    const wordFacts = sample.words.map(facts);
    const allClues = shuffle(rng, enumerateClues(wordFacts, sample.poolMask));

    // The full clue set must already be fair, or this tuple is hopeless.
    const cands0 = initialCandidates(cfg.lengths, sample.poolMask, DICT);
    if (!solve(cands0, allClues, sample.poolMask).solved) continue;

    // Greedy selection, propagating incrementally from the current fixpoint.
    let selected = [];
    let state = solve(cands0, [], sample.poolMask);
    let failed = false;
    const unused = allClues.slice();
    while (!state.solved) {
      if (selected.length >= cfg.maxClues * 2) { failed = true; break; }
      const scored = unused.map((c, idx) => {
        const r = solve(state.cands, [...selected, c], sample.poolMask);
        return { idx, clue: c, gain: total(state.cands) - total(r.cands) };
      });
      const overBudget = selected.length >= cfg.maxClues - 2;
      const pick = pickClue(rng, scored, overBudget ? 'strong' : cfg.strategy);
      selected.push(pick.clue);
      unused.splice(pick.idx, 1);
      state = solve(state.cands, selected, sample.poolMask);
    }
    if (failed) continue;

    // Strip pass: drop any clue whose removal keeps the puzzle fair.
    for (const c of shuffle(rng, selected.slice())) {
      const rest = selected.filter((x) => x !== c);
      if (solve(cands0, rest, sample.poolMask).solved) selected = rest;
    }
    if (selected.length > cfg.maxClues) continue;

    // Texture: pad very sparse puzzles with light (redundant but true)
    // unary clues so every tier reads like a case file, not a riddle.
    const filler = shuffle(rng, unused.filter((c) => c.unary && c.weight === 1));
    while (selected.length < cfg.minClues && filler.length) selected.push(filler.pop());

    const final = solve(cands0, selected, sample.poolMask);
    if (!final.solved) continue; // paranoia; strip pass preserves fairness
    const solvedWords = final.cands.map((c) => c[0].word);
    if (solvedWords.join() !== sample.words.join()) continue;

    const score = scoreTrace(final.trace, selected);
    return {
      seed: seedCode,
      tier: tierKey,
      tierName: cfg.name,
      lengths: cfg.lengths,
      poolMask: sample.poolMask,
      clues: shuffle(baseRng, selected).map((c, k) => ({ ...c, num: k + 1 })),
      solution: sample.words,
      score,
      security: Math.min(5, 1 + Math.floor(score / 45)),
      initialCandidateCounts: cands0.map((c) => c.length),
    };
  }
  return null;
}

function total(cands) {
  return cands.reduce((s, c) => s + c.length, 0);
}
