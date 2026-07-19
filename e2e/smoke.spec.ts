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
