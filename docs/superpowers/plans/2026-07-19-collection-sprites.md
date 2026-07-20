# Collection Sprites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real art on collection tiles and the Caught chip — per-species Pokémon sprites, per-card Yu-Gi-Oh art, per-Digimon art — fully bundled/offline, per `docs/superpowers/specs/2026-07-19-collection-sprites-design.md`.

**Architecture:** One builder (`scripts/build-sprites.ts`) computes each world's *catchable set* (entity names in reference outputs + authored collectibles — catches only fire on reference-matching submits), downloads source images once (PokéAPI sprites repo by Pokédex id; YGOPRODeck `cards_small` by card id; DAPI by digimon id), downscales card/digimon art to 96px-wide WebP via `sharp`, and writes `public/sprites/<world>/{files, manifest.json}` where the manifest maps exact entity name → file. The app resolves art through a tiny cached manifest loader (`src/lib/sprites.ts`); tiles and the catch chip degrade to today's text rendering when art is missing. `npm run validate` gains a hard coverage gate: a catchable entity missing from an existing manifest fails validation.

**Tech Stack:** TypeScript + tsx, `@duckdb/node-api`, `sharp` (new devDependency), vitest, Playwright.

**Measured inputs (2026-07-19, post-world-swap):** yugioh catchable = 2,052 cards (~27KB source JPGs, 268×391); digimon catchable = 129; pokemon = every `pokemon` table row (≈1,025 species; source PNGs are 96×96, ~1–2KB, kept as-is). Expected committed payload ≈ 8–11MB total.

---

## File structure

- Create: `scripts/build-sprites.ts`; `public/sprites/{pokemon,yugioh,digimon}/` (committed images + `manifest.json` each)
- Create: `src/lib/sprites.ts`, `src/lib/sprites.test.ts`
- Modify: `package.json` (`build:sprites` script, `sharp` devDep), `scripts/validate-content.ts` (coverage gate), `src/components/CollectionScreen.tsx`, `src/components/ExerciseScreen.tsx`, `src/styles.css`, `e2e/smoke.spec.ts`, `README.md`, `docs/superpowers/specs/2026-07-18-sql-learning-app-design.md` (one amendment)

---

### Task 1: Sprite builder + committed asset packs

**Files:**
- Create: `scripts/build-sprites.ts`
- Modify: `package.json`

- [ ] **Step 1: Install sharp.** `npm install -D sharp` (commit package.json + package-lock.json changes with this task).

