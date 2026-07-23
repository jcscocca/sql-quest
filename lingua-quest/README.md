# 🗺️ Lingua Quest

A single-player **language-learning** trainer: a Duolingo-style skill tree with
one XP / streak / badge / spaced-review backbone, all in-browser with no
accounts. **Starts with Spanish** 🇪🇸 and is built to add more languages as pure
content.

Inspired by the [SQL Quest](../README.md) coding trainer in this repo — it
borrows the same learning backbone (skill tree, XP, streaks, spaced-repetition
Daily Review, a collection to fill, IndexedDB persistence, free roam) and
retargets it at real languages.

## What's inside

- **A real Spanish course** — 5 units, 13 skills, ~120 exercises:
  greetings, courtesy, people, numbers, colors, days, food, family, animals,
  *ser* vs *estar*, *tener*, common verbs, and a boss review.
- **Five exercise types**, each graded in-browser:
  - **Choose** the correct translation or meaning
  - **Type** the translation (accent-lenient — a missing accent is accepted with a nudge)
  - **Listen** and type what you hear — spoken by the browser's **Web Speech API**
    (no network, no accounts; the app's in-browser "engine")
  - **Build** the sentence from a word bank
  - **Match** Spanish words to their meanings
- **A vocabulary collection** — every correct answer catches the words it teaches
  into a searchable notebook you can hear read aloud.
- **Daily Review** — completed skills resurface on an expanding schedule
  (2 → 4 → 8 … days); getting rusty pulls mastery down until you practice.

## Run it

    npm install
    npm run dev        # → http://localhost:5173

## Develop

    npm test           # unit tests (checking, XP, streaks, review, progress, content)
    npm run validate   # content gate: replays every intended answer through the real checker
    npm run build      # typecheck + production build
    npm run e2e        # Playwright smoke test

## Content

All content is JSON under `public/content/` — adding a language or a lesson
never touches app code.

- `public/content/courses.json` — the list of languages (id, name, flag, TTS voice)
- `public/content/<lang>/curriculum.json` — units → skills (the tree + prerequisites)
- `public/content/<lang>/skills/<skill>.json` — the exercise bank for a skill

Every change must pass `npm run validate`, which checks structure **and** that
each exercise's intended answer actually passes the grader.

### Adding another language

1. Add an entry to `courses.json` with a BCP-47 `voice` (e.g. `fr-FR`).
2. Add `<lang>/curriculum.json` and a bank per skill under `<lang>/skills/`.
3. `npm run validate`. That's it — the language picker appears automatically
   once more than one course exists.

## Progress

Stored in IndexedDB — no accounts. **Export / Import** buttons on the home
screen back up progress as JSON.

**Free roam** — a header toggle that opens every skill regardless of
prerequisites, for practice out of order. Anything you solve still earns XP,
completes the node, and enters Daily Review exactly as it would in sequence.
