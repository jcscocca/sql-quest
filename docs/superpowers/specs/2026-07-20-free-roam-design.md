# Free Roam (Unlock All Content) — Design Spec

**Date:** 2026-07-20
**Status:** Approved design, pre-implementation

## What this is

An opt-in setting that makes every skill in the tree openable regardless of its prerequisites, so the app can be used for free practice instead of strictly sequential progression. Off by default; toggling it off restores current behavior exactly.

## Why it is safe to build this way

Investigation (2026-07-20) established that the app has exactly **one** functional gate: `const unlocked = skill.requires.every(completed)` at `src/components/HomeScreen.tsx:88`, whose value drives the `disabled` attribute (`:93`), the node className (`:94`), and the ✓/▶/🔒 badge (`:97`). There is no second gate downstream — `App.tsx` routes to the exercise screen on nothing but a resolvable `skillId`, and `ExerciseScreen` never reads `skill.requires` or another skill's completion. A skill opened with no prior progress renders its lesson and first exercise normally (`solved` defaults to `[]`).

Unlock state is **derived at render, never persisted**: `ProgressState` (`src/lib/progress.ts:20-26`) has no unlock field. This is why a bypass is reversible and why the alternative — seeding `completed: true` — is rejected below.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Mechanism | Gate bypass at the single `unlocked` binding. **Never** write `completed: true`. |
| Storage | `unlockAll?: boolean` on `ProgressState`; travels with Export/Import |
| Default | Off (absent/`undefined` reads as `false`) |
| Not-yet-earned node appearance | Full opacity, dashed border, muted text, 🔓 glyph — distinct from both ✓ (green) and ▶ (yellow) |
| Control placement | A "Free roam" toggle button in the header `.stats` cluster beside Export/Import (`HomeScreen.tsx:41-46`) |
| World panel | Unchanged — keeps reporting real completion |

**Rejected: seeding `completed: true`.** Completion is sticky (`prev.completed ||`, `progress.ts:124`), so seeding is irreversible; it floods Daily Review with drills for unseen content that can never clear (the schedule only advances after a full queue is finished), grants all skill and region badges on the next hydrate, and permanently suppresses the node-completion celebration for skills later finished for real.

## Components

### 1. Progress store — `src/lib/progress.ts`

- `ProgressState` gains `unlockAll?: boolean` (optional — this is what keeps old saves valid).
- `ProgressStore` gains `setUnlockAll(value: boolean): void`, persisting via the existing path.
- The field must be added to **all three** places that re-materialize the state shape from a hardcoded field list, or it is silently dropped on the next mutation and missing from exports:
  - `dataOf` (`:89`)
  - `importState` (`:195`)
  - `exportState` (`:210`)
- **Not** defaulted inside `normalize()` (`:68`): `hydrate` re-persists whenever `JSON.stringify(normalized) !== JSON.stringify(saved)`, so introducing a default there would rewrite every existing user's blob on load. Consumers read `unlockAll ?? false`.
- `isProgressState` (`:55`) needs no change (it validates only version/xp/streak/skills), so pre-existing saves and older export files import unchanged. A permissive guard (`undefined` or boolean) may be added since nothing else type-checks the field.

### 2. Home screen — `src/components/HomeScreen.tsx`

- Line 88 becomes `const unlocked = unlockAll || skill.requires.every(completed)`. Because `disabled`, the className, and the badge glyph all derive from this one binding, no other gating edit is needed.
- The badge and className must distinguish three states rather than two when free roam is on: earned-and-complete (✓), genuinely available (▶), and roamed-into (🔓 + `locked` class). The `locked` class is retained on not-yet-earned nodes precisely so they stay visually marked.
- A "Free roam" toggle button joins the `.stats` cluster, reflecting current state and calling `setUnlockAll`.

### 3. Styles — `src/styles.css`

Today a locked node's dimmed look comes solely from the global `button:disabled { opacity: 0.45 }` (`:31`); there is no `.node.locked` rule (only `.node.done` and `.node.open`, `:68-69`). Because free roam removes `disabled`, a `.node.locked` rule must be **added** (dashed border, muted text) or roamed-into nodes become visually identical to available ones.

## Deliberately unchanged

- **World panel** (`App.tsx:128`) keeps deriving its 🔒/▶/✓ from real completion. It may show 🔒 for a region being roamed — accepted as honest. Force-unlocking it would make `requires.every(...)` vacuously true for every row, flipping all rows to ▶ and destroying the panel's signal (and breaking the existing e2e assertion on that glyph).
- **Daily Review, badges, XP, catches** all key off `completed`, which a bypass never sets. Review therefore has nothing new to schedule until a bank is genuinely finished — the correct outcome.

## Known accepted quirks

- The world panel can display 🔒 above an open tree (above).
- Arena content assumes prerequisites: lessons and hint ladders authored for a sequential learner will read as non-sequitur when roamed into early. Hard, not broken.
- `arena-seattle` awards no catches because the seattle311 world has no `entity` — pre-existing, but likely to be noticed first by a roaming user.

## Error handling

There are no new failure modes: the flag is a local boolean with no I/O. A save lacking the field reads as `false`; a malformed value is coerced by `?? false` at the read site.

## Testing

- **Unit** (`src/lib/progress.test.ts`): the flag survives a mutation round-trip (set it, then record a solve, confirm it is still set — this is the regression that catches a missed `dataOf` entry); `exportState`/`importState` round-trips it; a save without the field hydrates with it falsy and is not rewritten.
- **e2e** (`e2e/smoke.spec.ts`): seed a save with `unlockAll: true` and confirm a node whose prerequisites are unmet opens its lesson. Default-off behavior keeps existing lock assertions valid.
- **Gate**: `npm test && npm run validate && npm run build && npm run e2e`.

## Out of scope

- Cross-machine sync of progress (XP, streak, mastery/review schedule, collection, badges). Free roam relieves one symptom of that gap and is not a substitute; import currently *replaces* rather than merges, which is the real gap there.
- Any change to the review scheduler, badge rules, or curriculum content.
