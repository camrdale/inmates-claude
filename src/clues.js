// Clue templates ("guard reports"). A clue carries UI metadata (text, which
// inmates/letters it mentions) plus exactly one solver hook:
//   unary      {i, pred}     — filter one inmate's candidates
//   allUnary   {pred}        — filter every inmate's candidates
//   binary     {i, j, pred}  — arc consistency between two inmates
//   census     {letter, kMin, kMax} — letter appears in [kMin..kMax] inmates
//   vowelTotal {k}           — total vowel slots across all inmates
// `weight` is the difficulty cost charged when the clue removes candidates.

import { maskLetters, VOWELS } from './words.js';

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

function bit(ch) { return 1 << (ch.charCodeAt(0) - 97); }
function up(ch) { return ch.toUpperCase(); }
function inm(i) { return `Inmate #${i + 1}`; }

let nextId = 0;
function clue(fields) {
  return { id: `c${nextId++}`, ...fields };
}

// Truth of a clue on a full assignment (array of word-facts). Used by the
// uniqueness verifier and asserted during enumeration.
export function checkClue(c, fs) {
  if (c.unary) return c.unary.pred(fs[c.unary.i]);
  if (c.allUnary) return fs.every((f) => c.allUnary.pred(f));
  if (c.binary) return c.binary.pred(fs[c.binary.i], fs[c.binary.j]);
  if (c.census) {
    const n = fs.filter((f) => f.mask & bit(c.census.letter)).length;
    return n >= c.census.kMin && n <= c.census.kMax;
  }
  if (c.vowelTotal) return fs.reduce((s, f) => s + f.vowels, 0) === c.vowelTotal.k;
  throw new Error('clue with no hook');
}

