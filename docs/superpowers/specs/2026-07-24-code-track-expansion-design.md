# Code Track Expansion — JavaScript & Python to SQL parity

Grow the JavaScript and Python tracks from 2 skills / 6 exercises each into
full ~5-region curricula at SQL-parity depth (~23 skills, ~110–120 exercises
per track). The blocker to a genuinely comprehensive curriculum is the test
harness, not the content, so this lands in two phases: first widen the
verification engine, then author against the wider ceiling.

## Goal & context

The SQL track is comprehensive — 24 skills across 5 regions, 142 exercises over
four real-data worlds, all executed against DuckDB and resurfaced by Daily
Review. The code tracks are stubs: JavaScript and Python each have 2 skills and
6 abstract exercises (`add`, `fizzbuzz`, `count_vowels`), verified by a
JSON-round-trip test schema.

That schema is the ceiling. A test is `{ input: unknown[], expected: unknown }`,
and both values must survive JSON marshalling out of the worker so JavaScript
can compare them. This structurally forbids a large slice of an intermediate
curriculum: Python sets/tuples/`frozenset` cannot even be expressed as an
expected value (`json.dumps({1,2})` raises), and neither language can assert on
a raised exception, a class instance, a generator, a float within tolerance, or
an in-place mutation. Those are exactly the topics that make regions 3–4 of a
real language curriculum worth doing.

So expanding content first would mean either routing the curriculum around its
own subject matter or piling unverified content onto the least-gated track
(Python solutions are not executed at validate time today —
`scripts/validate-content.ts` does structural checks only, a reasonable call at
6 exercises, untenable at ~120). This design fixes the engine first.

## Scope

In scope:

1. **A richer test schema** — in-language expression pairs — replacing the
   JSON-round-trip schema for both code tracks.
2. **A Python execution gate** — `npm run validate` runs every Python solution
   against its tests via Pyodide, matching how SQL (DuckDB) and JS (`new
   Function`) are already gated.
3. **Full curricula** — ~5 regions / ~23 skills / ~110–120 exercises per track,
   abstract early and grounded in the existing worlds later.

Explicitly **out of scope** (stated as decisions, not omissions):

- **Daily Review for code tracks.** `assembleReview` (`src/lib/review.ts`) stays
  SQL-only. Code skills complete and earn badges but do not enter the spaced
  rotation. This gap widens as content grows; accepted for now. It is the
  natural next project.
- **Collectibles / world-catching for code tracks.** Code tracks reward XP +
  badges only. No entity catching into the Collection. Also a natural follow-on.
- **Float tolerance as a schema feature.** Authors round inside the expression
  (see below). A tolerance field is added only if authoring proves it necessary.

## The verification engine

### Test schema

`JsTest` (`{ input, expected }`) is replaced by one shared `CodeTest`, used by
both `JsExercise` and `PyExercise`:

```ts
export interface CodeTest {
  setup?: string    // statements executed first, in the solution's scope
  expr: string      // expression whose value is checked
  expect?: string   // expression giving the expected value; omit iff `raises` set
  raises?: string   // instead of expect: the error-type name expr must throw
}
```

`expr` and `expect` are both source in the exercise's own language. The runner
executes `setup`, evaluates `expr` and `expect`, and compares them **natively**
in the target runtime — Python `==`, JS `deepEqual`. Only a verdict plus
rendered reprs cross the worker boundary. The JSON marshalling layer is deleted,
and with it the round-trip ceiling: sets, tuples, `frozenset`, `Decimal`, custom
`__eq__`, generators (via `list(...)`), and mutation all become expressible.

Examples:

```json
{ "expr": "unique([1,1,2])", "expect": "{1, 2}" }
{ "expr": "divmod(7, 2)", "expect": "(3, 1)" }
{ "setup": "acc = Account(100)\nacc.withdraw(30)", "expr": "acc.balance", "expect": "70" }
{ "setup": "xs = [3,1,2]\nsort_in_place(xs)", "expr": "xs", "expect": "[1,2,3]" }
{ "expr": "sqrt(-1)", "raises": "ValueError" }
```

`expect` and `raises` are mutually exclusive: exactly one is present per test.

### Per-language mechanics

