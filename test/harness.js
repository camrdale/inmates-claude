// Generation harness: for each tier, generate a batch of puzzles, verify
// uniqueness by brute force, and report timing / clue / difficulty stats.

import { generate, TIERS } from '../src/generator.js';
import { countSolutions } from '../src/verify.js';
import { WORDS4, WORDS5 } from '../src/dictionary.js';
import { maskLetters } from '../src/words.js';

const DICT = { 4: WORDS4, 5: WORDS5 };
const BATCH = parseInt(process.argv[2] || '20', 10);
const SHOW = process.argv.includes('--show');

for (const tier of Object.keys(TIERS)) {
  const times = [], scores = [], clueCounts = [];
  let fails = 0, nonUnique = 0;
  let sample = null;

  for (let k = 0; k < BATCH; k++) {
    const t0 = Date.now();
    const p = generate(`TEST-${k}`, tier);
    times.push(Date.now() - t0);
    if (!p) { fails++; continue; }
    const sols = countSolutions(p, DICT, 3);
    if (sols.length !== 1) {
      nonUnique++;
      console.error(`NON-UNIQUE ${tier} TEST-${k}:`, sols);
    }
    scores.push(p.score);
    clueCounts.push(p.clues.length);
    if (!sample) sample = p;
  }

  const avg = (a) => (a.reduce((s, x) => s + x, 0) / (a.length || 1)).toFixed(1);
  console.log(
    `${tier.padEnd(5)} ok=${BATCH - fails}/${BATCH} nonUnique=${nonUnique} ` +
    `time avg=${avg(times)}ms max=${Math.max(...times)}ms ` +
    `clues avg=${avg(clueCounts)} [${Math.min(...clueCounts)}-${Math.max(...clueCounts)}] ` +
    `score avg=${avg(scores)} [${Math.min(...scores)}-${Math.max(...scores)}]`
  );

  if (SHOW && sample) {
    console.log(`  pool: ${maskLetters(sample.poolMask).join(' ').toUpperCase()}`);
    console.log(`  candidates/inmate: ${sample.initialCandidateCounts.join(', ')}`);
    sample.clues.forEach((c) => console.log(`   ${c.num}. ${c.text}`));
    console.log(`  solution: ${sample.solution.join(', ').toUpperCase()} (score ${sample.score}, sec ${sample.security})`);
  }
}