// All true clues instantiable for this solution. words: lowercase strings.
export function enumerateClues(wordFacts, poolMask) {
  const n = wordFacts.length;
  const pool = maskLetters(poolMask);
  const out = [];
  const add = (c) => out.push(clue(c));

  wordFacts.forEach((f, i) => {
    const L = f.word.length;

    // Contains / lacks, per pool letter.
    for (const x of pool) {
      const has = (f.mask & bit(x)) !== 0;
      add({
        kind: has ? 'contains' : 'lacks', weight: 1,
        inmates: [i], letters: [x],
        text: has ? `${inm(i)} holds the letter ${up(x)}.`
                  : `${inm(i)} does not hold the letter ${up(x)}.`,
        unary: { i, pred: has ? (g) => (g.mask & bit(x)) !== 0
                              : (g) => (g.mask & bit(x)) === 0 },
      });
    }

    // Exact first / last letter.
    add({
      kind: 'firstIs', weight: 1, inmates: [i], letters: [f.first],
      text: `${inm(i)}'s name starts with ${up(f.first)}.`,
      unary: { i, pred: (g) => g.first === f.first },
    });
    add({
      kind: 'lastIs', weight: 1, inmates: [i], letters: [f.last],
      text: `${inm(i)}'s name ends with ${up(f.last)}.`,
      unary: { i, pred: (g) => g.last === f.last },
    });

    // Negative first / last, per pool letter.
    for (const x of pool) {
      if (x !== f.first) add({
        kind: 'firstNot', weight: 1, inmates: [i], letters: [x],
        text: `${inm(i)}'s name does not start with ${up(x)}.`,
        unary: { i, pred: (g) => g.first !== x },
      });
      if (x !== f.last) add({
        kind: 'lastNot', weight: 1, inmates: [i], letters: [x],
        text: `${inm(i)}'s name does not end with ${up(x)}.`,
        unary: { i, pred: (g) => g.last !== x },
      });
    }

    // Vowel/consonant per position.
    for (let p = 0; p < L; p++) {
      const isV = VOWELS.has(f.word[p]);
      add({
        kind: 'posVowel', weight: 2, inmates: [i], letters: [],
        text: `The ${ORDINALS[p]} letter of ${inm(i)}'s name is a ${isV ? 'vowel' : 'consonant'}.`,
        unary: { i, pred: (g) => VOWELS.has(g.word[p]) === isV },
      });
    }

    // Exact vowel count.
    add({
      kind: 'vowelsExact', weight: 2, inmates: [i], letters: [],
      text: `${inm(i)}'s name holds exactly ${f.vowels} vowel${f.vowels === 1 ? '' : 's'}.`,
      unary: { i, pred: (g) => g.vowels === f.vowels },
    });

    // Repeated letter or not.
    add({
      kind: 'repeat', weight: 2, inmates: [i], letters: [],
      text: f.repeat ? `${inm(i)} uses some letter more than once.`
                     : `${inm(i)} never uses the same letter twice.`,
      unary: { i, pred: (g) => g.repeat === f.repeat },
    });

    // Alphabetic range of first letter, vs each pool letter.
    for (const x of pool) {
      if (f.first < x) add({
        kind: 'alphaBefore', weight: 2, inmates: [i], letters: [x],
        text: `${inm(i)}'s name starts with a letter earlier in the alphabet than ${up(x)}.`,
        unary: { i, pred: (g) => g.first < x },
      });
      if (f.first > x) add({
        kind: 'alphaAfter', weight: 2, inmates: [i], letters: [x],
        text: `${inm(i)}'s name starts with a letter later in the alphabet than ${up(x)}.`,
        unary: { i, pred: (g) => g.first > x },
      });
    }
  });

  // Pairwise clues.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = wordFacts[i], b = wordFacts[j];
      const shared = countBits(a.mask & b.mask);

      add({
        kind: 'shareExact', weight: 4, inmates: [i, j], letters: [],
        text: shared === 0
          ? `${inm(i)} and ${inm(j)} have no letters in common.`
          : `${inm(i)} and ${inm(j)} share exactly ${shared} distinct letter${shared === 1 ? '' : 's'}.`,
        binary: { i, j, pred: (f, g) => countBits(f.mask & g.mask) === shared },
      });

      if (a.last === b.first) add({
        kind: 'link', weight: 4, inmates: [i, j], letters: [a.last],
        text: `${inm(i)}'s name ends with the letter ${inm(j)}'s name starts with.`,
        binary: { i, j, pred: (f, g) => f.last === g.first },
      });
      if (b.last === a.first) add({
        kind: 'link', weight: 4, inmates: [j, i], letters: [b.last],
        text: `${inm(j)}'s name ends with the letter ${inm(i)}'s name starts with.`,
        binary: { i, j, pred: (f, g) => g.last === f.first },
      });

      const [lo, hi] = a.word < b.word ? [i, j] : [j, i];
      add({
        kind: 'alphaOrder', weight: 3, inmates: [i, j], letters: [],
        text: `Alphabetically, ${inm(lo)}'s name comes before ${inm(hi)}'s.`,
        binary: lo === i
          ? { i, j, pred: (f, g) => f.word < g.word }
          : { i, j, pred: (f, g) => g.word < f.word },
      });

      const cmp = Math.sign(a.vowels - b.vowels);
      add({
        kind: 'vowelCmp', weight: 3, inmates: [i, j], letters: [],
        text: cmp === 0
          ? `${inm(i)} and ${inm(j)} hold the same number of vowels.`
          : cmp > 0
            ? `${inm(i)} holds more vowels than ${inm(j)}.`
            : `${inm(j)} holds more vowels than ${inm(i)}.`,
        binary: { i, j, pred: (f, g) => Math.sign(f.vowels - g.vowels) === cmp },
      });

      if (a.mask === b.mask && a.word.length === b.word.length) {
        const anag = a.word.split('').sort().join('') === b.word.split('').sort().join('');
        add({
          kind: 'anagram', weight: 4, inmates: [i, j], letters: [],
          text: anag ? `${inm(i)} and ${inm(j)} are anagrams of each other.`
                     : `${inm(i)} and ${inm(j)} are not anagrams of each other.`,
          binary: { i, j, pred: (f, g) => isAnag(f, g) === anag },
        });
      }
    }
  }

  // Global clues.
  for (const x of pool) {
    const k = wordFacts.filter((f) => f.mask & bit(x)).length;
    add({
      kind: 'census', weight: 4, inmates: [], letters: [x],
      text: `Exactly ${k === 1 ? 'one inmate holds' : k + ' inmates hold'} the letter ${up(x)}.`,
      census: { letter: x, kMin: k, kMax: k },
    });
  }

  for (let xi = 0; xi < pool.length; xi++) {
    for (let yi = xi + 1; yi < pool.length; yi++) {
      const x = pool[xi], y = pool[yi];
      const both = bit(x) | bit(y);
      if (!wordFacts.some((f) => (f.mask & both) === both)) add({
        kind: 'exclusion', weight: 3, inmates: [], letters: [x, y],
        text: `No inmate holds both ${up(x)} and ${up(y)}.`,
        allUnary: { pred: (f) => (f.mask & both) !== both },
      });
    }
  }

  const totalVowels = wordFacts.reduce((s, f) => s + f.vowels, 0);
  add({
    kind: 'vowelTotal', weight: 5, inmates: [], letters: [],
    text: `Across the whole cell block, exactly ${totalVowels} letter slots hold vowels.`,
    vowelTotal: { k: totalVowels },
  });

  return out;
}

function countBits(m) {
  let c = 0;
  while (m) { m &= m - 1; c++; }
  return c;
}

function isAnag(f, g) {
  return f.word.length === g.word.length && f.word !== g.word &&
    f.word.split('').sort().join('') === g.word.split('').sort().join('');
}
