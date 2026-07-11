# CELLMATES — Design Document

*A word-deduction puzzle game for the browser.*

**Elevator pitch:** An Einstein/zebra puzzle where the objects are hidden English
words and the attributes are their letters. Several "inmates" (hidden words)
share a "cell block" (a common pool of letters). Guard reports (logic clues)
relate the words to their letters and to each other. Cross-reference the
reports, run the deductions, identify every inmate — and they escape.

Every puzzle is procedurally generated, has exactly one solution, and is
solvable by logic alone. No guessing, ever.

---

## 1. Design pillars

1. **Pure deduction.** Every puzzle is machine-verified to be solvable through
   a chain of human-performable inferences with no trial-and-error. If the
   generator can't prove it, the puzzle is discarded.
2. **Words as logic objects.** The novelty of the game is that dictionary
   knowledge and formal logic feed each other: a clue eliminates letters, the
   shrinking letter set eliminates words, and the surviving words unlock new
   clues. Neither skill alone solves a puzzle.
3. **The game remembers, the player thinks.** The smart notebook records every
   mark the player makes and never loses state, but it never performs an
   inference for the player and never says whether a mark is right.
4. **A meaty solve.** Target 10–20 minutes per puzzle at standard difficulty —
   hard-sudoku energy, not coffee-break filler.
5. **Endless and shareable.** Seeded generation gives unlimited puzzles; any
   puzzle can be replayed or shared by its seed code.

---

## 2. Core rules (player-facing)

A puzzle consists of:

- **The cell block:** a pool of **P distinct letters** (e.g. `A E L M O S T R`),
  displayed prominently.
- **The inmates:** **N hidden words** of stated lengths (e.g. three 4-letter
  words). Words are drawn from a curated common-word list.
- **The guard reports:** **K numbered clues**, all true.

Standing rules printed on every puzzle:

- Every word uses only letters from the cell block.
- Every cell block letter appears in **at least one** word.
- A letter **may repeat** within a word only if a clue or the standing rules
  say nothing against it (repeats are allowed by default; "no doubles" appears
  as an explicit clue when the generator wants it).
- All words are different, and all are in the game's dictionary.

**Winning:** fill in all N words and submit. A submission is only accepted as
a win if every word is correct. Wrong submissions are counted (see § 8,
"clean escape") but give **no feedback** — that would violate pure deduction
by turning guessing into information.

### Worked micro-example

```
Cell block (8): A E L M O S T R          Inmates: three 4-letter words

Reports:
 1. Inmate 1 and Inmate 2 share exactly one letter.
 2. Inmate 3 starts with a vowel.
 3. No inmate contains both S and T.
 4. Inmate 2 ends in the same letter Inmate 3 starts with.
 5. The letter M appears in exactly one inmate.
```