- [ ] **Step 2: Write the builder.** Full content of `scripts/build-sprites.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { DuckDBInstance } from '@duckdb/node-api'
import sharp from 'sharp'

const WORLDS = ['pokemon', 'yugioh', 'digimon'] as const
type SpriteWorld = (typeof WORLDS)[number]

const arg = process.argv[2] as SpriteWorld | undefined
if (arg && !WORLDS.includes(arg)) throw new Error(`unknown world "${arg}" — expected one of ${WORLDS.join(', ')}`)
const targets: readonly SpriteWorld[] = arg ? [arg] : WORLDS

interface Skill { id: string; world: string }
interface Bank { exercises: { referenceSql: string; collectibles?: string[] }[] }
interface WorldSchema { entity?: { table: string; column: string }; tables: { name: string }[] }

const curriculum = JSON.parse(readFileSync('public/content/skills.json', 'utf8')) as { regions: { skills: Skill[] }[] }
const skills = curriculum.regions.flatMap(r => r.skills)

const db = await DuckDBInstance.create()
const conn = await db.connect()
for (const w of new Set(skills.map(s => s.world))) {
  const schema = JSON.parse(readFileSync(`public/worlds/${w}/schema.json`, 'utf8')) as WorldSchema
  for (const t of schema.tables)
    await conn.run(`CREATE OR REPLACE TABLE ${t.name} AS SELECT * FROM 'public/worlds/${w}/${t.name}.parquet'`)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// 404 => null (a recorded miss); network/server errors retry then throw BLOCKED.
async function fetchImage(url: string): Promise<Buffer | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      if (attempt === 3) throw new Error(`BLOCKED: ${url} failed after 3 attempts: ${err}`)
      await sleep(1000 * attempt)
    }
  }
}

async function catchable(world: string, entityTable: string, entityColumn: string): Promise<Set<string>> {
  const nameReader = await conn.runAndReadAll(`SELECT DISTINCT ${entityColumn} FROM ${entityTable}`)
  const names = new Set(nameReader.getRows().map(r => String(r[0])))
  const out = new Set<string>()
  for (const s of skills.filter(s => s.world === world)) {
    const bank = JSON.parse(readFileSync(`public/content/exercises/${s.id}.json`, 'utf8')) as Bank
    for (const ex of bank.exercises) {
      const reader = await conn.runAndReadAll(ex.referenceSql)
      for (const row of reader.getRows())
        for (const cell of row) if (typeof cell === 'string' && names.has(cell)) out.add(cell)
      for (const c of ex.collectibles ?? []) out.add(c)
    }
  }
  return out
}

function writeManifest(world: SpriteWorld, entities: Map<string, string>): void {
  const sorted = Object.fromEntries([...entities.entries()].sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(`public/sprites/${world}/manifest.json`, JSON.stringify({ entities: sorted }, null, 2))
}

async function toWebp(src: Buffer, outPath: string): Promise<void> {
  await sharp(src).resize({ width: 96 }).webp({ quality: 80 }).toFile(outPath)
}

interface BuildResult { world: SpriteWorld; entries: number; downloaded: number; misses: string[] }

async function buildPokemon(): Promise<BuildResult> {
  const dir = 'public/sprites/pokemon'
  mkdirSync(dir, { recursive: true })
  const rows = (await conn.runAndReadAll('SELECT id, name FROM pokemon ORDER BY id')).getRows() as [number, string][]
  const entities = new Map<string, string>()
  const misses: string[] = []
  let downloaded = 0
  for (const [id, name] of rows) {
    const file = `${id}.png`
    if (!existsSync(`${dir}/${file}`)) {
      const buf = await fetchImage(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`)
      await sleep(120)
      if (!buf) {
        misses.push(String(name))
        continue
      }
      writeFileSync(`${dir}/${file}`, buf)
      downloaded++
    }
    entities.set(String(name), file)
  }
  writeManifest('pokemon', entities)
  return { world: 'pokemon', entries: entities.size, downloaded, misses }
}

async function buildYugioh(): Promise<BuildResult> {
  const dir = 'public/sprites/yugioh'
  mkdirSync(dir, { recursive: true })
  const wanted = await catchable('yugioh', 'cards', 'name')
  const rows = (await conn.runAndReadAll('SELECT id, name FROM cards ORDER BY id')).getRows() as [number, string][]
  const idByName = new Map(rows.map(([id, name]) => [String(name), id]))
  const entities = new Map<string, string>()
  const misses: string[] = []
  let downloaded = 0
  for (const name of [...wanted].sort()) {
    const id = idByName.get(name)
    if (id === undefined) {
      misses.push(name)
      continue
    }
    const file = `${id}.webp`
    if (!existsSync(`${dir}/${file}`)) {
      const buf = await fetchImage(`https://images.ygoprodeck.com/images/cards_small/${id}.jpg`)
      await sleep(200)
      if (!buf) {
        misses.push(name)
        continue
      }
      await toWebp(buf, `${dir}/${file}`)
      downloaded++
    }
    entities.set(name, file)
  }
  writeManifest('yugioh', entities)
  return { world: 'yugioh', entries: entities.size, downloaded, misses }
}