**Python** (`src/lib/py-worker.ts`). Drop the `_json` bridge and the `_run_case`
helper. Exec the solution once into a base namespace. Per test: shallow-copy the
namespace (isolating mutations between tests), `exec(setup, ns)`, then
`eval(expr, ns)` and `eval(expect, ns)`; compare with `==`. Return
`repr(actual)` and `repr(expected)` for display. For `raises`, evaluate `expr`
inside `try/except`, pass iff the caught exception's `type(e).__name__` equals
`raises` (a bare `expr` that does not raise fails the test). Python's `==` gives
correct comparison for sets, tuples, `frozenset`, `Decimal`, dataclasses, and
any custom `__eq__` for free.

**JavaScript** (`src/lib/js-worker.ts`, `src/lib/js-runtime.ts`). Per test,
build a `new Function` whose body is `code` + `setup` + `return [eval(exprStr),
eval(expectStr)]`; a direct `eval` in that body sees the solution's function
declarations and any `setup` bindings. Compare the two evaluated values with
`deepEqual`, which grows cases for `Set` and `Map` (currently arrays + plain
objects, `src/lib/js-runtime.ts:10`). For `raises`, wrap the `eval` in
`try/catch` and match `err.name`. Each test gets its own `new Function`, so no
state leaks between tests.

**Shared Python runner.** The Python runner source (namespace copy, setup/exec,
eval, compare, repr, raises handling) is a single string constant imported by
both `py-worker.ts` and the validator, so the browser and CI verify with
identical semantics.

### Float tolerance

Not a schema field. Authors round in the expression:
`{ "expr": "round(area(2), 2)", "expect": "12.57" }`. If float-heavy exercises
(geometry, stats) make this ergonomically bad during authoring, add a tolerance
field then — deferred under YAGNI.

### `functionName`

Retained on the exercise as documentation and to drive the starter template, but
the runner no longer consumes it (the `expr` names the entry point directly).
The validator asserts the solution defines it.

### Content types & migration

`src/lib/content.ts`: `JsTest` → `CodeTest` as above; `JsExercise.tests` and
`PyExercise.tests` become `CodeTest[]`. Add optional `fixture?: string` to both
exercise types (see Fixtures). `TestResult` (`src/lib/js-runtime.ts`) carries
`expected` and `actual` as preformatted repr strings rather than raw values.

The 12 existing exercises convert mechanically to the new schema in the engine
phase (`{ input:[1,2], expected:3 }` → `{ expr:"add(1,2)", expect:"3" }`). No
legacy path is kept — there is exactly one schema afterward.

### CodeScreen

`src/components/CodeScreen.tsx` changes minimally: `TestResult.expected/actual`
are already-formatted repr strings, rendered directly instead of
`JSON.stringify`'d, and the failure line may name the failing `expr`. The
Run/Submit/hint/completion flow is untouched.

### Validation gate

`npm run validate` (`scripts/validate-content.ts`) gains a one-time Pyodide load
(add `pyodide` as a dev-dependency, pinned to the runtime's version — 0.26.2 per
`src/lib/py-worker.ts`; ~1–3s startup per run) and executes every Python
solution against its tests using the shared runner. JavaScript validation
moves from the current `new Function(solution)`-then-call approach to the same
`expr`/`expect` evaluation the browser uses. Structural gates for both tracks:
bank `skillId` matches, unique exercise ids, `functionName` present and defined
by the solution, `starter`/`solution` present, exactly 3 hints, every test has
`expr`, and `expect` xor `raises`. Result: no unverified track remains.

## Curricula

Both tracks mirror the SQL arc (Foundations → building blocks → composition →
applied capstone) across 5 regions, escalating abstract → grounded exactly where
SQL escalates SELECT → Boss Arenas. The tracks are parallel and independent.
`[existing]` marks already-shipped skills that will be converted and extended.

### JavaScript

| Region | Skills |
|---|---|
| **1 · Foundations** | js-basics `[existing]` · conditionals & logic · numbers & Math · strings · loops & accumulation |
| **2 · Arrays & Iteration** | js-arrays `[existing]` · reduce & aggregation · sorting & comparators · searching (find/some/every) · nested arrays & flatten |
| **3 · Objects, Maps & Sets** | objects & properties · grouping & counting · **Map & Set** · destructuring & spread · arrays-of-records *(grounded intro)* |
| **4 · Functions & Classes** | higher-order functions · closures · recursion · **error handling (throw)** · **classes & methods** |
| **5 · Applied Data** | Pokémon records · Yu-Gi-Oh! analytics · Seattle 311 wrangling |

### Python

