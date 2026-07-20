import { expect, test } from '@playwright/test'

test('solve the first exercise end to end', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /SQL Quest/ })).toBeVisible()

  await page.getByRole('button', { name: /SELECT Basics/ }).click()
  await page.getByRole('button', { name: 'Start exercises' }).click()
  await expect(page.getByText('List the name of every Pokémon.')).toBeVisible()

  await page.locator('.cm-content').click()
  await page.keyboard.type('SELECT name FROM pokemon')

  await page.getByRole('button', { name: '▶ Run' }).click()
  await expect(page.locator('.result-grid tbody tr').first()).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText(/\+10 XP/)).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: 'Next →' }).click()
  await expect(page.getByText(/primary type/)).toBeVisible()
})

test('read-only guard blocks mutations', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /SELECT Basics/ }).click()
  await page.getByRole('button', { name: 'Start exercises' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.type('DROP TABLE pokemon')
  await page.getByRole('button', { name: '▶ Run' }).click()
  await expect(page.getByText(/read-only/)).toBeVisible({ timeout: 30_000 })
})

test('wrong answer shows feedback and the hint ladder opens', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /SELECT Basics/ }).click()
  await page.getByRole('button', { name: 'Start exercises' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.type('SELECT type1 FROM pokemon')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText(/Not quite/)).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: /Hint 1/ }).click()
  await expect(page.getByText(/Hint 1:/)).toBeVisible()
})

test('catching pokemon and the collection page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /SELECT Basics/ }).click()
  await page.getByRole('button', { name: 'Start exercises' }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.type('SELECT name FROM pokemon')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText(/Caught:/)).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '← Back' }).click()
  await page.getByRole('button', { name: /📚/ }).click()
  await expect(page.locator('.tile').first()).toBeVisible({ timeout: 30_000 })
})

test('daily review updates mastery', async ({ page }) => {
  await page.addInitScript(() => {
    const req = indexedDB.open('keyval-store')
    req.onupgradeneeded = () => req.result.createObjectStore('keyval')
    req.onsuccess = () => {
      const tx = req.result.transaction('keyval', 'readwrite')
      tx.objectStore('keyval').put(
        {
          version: 1,
          xp: 20,
          streak: { count: 1, lastDay: '2026-07-01' },
          skills: {
            'select-basics': {
              solved: ['sb-1', 'sb-2'],
              completed: true,
              mastery: 3,
              interval: 2,
              due: '2026-07-02',
            },
          },
          collection: [],
          badges: ['select-basics'],
        },
        'sql-quest-progress',
      )
    }
  })
  await page.goto('/')
  await expect(page.getByText(/Daily Review/)).toBeVisible()
  await page.getByRole('button', { name: 'Start review' }).click()

  for (let done = 0; done < 2; done++) {
    await expect(page.getByText(new RegExp(`${done + 1}/2`))).toBeVisible({ timeout: 30_000 })
    for (let h = 0; h < 3; h++) await page.getByRole('button', { name: /💡 Hint/ }).click()
    const hintText = await page.locator('.hint').last().textContent()
    const sql = hintText!.match(/```sql([\s\S]*?)```/)![1].trim()
    await page.locator('.cm-content').click()
    await page.keyboard.type(sql)
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText(/✓ Correct!/)).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: done === 0 ? 'Next →' : 'Finish review →' }).click()
  }

  await expect(page.getByText(/Review complete/)).toBeVisible()
  await expect(page.getByText(/mastery 3 → 2/)).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText(/Daily Review/)).not.toBeVisible()
})

test('seeded Foundations+Shaping unlocks Combining, world panel shows Yu-Gi-Oh active, and ij-1 catches', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const req = indexedDB.open('keyval-store')
    req.onupgradeneeded = () => req.result.createObjectStore('keyval')
    req.onsuccess = () => {
      const tx = req.result.transaction('keyval', 'readwrite')
      const done = { solved: [], completed: true, mastery: 3, interval: 2, due: '2099-01-01' }
      tx.objectStore('keyval').put(
        {
          version: 1,
          xp: 200,
          streak: { count: 1, lastDay: '2026-07-01' },
          skills: {
            'select-basics': done,
            'where-filtering': done,
            'order-limit': done,
            distinct: done,
            aggregates: done,
            'group-by': done,
            having: done,
            'case-when': done,
            'string-functions': done,
            'null-handling': done,
          },
          collection: [],
          badges: [],
        },
        'sql-quest-progress',
      )
    }
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /SQL Quest/ })).toBeVisible()

  const combiningRow = page.locator('.world-row', { hasText: 'Combining' })
  await expect(combiningRow).toContainText('Yu-Gi-Oh!')
  await expect(combiningRow).toContainText('▶')

  const node = page.getByRole('button', { name: /INNER JOIN/ })
  await expect(node).toBeEnabled()
  await node.click()

  await expect(page.getByText(/INNER JOIN stitches two tables together/)).toBeVisible()
  await page.getByRole('button', { name: 'Start exercises' }).click()

  for (let h = 0; h < 3; h++) await page.getByRole('button', { name: /💡 Hint/ }).click()
  const hintText = await page.locator('.hint').last().textContent()
  const sql = hintText!.match(/```sql([\s\S]*?)```/)![1].trim()
  await page.locator('.cm-content').click()
  await page.keyboard.type(sql)
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText(/✓ Correct!/)).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.catch-chip img').first()).toBeVisible()
  await expect(page.getByText(/Caught: Red-Eyes Black Dragon!/)).toBeVisible()
})

test('seeded two-world collection groups by world section', async ({ page }) => {
  await page.addInitScript(() => {
    const req = indexedDB.open('keyval-store')
    req.onupgradeneeded = () => req.result.createObjectStore('keyval')
    req.onsuccess = () => {
      const tx = req.result.transaction('keyval', 'readwrite')
      tx.objectStore('keyval').put(
        {
          version: 1,
          xp: 0,
          streak: { count: 0, lastDay: '' },
          skills: {},
          collection: [
            { world: 'pokemon', name: 'pikachu', label: 'electric' },
            { world: 'yugioh', name: 'Dark Magician', label: 'Normal Monster' },
          ],
          badges: [],
        },
        'sql-quest-progress',
      )
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: /📚/ }).click()
  await expect(page.getByRole('heading', { name: 'Pokémon', level: 3 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Yu-Gi-Oh!', level: 3 })).toBeVisible()
  await expect(page.locator('.tile')).toHaveCount(2)
  await expect(page.locator('.tile-sprite img').first()).toBeVisible()
  await expect(page.locator('.tile-sprite img[src*="/sprites/pokemon/"]')).toHaveCount(1)
})

test('free roam opens a skill whose prerequisites are unmet', async ({ page }) => {
  await page.addInitScript(() => {
    const req = indexedDB.open('keyval-store')
    req.onupgradeneeded = () => req.result.createObjectStore('keyval')
    req.onsuccess = () => {
      const tx = req.result.transaction('keyval', 'readwrite')
      tx.objectStore('keyval').put(
        {
          version: 1,
          xp: 0,
          streak: { count: 0, lastDay: '' },
          skills: {},
          collection: [],
          badges: [],
          unlockAll: true,
        },
        'sql-quest-progress',
      )
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Free roam: on/ }).click({ trial: true })
  const roamed = page.getByRole('button', { name: /Recursive CTEs/ })
  await expect(roamed).toHaveClass(/locked/)
  await expect(roamed).toContainText('🔓')
  await roamed.click()
  await expect(page.getByRole('heading', { name: 'Recursive CTEs' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start exercises' })).toBeVisible()
})
