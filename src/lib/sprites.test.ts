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
