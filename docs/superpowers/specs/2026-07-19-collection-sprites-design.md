# Collection Sprites — Design Spec

**Date:** 2026-07-19
**Status:** Approved design, pre-implementation
**Depends on:** the world-swap project (drop Movies, add Digimon) for the Digimon sprite pack only; the Pokémon and Yu-Gi-Oh packs have no dependency.

## What this is

Real art on the collection page and the post-solve Caught chip: per-species sprites for Pokémon, per-card art for Yu-Gi-Oh, per-Digimon art for Digimon. Everything is downloaded once at build time, committed to the repo, and served locally — the app stays fully offline, honoring the original design rule that rejected remote images.

Decided in the same session (spec'd separately): Movies is dropped as a world and Digimon added; Seattle 311 stays as the data-only civic world (it has no collectibles and is untouched by this feature).

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Which worlds get art | Pokémon, Yu-Gi-Oh, Digimon (Seattle 311 has no collection; Movies dropped) |
| Pokémon source | PokéAPI sprites GitHub repo, by Pokédex id — 96×96 PNGs, bundled |
| Yu-Gi-Oh source | YGOPRODeck `cards_small` images (268×391 JPG, ~27KB), whose API guide requires download-and-self-host — bundled after downscaling |
| Digimon source | DAPI (digi-api.com) per-Digimon PNGs, same catchable-set pipeline |
| Which cards/Digimon to bundle | Only the *catchable set* — see below; measured 2,052 Yu-Gi-Oh cards on today's banks (~54MB raw, ~5–8MB downscaled) |
| Tile layout | Dense sprite gallery: sprite on top, tiny name below, label-tinted background, no label text |
| Caught chip | Also shows the art (~28px thumbnail) — the reward moment is where art pays off |
| Lookup architecture | Per-world sprite pack with `manifest.json` (entity name → file); no name-derived paths |
| Licensing stance | Non-commercial personal fan project; all three sources are fan-maintained databases with this exact use pattern |

## The catchable-set insight

Catches only fire on a successful submit (`ExerciseScreen.tsx` — `outcome.equal` gates `pickCatches`), and success means the user's result rows match the reference output. Therefore the set of entities that can *ever* be caught is exactly: string cells of every exercise's reference output that are entity names, plus authored `collectibles`. This is finite and computable by running every reference query — which `validate-content.ts` already does. Bundling that set gives full art coverage without bundling 13k cards (~360MB).

Measured 2026-07-19 on current banks: 9 Yu-Gi-Oh skills, 53 exercises, 2,052 distinct catchable cards. The set grows as exercises are authored; the builder recomputes and downloads incrementally.

## Components

### 1. Sprite builder — `scripts/build-sprites.ts`

One script, run per world (`npm run build:sprites [world]`), writing `public/sprites/<world>/`:

- **pokemon/** — every row of the `pokemon` table: download `PokeAPI/sprites` repo `sprites/pokemon/<id>.png` (96×96, ~1–2KB each; ~1–2MB total), saved as `<id>.png`, kept as-is (already tile-sized pixel art). Manifest maps `name → <id>.png`.
- **yugioh/** — compute the catchable set (reference outputs ∩ card names, plus `collectibles`, via `@duckdb/node-api` exactly like the validate harness), map names → card ids from the `cards` table, download `images.ygoprodeck.com/images/cards_small/<id>.jpg`, resize to 96px-wide WebP via `sharp`, save as `<id>.webp`. Manifest maps `name → <id>.webp`.
- **digimon/** — same catchable-set pipeline against the Digimon world once it exists; images from DAPI (`digi-api.com/images/digimon/...`), resized to 96px-wide WebP.

Builder behavior: skip files that already exist (incremental, append-only like the other builders); throttle downloads (≤5/sec, well under YGOPRODeck's 20/sec limit); print per-world counts and any misses. A source image that 404s is recorded as a miss and left out of the manifest — it must not fabricate art. All outputs are committed.

`manifest.json` shape: `{ "entities": { "<entity name>": "<file>" } }`. Names are the exact entity-column values (the same strings stored in collection entries), so punctuation-heavy card names need no slugification.

### 2. App lookup — `src/lib/sprites.ts`

A tiny resolver: load a world's manifest once (`fetch('/sprites/<world>/manifest.json')`, cached in a module map, `null` on 404), then resolve entity name → image URL, or `null` when the world has no pack or the name has no entry. Exact function shape is the plan's call.

No engine involvement; the collection page stays wasm-free.

### 3. Collection tiles — `CollectionScreen.tsx`

Per world section, load the manifest, then render each entry as a gallery tile: image (56px display, `image-rendering: pixelated` for Pokémon), name beneath in small type with ellipsis, background tinted with the existing per-label color palette (the `type-<label>` colors move from a border-left accent to a soft background gradient in a tile-specific rule). Entries with no art (legacy migrated entries, manifest misses) fall back to the current text tile unchanged. Seattle 311 never appears (no collectibles); a world with no manifest renders text tiles as today.

### 4. Caught chip — `ExerciseScreen.tsx`

On catch, alongside the existing name chip, show the sprite at ~28px when the world manifest resolves one. Manifest is loaded lazily on first catch of the session; failure to load degrades to the current text-only chip.

### 5. Validation gate — `scripts/validate-content.ts`

For each world with both an `entity` and a sprite pack directory, recompute the catchable set and **fail** validation for any catchable entity missing from the manifest, with the message naming the fix (`npm run build:sprites <world>`). This makes "authored a new exercise → new catchable card → art missing" a hard gate, keeping coverage total forever. A world with an entity but no pack at all (e.g., mid-migration) produces a warning, not a failure, so the world-swap project can land content before its sprite pass.

## Error handling

- Build-time: network failures retry twice then record a miss; the builder never writes a partial manifest (write last, atomically).
- Runtime: missing manifest, missing entry, or broken image (`onerror`) all degrade to the current text tile. No spinner states — manifests are a few KB.

## Testing

- Unit: `sprites.ts` manifest caching, 404 → null, name resolution including punctuation-heavy names; tile fallback logic.
- e2e: extend the existing collection e2e — a seeded Pokémon entry renders an `<img>` with the expected `/sprites/pokemon/` src; the multi-world test still passes with yugioh art present. Catch-flow e2e asserts the chip contains an image for a pokemon catch.
- Full gate: `npm test && npm run validate && npm run build && npm run e2e`, with validate now enforcing sprite coverage.

## Out of scope

- Movies removal and the Digimon world/curriculum — the world-swap project (separate spec; lands first).
- Art anywhere else (Home world panel, badges, schema browser).
- Animated sprites, shiny variants, alternate forms beyond the default-form `pokemon` table.
