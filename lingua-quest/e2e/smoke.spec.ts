import { expect, test } from '@playwright/test'

test('home renders the Spanish course and skill tree', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Lingua Quest/ })).toBeVisible()
  await expect(page.getByText(/Spanish/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Saludos/ })).toBeVisible()
})

test('a lesson can be opened and a choice exercise solved', async ({ page }) => {
  await page.goto('/')

  // Open the first skill and start it.
  await page.getByRole('button', { name: /Saludos/ }).click()
  await expect(page.getByText(/Every conversation starts with a greeting/)).toBeVisible()
  await page.getByRole('button', { name: /Start/ }).click()

  // First exercise: "How do you say “hello”?" → Hola.
  await expect(page.getByText(/Exercise 1 of/)).toBeVisible()
  await page.getByRole('button', { name: 'Hola', exact: true }).click()
  await page.getByRole('button', { name: 'Check' }).click()

  // Correct feedback appears and XP is earned.
  await expect(page.getByText(/¡Correcto!/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Continue|Finish/ })).toBeVisible()
})

test('progress persists a streak after a solve', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Saludos/ }).click()
  await page.getByRole('button', { name: /Start/ }).click()
  await page.getByRole('button', { name: 'Hola', exact: true }).click()
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByText(/¡Correcto!/)).toBeVisible()
  await page.getByRole('button', { name: /Continue|Finish/ }).click()

  // Back through the flow, the streak counter on the home header should be ≥ 1.
  await page.getByRole('button', { name: /Back/ }).click()
  await expect(page.getByText(/🔥\s*1/)).toBeVisible()
})
