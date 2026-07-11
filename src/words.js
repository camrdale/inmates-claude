// Word-level utilities. Letter sets are bitmasks: bit 0 = 'a' … bit 25 = 'z'.

export const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

export function letterMask(word) {
  let m = 0;
  for (let i = 0; i < word.length; i++) m |= 1 << (word.charCodeAt(i) - 97);
  return m;
}

export function maskLetters(mask) {
  const out = [];
  for (let b = 0; b < 26; b++) if (mask & (1 << b)) out.push(String.fromCharCode(97 + b));
  return out;
}

export function popcount(m) {
  let c = 0;
  while (m) { m &= m - 1; c++; }
  return c;
}

export function vowelCount(word) {
  let c = 0;
  for (const ch of word) if (VOWELS.has(ch)) c++;
  return c;
}

export function hasRepeat(word) {
  return popcount(letterMask(word)) < word.length;
}

export function sharedLetterCount(a, b) {
  return popcount(letterMask(a) & letterMask(b));
}

export function isAnagram(a, b) {
  return a !== b && a.length === b.length &&
    a.split('').sort().join('') === b.split('').sort().join('');
}

// Precomputed per-word facts, keyed by word, so solver filters stay cheap.
const factCache = new Map();

export function facts(word) {
  let f = factCache.get(word);
  if (!f) {
    f = {
      word,
      mask: letterMask(word),
      vowels: vowelCount(word),
      repeat: hasRepeat(word),
      first: word[0],
      last: word[word.length - 1],
    };
    factCache.set(word, f);
  }
  return f;
}
