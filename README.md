# Cellmates

A word-deduction puzzle game: hidden words ("inmates") share a pool of letters
(the "cell block"), and all-true logic clues ("guard reports") identify them.
Every puzzle is procedurally generated, unique, and provably solvable by pure
deduction — no guessing. Full design rationale in [DESIGN.md](DESIGN.md).

## Run locally

```
npm run serve        # python http server on :8123
# open http://localhost:8123/
```

No dependencies, no build step — plain ES modules.

## Develop

```
npm test             # generate 20 puzzles/tier, brute-force verify uniqueness,
                     # report timing + difficulty stats (node test/harness.js 50 --show)
npm run bundle       # single-file build (dist-cellmates.html) for the Artifact
```

## Layout

| Path | What |
|---|---|
| `src/generator.js` | sample words → enumerate true clues → greedy select → strip; tier configs |
| `src/solver.js` | restricted no-backtracking solver = fairness oracle + difficulty trace |
| `src/clues.js` | clue templates (unary / binary / census / vowel-total) with UI metadata |
| `src/verify.js` | independent brute-force uniqueness check (tests only) |
| `src/dictionary.js` | generated: 861 four-letter + 2,315 five-letter curated common words |
| `src/app.js`, `index.html`, `styles.css`, `fonts.css` | the warden's-desk UI |
| `tools/bundle.js` | naive concat bundler (single-line local imports only, unique top-level names) |

Puzzles are deterministic per seed code (`JAIL-X7K2Q`): share a code, race the
same case. Player stats live in localStorage under `cellmates-stats`.