async function buildDigimon(): Promise<BuildResult> {
  const dir = 'public/sprites/digimon'
  mkdirSync(dir, { recursive: true })
  const wanted = await catchable('digimon', 'digimon', 'name')
  const rows = (await conn.runAndReadAll('SELECT id, name FROM digimon ORDER BY id')).getRows() as [number, string][]
  const idByName = new Map(rows.map(([id, name]) => [String(name), id]))
  const entities = new Map<string, string>()
  const misses: string[] = []
  let downloaded = 0
  for (const name of [...wanted].sort()) {
    const id = idByName.get(name)
    if (id === undefined) {
      misses.push(name)
      continue
    }
    const file = `${id}.webp`
    if (!existsSync(`${dir}/${file}`)) {
      let imageUrl: string | undefined
      const cached = `data-src/digimon/detail/${id}.json`
      if (existsSync(cached)) {
        imageUrl = (JSON.parse(readFileSync(cached, 'utf8')) as { images?: { href: string }[] }).images?.[0]?.href
      } else {
        const res = await fetch(`https://digi-api.com/api/v1/digimon/${id}`)
        if (res.ok) imageUrl = ((await res.json()) as { images?: { href: string }[] }).images?.[0]?.href
        await sleep(200)
      }
      const buf = imageUrl ? await fetchImage(encodeURI(imageUrl)) : null
      await sleep(200)
      if (!buf) {
        misses.push(name)
        continue
      }
      await toWebp(buf, `${dir}/${file}`)
      downloaded++
    }
    entities.set(name, file)
  }
  writeManifest('digimon', entities)
  return { world: 'digimon', entries: entities.size, downloaded, misses }
}

const builders: Record<SpriteWorld, () => Promise<BuildResult>> = {
  pokemon: buildPokemon,
  yugioh: buildYugioh,
  digimon: buildDigimon,
}