The solve alternates between logic ("by 3, the word STEM is impossible for
anyone") and vocabulary ("what common 4-letter words start with a vowel and
use only these letters?"), with relational clues (1, 4, 5) forcing the player
to solve the words *as a system* rather than one at a time.

---

## 3. Puzzle anatomy & parameters

| Parameter | Range | Notes |
|---|---|---|
| N (words) | 2–5 | 3 is the standard |
| Word length | 4–6 | May be mixed within a puzzle at higher tiers |
| P (pool size) | 6–12 | Smaller pool = tighter interlock, not necessarily easier |
| K (clues) | 5–12 | Chosen by the generator, not fixed |

The pool is the load-bearing constraint: because every pool letter must be
used somewhere, "coverage" deductions emerge naturally (*"no other inmate can
hold the Z, so Inmate 2 must"*) — the same flavor of reasoning as sudoku's
hidden singles.

---

## 4. Clue taxonomy (guard reports)

Clues are generated from templates. Each template has a **tier** (how advanced
the reasoning it enables is) used by the difficulty model in § 6.

### Unary — about one inmate (tier 1)

| Template | Example |
|---|---|
| Contains / lacks letter | "Inmate 2 has no A." |
| Positional | "Inmate 1's third letter is a vowel." / "Inmate 3 does not end in T." |
| Vowel count | "Inmate 1 contains exactly one vowel." |
| Double letter | "Inmate 3 has a repeated letter." / "…has no repeated letters." |
| Alphabetic range | "Inmate 2's first letter comes after M." |

### Relational — between two inmates (tier 2)

| Template | Example |
|---|---|
| Shared-letter count | "Inmates 1 and 2 share exactly one letter." |
| Position link | "Inmate 2 ends with the letter Inmate 3 starts with." |
| Disjoint / anagram | "Inmates 1 and 3 have no letters in common." / "…are not anagrams." |
| Alphabetical order | "Inmate 1 comes before Inmate 2 alphabetically." |
| Vowel comparison | "Inmate 2 has more vowels than Inmate 1." |

### Global — about the whole cell block (tier 3)

| Template | Example |
|---|---|
| Letter census | "The letter M appears in exactly one inmate." |
| Mutual exclusion | "No inmate contains both S and T." |
| Total count | "Exactly five vowel slots are filled across all inmates." |
| Unique holder | "Only one inmate uses more than one vowel." |

### Design rules for clues

- **All clues are true.** (A "lying guard" variant is a future mode, § 10 —
  not in the base game.)
- Negative clues ("does *not* contain") are as common as positive ones;
  elimination is the game's bread and butter.
- Clue text is themed but **unambiguous**: every template has exactly one
  formal meaning, listed verbatim in an in-game "regulations" reference so
  players never lose to wording lawyering.

---

## 5. Generation: guaranteeing pure deduction

This is the heart of the project. "Unique solution" is easy to verify;
"solvable by logic alone" needs to be *operationalized*: **a puzzle is fair
iff a solver restricted to human-performable inference steps reaches the
unique solution with zero search/backtracking.**

### 5.1 The dictionary

- Curated list of common words (roughly: 4-letter ≈ 2,200, 5-letter ≈ 2,700,
  6-letter ≈ 3,000), profanity-filtered, no obscure Scrabble-isms. The player
  is told the dictionary is "common words" and gets a free in-game **word
  check** (type any word → valid/invalid), so obscurity can never be the
  reason a solve fails. The full list is browsable from the menu.

### 5.2 Pipeline

```
1. SAMPLE     Pick N words from the dictionary matching the tier's
              length profile, such that their combined letter set has
              size P within the tier's range and all standing rules hold.

2. ENUMERATE  Emit every true clue instantiable from the taxonomy for
              this word tuple (typically 60–200 candidate clues).

3. SELECT     Search for a small clue subset whose puzzle the
              LOGIC SOLVER (5.3) can finish. Greedy with restarts:
              repeatedly add the clue with the best information/difficulty
              score until solved, then strip redundant clues (remove any
              clue whose deletion leaves the puzzle still logic-solvable —
              yields tight, elegant clue sets).

4. VERIFY     (a) Uniqueness: exhaustive check over all dictionary
              tuples that no other assignment satisfies the clue set.
              (b) Fairness: logic solver finishes with no search.
              (c) Difficulty: solver trace scored per § 6; keep the
              puzzle only if it lands in the target band, else restart.
```

Generation runs in a web worker (or offline into a pregenerated bank — see
§ 9); a seeded RNG makes every puzzle reproducible from a short seed code.

### 5.3 The logic solver (fairness oracle)

State: for each inmate, the set of dictionary words still possible
(**candidate lists**), plus derived per-slot letter sets. The solver may only
apply these human-analog rules, in a propagation loop until fixpoint:

- **L1 Direct filtering:** strike candidates violating a unary clue.
- **L2 Letter-set propagation:** recompute "letters certainly in / certainly
  out / possible" for each inmate from its candidate list; feed those into
  clues ("Inmate 1 certainly has an S, so by clue 3 it has no T").
- **L3 Relational pruning (arc consistency):** for a two-inmate clue, strike
  any candidate of A that is compatible with *no* remaining candidate of B.
- **L4 Coverage counting:** every pool letter needs a home; if only one
  inmate can still hold letter X, that inmate must hold X. Likewise letter-
  census clues ("M appears in exactly one inmate") interact with counts of
  who *can* and who *must* hold M.
- **L5 Global accounting:** vowel totals and other census clues resolved by
  min/max counting over candidate lists.

**No branching. No "suppose Inmate 1 is SLATE".** If the fixpoint isn't a
single word per inmate, the clue set is rejected. This is a strictly stronger
guarantee than uniqueness, and it's what makes the "pure deduction" promise
honest rather than aspirational.

(L3 across two candidate lists of a few hundred words each is far beyond
mental arithmetic in raw size — but it's the same *shape* of reasoning a human
does with the notebook: "nothing Inmate 2 can be shares a letter with STORM."
The fairness bar is about reasoning type, not memory capacity; the notebook
covers the memory. Playtesting will tune how aggressive L3 may be per tier.)

### 5.4 Failure modes to engineer against

- **Dictionary-crutch puzzles:** solvable by vocabulary alone (one inmate's
  unary clues pin it immediately). Detector: if any single word is solved by
  L1/L2 only, require the difficulty scorer to confirm the *rest* still needs
  relational work.
- **Near-anagram ambiguity:** word pairs like `LEAST/SLATE/STEAL/TALES` make
  uniqueness expensive to pin. The sampler tracks anagram classes and either
  avoids stacking them or spends a positional clue to split them (a good hard-
  tier spice when done deliberately).
- **Degenerate pools:** pools that admit only a handful of words make the
  puzzle collapse. Sampler enforces a minimum initial candidate count per
  inmate (e.g. ≥ 40).

---

## 6. Difficulty model

Difficulty is **measured, not assumed** — scored from the solver's trace:

```
score = Σ over inference steps of weight(rule) + chain_depth_bonus
        weights: L1=1, L2=2, L3=4, L4=4, L5=5
        chain_depth_bonus: rewards long forced sequences where each
        deduction enables the next (the "aha cascade")
```

Tiers (endless mode — pick a tier, get unlimited puzzles):

| Tier | Theme name | Words | Lengths | Character |
|---|---|---|---|---|
| 1 | **Holding Cell** | 2 | 4 | Tutorializing; mostly unary clues; ~5 min |
| 2 | **County Jail** | 3 | 4 | Standard; relational clues carry the solve; ~10 min |
| 3 | **State Prison** | 3–4 | 4–5 | Global/census clues; long chains; ~15–20 min |
| 4 | **The Rock** | 4–5 | 5–6 mixed | Everything; minimal clue counts; 20+ min |

The tier defines a target score band; generated puzzles outside the band are
discarded. Within a tier, the actual score is shown as a 1–5 "security level"
badge so players can feel the variance.

---

## 7. Interface & the smart notebook

Single-screen layout, responsive (desktop side-by-side; mobile stacked tabs):

```
┌────────────────────────────────────────────────────────────┐
│  CELL BLOCK D        [A][E][L][M][O][S][T][R]     ⏱ 07:42  │
├──────────────────────────────┬─────────────────────────────┤
│  INMATE CARDS                │  GUARD REPORTS              │
│  ┌─────────────────────────┐ │  ☐ 1. Inmates 1 and 2       │
│  │ #1  _ _ _ _             │ │       share exactly one     │
│  │  A E L M O S T R        │ │       letter.               │
│  │  ✓ ✗ ? ? ? ✓ ? ?        │ │  ☑ 2. Inmate 3 starts       │
│  └─────────────────────────┘ │       with a vowel.         │
│  ┌─────────────────────────┐ │  ☐ 3. No inmate has both    │
│  │ #2  _ _ _ _  …          │ │       S and T.        📌    │
└──┴─────────────────────────┴─┴─────────────────────────────┘
```

**Inmate card** (one per hidden word):

- Answer slots; typing a letter into a slot is a *commitment* mark, and
  long-press/right-click cycles slot pencil marks (small candidate letters
  per position).
- **Letter status row:** every pool letter can be cycled
  `unknown → in ✓ → out ✗ → maybe ?` for that inmate. This is the core
  bookkeeping tool — the zebra-puzzle grid, reshaped.
- Free-text scratch line per inmate for candidate words the player is
  entertaining.

**Guard reports panel:**

- Checkbox per clue ("fully used"), pin per clue ("keep visible"), and
  hover/tap highlighting: touching a clue highlights the inmates and pool
  letters it mentions.

**Strictly non-solving:** the notebook never validates marks, never
propagates, never greys out impossible letters. (The gentler auto-validation
mode is deliberately excluded per design choice; could ship later as an
accessibility option, default off.)

**Tools:** word check (§ 5.1), full-puzzle reset, mark-history undo. No hint
system at launch — pure deduction plus the fairness guarantee is the promise
that a stuck player is never *stuck*, only not-yet-finished. (Revisit after
playtesting; if added, hints should name a *clue to re-examine*, never a
letter.)

---

## 8. Theme, tone & meta

**Fiction:** playful heist-noir, light touch. Words are inmates in Cell Block
D; the letter pool is the yard; clues are guard reports; solving the puzzle
IDs every inmate and springs them. Win screen: mugshot cards flip to reveal
the words and the inmates strut out to a two-second jailbreak animation.
Losing doesn't exist — only escaping slower.

Tone guardrails: cartoon-caper (think *O Brother* / Lupin), zero grimness;
inmates are anthropomorphized words with little personalities generated from
the word itself ("STOMP — in for aggravated tap-dancing").

**Meta / endless structure:**

- **Streaks & stats** per tier: puzzles solved, average time, and **clean
  escape rate** (solved with zero wrong submissions — the prestige stat).
- **Seed codes:** every puzzle has a short shareable code (`ROCK-7F3K2`);
  friends race the same puzzle. Post-solve share card shows tier, time,
  clean/dirty, and the seed — never the answer.
- **No daily pressure** at launch; a daily shared puzzle is a cheap later
  add-on since seeds already exist.

---

## 9. Technical sketch (for a future prototype)

- **Stack:** TypeScript + Vite; plain DOM or Preact (the UI is cards and
  lists, no canvas needed). Fully client-side, no backend required.
- **Generator/solver:** shared TS module, run in a **web worker**. Expected
  generation cost is dominated by step 4a (uniqueness over dictionary
  tuples); with letter-set prefilters this prunes to thousands of viable
  tuples, fine in a worker. Fallback: pregenerate puzzle banks offline and
  ship as JSON, keyed by seed.
- **Persistence:** localStorage for stats, streaks, and in-progress notebook
  state (resume mid-solve).
- **Testing:** the solver doubles as the test oracle — every shipped puzzle
  bank is CI-verified for uniqueness + fairness + difficulty band.

---

## 10. Future variants (explicitly out of scope for v1)

- **Snitch mode:** one guard report is false — find the liar *and* the words
  (fairness oracle needs an "assume-and-refute" rule tier).
- **Daily puzzle** with global leaderboard.
- **Warden's Challenge:** fixed clue budget — solve N puzzles with a shared
  pool of clue "reveals."
- Auto-validation accessibility mode; colorblind-safe mark themes (mark
  shapes already differ, not just colors — this is v1, actually).

---

## Open design questions

1. **L3 aggressiveness:** how much arc-consistency reasoning is fair to
   expect at each tier? Needs playtesting with real humans and tuning of the
   solver's per-tier rule budget.
2. **Repeat letters:** allowing in-word repeats by default is more
   dictionary-natural but muddies the "cell block coverage" reasoning.
   Alternative: tier 1–2 forbid repeats globally, tiers 3–4 allow them.
3. **Dictionary size vs. fairness:** smaller dictionary → easier deduction but
   more "that's a word?!" complaints. The word-check tool mitigates; the
   right size is an empirical question.
4. **Clue phrasing:** themed flavor ("Guard Simmons reports…") vs. terse
   formal text. Proposal: themed skin with a tap-to-toggle formal reading.