| Region | Skills |
|---|---|
| **1 · Foundations** | py-basics `[existing]` · conditionals & truthiness · numbers & divmod · strings & f-strings · loops, range & enumerate |
| **2 · Lists & Comprehensions** | py-collections `[existing]` · comprehensions · sorting with `key=` · nested lists & zip · **tuples & unpacking** |
| **3 · Dicts & Sets** | dictionaries · grouping & counting · **sets & membership** · dict comprehensions · lists-of-records *(grounded intro)* |
| **4 · Functions & Classes** | higher-order functions & lambdas · recursion · **generators** · **exceptions** · **classes & dataclasses** |
| **5 · Applied Data** | Pokémon records · Yu-Gi-Oh! analytics · Seattle 311 wrangling |

The **bolded skills are the engine's payoff** — Map/Set, tuples, sets,
generators, exceptions, classes are precisely what the old schema could not
test. They cluster in regions 3–4, so the richer schema is load-bearing for
roughly a third of each curriculum, not decoration.

Prerequisite chains mirror SQL's mostly-linear shape with a couple of branches
inside a region; each region's first skill requires the prior region's capstone.
Exact `requires` edges are a plan-level detail.

### Grounding & fixtures

Grounding turns on in region 3 (the `records` intro skills) and dominates region
5. The Applied Data region operates on small **curated inline JSON fixtures**
derived by hand from the existing worlds — ~15–20 records as a list of
dicts/objects (e.g. Pokémon with `name`/`type`/`attack`; Yu-Gi-Oh! cards with
`name`/`archetype`/`atk`). No Parquet/DuckDB path; the data rides along in the
test. This is the thematic tie to the SQL half without a second data pipeline.

To avoid repeating a fixture across all of an exercise's tests, each exercise may
carry an optional `fixture?: string` of statements prepended to every test's
`setup` in that exercise. Written once per exercise, honored by both the runner
and the validator. Fixtures are hand-curated and kept small enough to read.

### Density

4–6 exercises per skill, weighted: 4–5 for mechanical early skills, 6–8 for
grounded/complex ones. This lands each track near ~110–120 exercises —
SQL-parity depth without padding easy skills to a quota. Across both tracks:
~46 skills and ~230 new exercises (the 12 existing convert into a ~240 total).

## Testing

- **Unit tests** for the parts that can silently rot: `deepEqual`'s new
  `Set`/`Map` cases; `raises` matching on both sides; per-test namespace
  isolation (a mutation in one test must not leak into the next); the shared
  Python runner's compare/repr/raises behavior.
- **E2e smoke** gains one JavaScript and one Python path solved end-to-end;
  today `e2e/smoke.spec.ts` exercises only SQL.
- **Content gate** (`npm run validate`) runs on every content change, now
  executing both code tracks fully. Green gate is the definition of done for
  each authoring increment.

## Docs

- `README.md` track bullets get real region names and exercise counts.
- The multi-track spec (`docs/superpowers/specs/2026-07-22-multi-track-platform-design.md`)
  status note flips "broaden content across all tracks" from future work to
  done, and records that Daily Review + collectibles for code tracks remain the
  open follow-ons.

## Implementation phasing

Each phase ends validate-green and is independently shippable.

0. **Engine.** `CodeTest` schema; rewrite `js-worker`/`js-runtime` and
   `py-worker` to the expr/expect model; shared Python runner; add the Pyodide
   validation gate; update `content.ts`, `CodeScreen`, and the validator;
   convert the 12 existing exercises; unit + e2e coverage. No new content yet —
   proves the port with behavior parity on existing skills.
1–5. **Curriculum, one region-pair per phase** (JS + Python region N together,
   since they're parallel and share conventions). Author skills + exercises +
   lessons + fixtures; each region-pair lands validate-green before the next.
   Region 5 (Applied Data) authored last, after fixtures conventions are proven
   in region 3.

Ordering rationale: the engine is the enabling refactor and de-risks all
downstream authoring; regions ship in curriculum order so prerequisite chains
are always satisfiable as content lands.

## Open threads (non-blocking)

- **Branding.** "SQL Quest" is already a misfit with three tracks; this
  expansion sharpens that. Rename still deferred — not in scope here.
- **Float tolerance field** — add iff authoring demands it (see above).
- **Daily Review + collectibles for code tracks** — the two deferred non-goals,
  each its own future spec → plan → ship cycle.
