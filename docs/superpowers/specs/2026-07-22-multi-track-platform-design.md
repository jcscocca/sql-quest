# Multi-track learning platform — design

**Date:** 2026-07-22 · **Status:** approved, phased build not yet started

Turn SQL Quest from a SQL trainer into a learning platform where SQL is one
**track** of many. Scope, agreed during brainstorming: **code + technical
concepts** — not broad general learning. First new tracks: **JavaScript/TS**
and **Python** (executable), plus **Systems Design** (concept). Stays 100%
client-side — no backend, no accounts, offline-capable, static GitHub Pages —
with execution behind an interface so a backend is a later drop-in, never a
rewrite.

## The seam: Core vs. Track

The codebase already splits cleanly along the line this expansion needs.

- **Core — subject-agnostic, already built (keep as-is):** the
  `Curriculum → Region → Skill → Exercise` tree, `requires` prerequisite edges,
  XP, streaks, mastery decay, the SM-2-lite **Daily Review**, the hint ladder,
  badges, IndexedDB progress, the screen shell/router. None of it knows the
  subject is SQL.
- **SQL-welded today — to abstract:** content fields named for SQL
  (`lesson.exampleSql`, `Exercise.referenceSql`, `orderMatters`); `WorldSchema`
  (models *a database*); `compare.ts` (tabular result-diffing); DuckDB-WASM
  execution; the catch/collection mechanic (matches result cells).

**Reframe:** a **Track** is a pluggable bundle of five ports — *content schema,
input/editor, execution, verification, reward*. SQL becomes Track #0 behind that
interface; the Core stays put; every new subject is a plugin.

### Track port matrix

| Track | Input | Execution | Verification | Reward |
|---|---|---|---|---|
| **SQL** ✓ | SQL editor | DuckDB-WASM | result-grid diff | catch entities |
| **JavaScript/TS** | code editor (CodeMirror) | Web Worker | test cases / stdout | XP + badges |
| **Python** | code editor | Pyodide | asserts / stdout | XP + badges |
| **Systems Design** | drill / case UI | — none — | answer-check / checkpoints | XP + badges |

Only **two ports are new** versus today: **execution** (swap DuckDB for a Web
Worker or Pyodide) and **answer-check verification** (Systems Design has no
result to diff).

## Execution & hosting

Client-side only, using in-browser runtimes: DuckDB-WASM (SQL), native JS in a
Web Worker (JS/TS), Pyodide (Python). Compiled/toolchain languages
(Rust/Go/C++/Java) are **out of scope for execution** — they could exist as
concept tracks but never run in-browser. Execution is an adapter interface, so a
remote runner is a future drop-in that touches neither Core nor content.

## Systems Design track

- **Flavor:** data-systems / data-architecture (the user's day job as a data
  engineer) — *not* the generic "design Twitter" distributed-systems interview
  canon. Grounded in public-sector / police data engineering, thematically
  consistent with the existing Seattle 311 civic-data world.
- **Skills (illustrative; refined in that phase's spec):** Ingestion &
  Streaming · Storage & Retention · Data Modeling (NIBRS) · Real-Time Fusion ·
  Governance & CJIS.
- **Scenarios to author around:** CAD/911 real-time ingestion; ALPR retention
  (geo + time-series, legal caps); body-worn-camera object storage & FOIA
  redaction; crime warehouse + NIBRS/UCR dimensional modeling; real-time crime
  center fusion; open-data publishing & PII de-identification; CJIS / retention
  governance; cross-system entity resolution (CAD/RMS/jail).
- **Format — the blend (approved):**
  - **Decision drills** — scenario + one defined-correct answer (pick the
    store/index/pattern, estimate capacity, spot the bottleneck). Auto-graded;
    feeds the daily/spaced-rep loop.
  - **Guided case-builds** — design one system across checkpointed steps
    (requirements → capacity estimate → storage → schema/partitioning →
    batch/stream → failure modes → retention/CJIS); each checkpoint is
    defined-correct and locks in before the next. The marquee lessons.
  - **Open + rubric capstones** — later: open prompt, self-graded against a
    revealed model answer + checklist.
- **Verification adapters this needs:** multiple-choice/exact; numeric with
  tolerance (estimation); an ordered multi-checkpoint sequence.

## Build order

Each phase is its own spec → plan → ship cycle. Systems Design is front-loaded
because it is the user's priority and it proves the new answer-check port.

0. **Extract the Core, define the Track interface.** SQL becomes Track #0 —
   zero behavior change, `npm run validate` stays green. Generalize content
   types (rename `exampleSql`/`referenceSql`, make `WorldSchema` an optional
   per-track "context"), and lift `compare.ts` behind a verification interface
   with the current tabular-diff as the SQL implementation. The enabling
   refactor; de-risks everything downstream.
1. **Systems Design — decision drills.** Proves the answer-check port (new to
   the codebase); cheapest SD format to author; ships a usable section fast.
2. **Systems Design — guided case-builds.** Adds checkpoint / multi-step
   verification; the marquee lessons.
3. **JavaScript/TS track.** Proves the execution port is pluggable — cheapest
   runtime (native, no download), reuses CodeMirror + the run/submit loop;
   test-case verification.
4. **Python track (Pyodide).** Second runtime; high value for data-eng; lazy
   multi-MB load. Then broaden content across all tracks.

## Validation & testing

- The content validation harness generalizes per track: SQL runs reference SQL
  against DuckDB (as today); code tracks run the reference solution against test
  cases; Systems Design validates that every drill/checkpoint has exactly one
  defined-correct answer and all required fields. It gates every content change,
  as now.
- Unit tests per adapter (execution, verification); an e2e smoke path per track.

## Open threads (non-blocking)

- **Reward beyond SQL:** non-SQL tracks reward with **XP + badges only**
  (decided). Themed collectibles — e.g. Systems Design "pattern cards" (Event
  Sourcing, Star Schema, CQRS…) — are deferred as optional later polish.
- **Branding:** the "SQL Quest" name becomes a misfit once a second track lands;
  rename TBD, not urgent — revisit when Phase 3/4 ships.
- **Content authoring** is the main ongoing effort (SD scenarios, then code
  exercise banks); adding content must never require app-code changes, per the
  existing content-driven principle.
