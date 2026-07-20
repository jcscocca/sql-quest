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
