// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ResultGrid } from './ResultGrid'

afterEach(cleanup)

test('renders columns and rows', () => {
  render(<ResultGrid result={{ columns: ['name', 'type'], rows: [['pikachu', 'electric'], ['mew', 'psychic']] }} />)
  expect(screen.getByRole('columnheader', { name: 'name' })).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: 'pikachu' })).toBeInTheDocument()
  expect(screen.getByText('2 row(s)')).toBeInTheDocument()
})

test('renders NULL cells with the null-cell class', () => {
  render(<ResultGrid result={{ columns: ['a'], rows: [[null]] }} />)
  const cell = screen.getByRole('cell', { name: 'NULL' })
  expect(cell).toHaveClass('null-cell')
})

test('caps display at 500 rows but reports the true count', () => {
  const rows = Array.from({ length: 501 }, (_, i) => [i])
  render(<ResultGrid result={{ columns: ['n'], rows }} />)
  expect(screen.getAllByRole('row')).toHaveLength(501) // 500 body rows + header
  expect(screen.getByText(/501 row\(s\) — showing first 500/)).toBeInTheDocument()
})