for (const w of targets) {
  const r = await builders[w]()
  console.log(`${r.world}: ${r.entries} manifest entries, ${r.downloaded} downloaded now, ${r.misses.length} misses`)
  if (r.misses.length > 0) console.log(`  MISSES (no art, omitted from manifest): ${r.misses.join(', ')}`)
}
console.log('done')
```

- [ ] **Step 3: Wire the script.** In `package.json` scripts, after `"build:digimon"`, add:

```json
"build:sprites": "tsx scripts/build-sprites.ts",
```

- [ ] **Step 4: Run it.** `npm run build:sprites` (no arg = all three; first run downloads ~1,025 + 2,052 + 129 images at ~5/sec ≈ 12–15 min — use a long Bash timeout or run per-world). Expected per-world lines: pokemon ≈ 1,025 entries; yugioh 2,052; digimon 129; misses 0 or a short list (report them — do NOT fabricate or substitute art). Sanity: `du -sh public/sprites/*` ≈ 1–2MB / 6–9MB / <1MB; spot-open one file per world (`file public/sprites/yugioh/*.webp | head -3` → WebP 96px wide).

- [ ] **Step 5: Determinism check.** Re-run `npm run build:sprites` — second run must print `0 downloaded now` for every world and leave `git status` unchanged except (on first run) the new files.

- [ ] **Step 6: Commit.**

```bash
git add package.json package-lock.json scripts/build-sprites.ts public/sprites
git commit -m "feat: bundled sprite packs (pokemon, yugioh, digimon) with manifests"
```

---

### Task 2: Validation coverage gate

**Files:**
- Modify: `scripts/validate-content.ts`

- [ ] **Step 1: Add the gate.** In `validate-content.ts` the per-exercise loop already runs every `referenceSql`. Extend it:
  - After loading `worldSchemas`, build `entityNames: Record<string, Set<string>>` for each world with an entity (`SELECT DISTINCT <column> FROM <table>`), and an empty `catchableByWorld: Record<string, Set<string>>`.
  - Inside the existing per-exercise result handling (where reference output rows are available), for the exercise's world `w` with an entity: add every string cell that is in `entityNames[w]` to `catchableByWorld[w]`; also add each authored collectible (the collectible-existence check already runs there).
  - After the main loop, per world with an entity: if `public/sprites/<w>/manifest.json` exists, parse it and compute `missing = [...catchableByWorld[w]].filter(n => !manifest.entities[n])`; each missing name appends a failure: `` `${w}: catchable entity "${name}" has no sprite — run: npm run build:sprites ${w}` ``. If the manifest file does not exist, print a warning (`console.warn`) naming the world, and do not fail.

- [ ] **Step 2: Green run.** `npm run validate` → `✓ 142 exercises validated across 4 world(s)` with no sprite failures (packs from Task 1 are complete) and no warnings (all three packs exist; seattle311 has no entity so it is exempt).

- [ ] **Step 3: Negative check (prove the gate bites).** Temporarily delete one entry from `public/sprites/digimon/manifest.json` (e.g. the `"Agumon"` line), run `npm run validate` → expect the exact failure message naming Agumon and the fix command; then `git checkout public/sprites/digimon/manifest.json` and re-run to green. Paste both outputs in your report.

- [ ] **Step 4: Commit.**

```bash
git add scripts/validate-content.ts
git commit -m "feat: validate gates sprite coverage for catchable entities"
```

---

### Task 3: Manifest loader lib (TDD)

**Files:**
- Create: `src/lib/sprites.ts`, `src/lib/sprites.test.ts`

- [ ] **Step 1: Write the failing tests.** `src/lib/sprites.test.ts`:

```ts
import { afterEach, expect, test, vi } from 'vitest'
import { clearManifestCache, loadManifest, spriteUrl } from './sprites'

afterEach(() => {
  clearManifestCache()
  vi.unstubAllGlobals()
})

const okFetch = (body: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })

test('resolves a sprite url from the manifest', async () => {
  vi.stubGlobal('fetch', okFetch({ entities: { pikachu: '25.png', 'B. Skull Dragon': '11901678.webp' } }))
  const m = await loadManifest('pokemon')
  expect(spriteUrl('pokemon', m, 'pikachu')).toBe('/sprites/pokemon/25.png')
  expect(spriteUrl('pokemon', m, 'B. Skull Dragon')).toBe('/sprites/pokemon/11901678.webp')
  expect(spriteUrl('pokemon', m, 'missingno')).toBeNull()
})

test('missing manifest resolves null and spriteUrl degrades', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  const m = await loadManifest('seattle311')
  expect(m).toBeNull()
  expect(spriteUrl('seattle311', m, 'anything')).toBeNull()
})

test('fetch failure resolves null', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  expect(await loadManifest('yugioh')).toBeNull()
})

test('manifest is fetched once per world', async () => {
  const f = okFetch({ entities: {} })
  vi.stubGlobal('fetch', f)
  await loadManifest('pokemon')
  await loadManifest('pokemon')
  await loadManifest('yugioh')
  expect(f).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Run — must fail.** `npm test -- sprites` → fails (module doesn't exist).

- [ ] **Step 3: Implement.** `src/lib/sprites.ts`:

```ts
export interface SpriteManifest {
  entities: Record<string, string>
}

const manifests = new Map<string, Promise<SpriteManifest | null>>()

export function loadManifest(world: string): Promise<SpriteManifest | null> {
  let p = manifests.get(world)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}sprites/${world}/manifest.json`)
      .then(r => (r.ok ? (r.json() as Promise<SpriteManifest>) : null))
      .catch(() => null)
    manifests.set(world, p)
  }
  return p
}

export function spriteUrl(world: string, manifest: SpriteManifest | null, name: string): string | null {
  const file = manifest?.entities[name]
  return file ? `${import.meta.env.BASE_URL}sprites/${world}/${file}` : null
}

export function clearManifestCache(): void {
  manifests.clear()
}
```

(`import.meta.env.BASE_URL` is `'/'` under vitest/vite dev — same pattern as `src/lib/duckdb.ts:39`.)

- [ ] **Step 4: Run — pass.** `npm test` → full suite green (77 = 73 + 4).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/sprites.ts src/lib/sprites.test.ts
git commit -m "feat: sprite manifest loader"
```

---

### Task 4: Collection tiles + Caught chip UI

**Files:**
- Modify: `src/components/CollectionScreen.tsx`, `src/components/ExerciseScreen.tsx`, `src/styles.css`

- [ ] **Step 1: Palette becomes a CSS variable (mechanical).** In `src/styles.css`, transform every `.type-<x> { border-left-color: <C>; }` rule (pokemon, yugioh, digimon, unknown — the whole block) to `.type-<x> { --type-color: <C>; border-left-color: var(--type-color); }`. One sed does it:

```bash
sed -i '' -E 's/^(\.type-[a-z0-9-]+) \{ border-left-color: ([^;]+); \}$/\1 { --type-color: \2; border-left-color: var(--type-color); }/' src/styles.css
```

Verify with `grep -c "type-color" src/styles.css` (≈ 2× the number of type rules) and eyeball the block.

- [ ] **Step 2: Tile + chip CSS.** Change `.collection-grid`'s `minmax(140px, 1fr)` to `minmax(96px, 1fr)`, and append after the `.tile-type` rule:

```css
.tile-sprite {
  align-items: center;
  text-align: center;
  padding: 8px 4px;
  border-left-width: 1px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--type-color, var(--border)) 22%, var(--panel)), var(--panel));
}
.tile-sprite img { width: 56px; height: 56px; object-fit: contain; }
.tile-sprite .tile-name { font-size: 11px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pixelated { image-rendering: pixelated; }
.catch-chip img { width: 24px; height: 24px; object-fit: contain; vertical-align: -7px; margin-right: 3px; }
```

- [ ] **Step 3: CollectionScreen.** In `src/components/CollectionScreen.tsx`: import `useEffect, useState` from react and `loadManifest, spriteUrl, type SpriteManifest` from `../lib/sprites`. Inside the component:

```tsx
const [manifests, setManifests] = useState<Record<string, SpriteManifest | null>>({})
useEffect(() => {
  let live = true
  for (const w of worlds)
    void loadManifest(w).then(m => {
      if (live) setManifests(prev => ({ ...prev, [w]: m }))
    })
  return () => {
    live = false
  }
}, [worlds.join(',')])
```

and replace the tile `.map(entry => (...))` body with:

```tsx
.map(entry => {
  const url = spriteUrl(world, manifests[world] ?? null, entry.name)
  return url ? (
    <div key={`${entry.world}:${entry.name}`} className={`tile tile-sprite type-${slugify(entry.label)}`}>
      <img src={url} alt="" loading="lazy" className={url.endsWith('.png') ? 'pixelated' : undefined} />
      <span className="tile-name">{entry.name}</span>
    </div>
  ) : (
    <div key={`${entry.world}:${entry.name}`} className={`tile type-${slugify(entry.label)}`}>
      <span className="tile-name">{entry.name}</span>
      <span className="tile-type">{entry.label}</span>
    </div>
  )
})
```

(TS nit: `className={... : undefined}` — if the codebase style prefers `''`, match it.)

- [ ] **Step 4: Caught chip.** In `src/components/ExerciseScreen.tsx`: import `useEffect` (already imported hooks — extend the list) and `loadManifest, spriteUrl, type SpriteManifest` from `../lib/sprites`. Add state + effect near the other state (`~line 38`):

```tsx
const [spriteManifest, setSpriteManifest] = useState<SpriteManifest | null>(null)
useEffect(() => {
  let live = true
  void loadManifest(skill.world).then(m => {
    if (live) setSpriteManifest(m)
  })
  return () => {
    live = false
  }
}, [skill.world])
```

Replace the chip at `~line 236` (`<span className="catch-chip">Caught: {feedback.caught.join(', ')}!</span>`) with:

```tsx
<span className="catch-chip">
  Caught:{' '}
  {feedback.caught.map((n, i) => {
    const url = spriteUrl(skill.world, spriteManifest, n)
    return (
      <span key={n}>
        {i > 0 && ', '}
        {url && <img src={url} alt="" className={url.endsWith('.png') ? 'pixelated' : undefined} />}
        {n}
      </span>
    )
  })}
  !
</span>
```

Leave the node-completion line (`Caught this node: ...join(', ')`, ~line 184) as text — out of scope.

- [ ] **Step 5: Verify.** `npm test && npm run build` green (77 tests; tsc clean). Then report DONE — the controller performs the in-browser verification (seeded save → solve → chip art; collection page renders sprite tiles with tinted backgrounds and no wasm fetch).

- [ ] **Step 6: Commit.**

```bash
git add src/components/CollectionScreen.tsx src/components/ExerciseScreen.tsx src/styles.css
git commit -m "feat: sprite tiles and caught-chip art"
```

---

### Task 5: e2e + docs + full gate

**Files:**
- Modify: `e2e/smoke.spec.ts`, `README.md`, `docs/superpowers/specs/2026-07-18-sql-learning-app-design.md`

- [ ] **Step 1: e2e — collection tiles.** In the `seeded two-world collection groups by world section` test, the seeded entries must be manifest-covered: keep `{world:'pokemon', name:'pikachu', label:'electric'}`; for yugioh use a name present in `public/sprites/yugioh/manifest.json` (check first — e.g. `Red-Eyes Black Dragon`; if the current seed name `Dark Magician` is in the manifest, keep it). Add assertions after the existing section checks:

```ts
await expect(page.locator('.tile-sprite img').first()).toBeVisible()
await expect(page.locator('.tile-sprite img[src*="/sprites/pokemon/"]')).toHaveCount(1)
```

- [ ] **Step 2: e2e — catch chip art.** In the `…ij-1 catches` test, after the existing `✓ Correct!` expectation, add:

```ts
await expect(page.locator('.catch-chip img').first()).toBeVisible()
```

(ij-1's catches are yugioh cards from its reference output, all of which are in the catchable set by construction.)

- [ ] **Step 3: README.** In the intro paragraph, update the collection sentence to mention art (e.g. "…catch the entities they return into a collection you build across every world — with real sprites and card art on the tiles"). In the Content section add a line: `public/sprites/<world>/` — bundled tile art + name→file manifest; `npm run build:sprites` rebuilds (append-only; validate enforces coverage). Add one sentence noting the art is fan-database sourced (PokéAPI sprites, YGOPRODeck card images, DAPI) for personal, non-commercial use.

- [ ] **Step 4: Master spec amendment.** In `docs/superpowers/specs/2026-07-18-sql-learning-app-design.md`, the Collection-page line (~line 56) says "No sprites (remote images would break offline; bundled sprites are a possible Stage 3 flourish)." Amend with the doc's parenthetical convention: bundled sprites shipped 2026-07-19 (collection-sprites project) — offline preserved by committing the assets.

- [ ] **Step 5: Full gate.** `npm test && npm run validate && npm run build && npm run e2e` → 77 unit / `✓ 142 exercises validated across 4 world(s)` (no sprite warnings) / build clean / e2e 7/7.

- [ ] **Step 6: Commit.**

```bash
git add e2e/smoke.spec.ts README.md docs/superpowers/specs/2026-07-18-sql-learning-app-design.md
git commit -m "feat: e2e sprite assertions; docs for bundled collection art"
```

---

## Plan self-review notes

- **Spec coverage:** catchable-set builder + three packs + manifests ✓ (Task 1); incremental/skip-if-exists + misses recorded not fabricated + manifest written last ✓ (Task 1); validate hard gate with fix-command message + warn-only when no pack ✓ (Task 2, incl. negative check); cached loader + 404→null ✓ (Task 3, TDD); gallery tile with label-tinted background via the palette-to-variable transform, text-tile fallback, engine-free collection page ✓ (Task 4); chip art ~24px ✓ (Task 4); e2e img assertions + full gate ✓ (Task 5); licensing note ✓ (Task 5).
- **Judgment calls baked in:** pokemon bundles ALL species (complete dex, ~1.5MB) while yugioh/digimon bundle the catchable set — matches spec; `pixelated` rendering applied only to `.png` (pokemon pixel art), smooth scaling for card/digimon art; digimon image URLs come from the cached DAPI detail files when present (with live-API fallback) and are `encodeURI`'d (names like `Agumon_(Black)`); sorted manifests for stable diffs; `sleep(120–200ms)` throttles stay far under source limits; determinism check (Step 5, Task 1) protects the committed-binary hygiene the repo already maintains.
- **Known risks:** a few newest-gen Pokémon ids may 404 in the sprites repo (recorded as misses; their tiles fall back to text — acceptable per spec since the pokemon pack is not under the catchable gate unless the name is actually catchable); YGOPRODeck throttling (200ms spacing ≈ 5/s, well under their 20/s); `color-mix()` requires a modern browser — fine for this desktop-only personal app.
