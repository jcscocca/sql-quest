import { describe, expect, it } from 'vitest'
import { validateAll } from '../../scripts/validate-content'

// The content gate, as a test: every course, skill and exercise must be
// structurally sound and each intended answer must pass the real checker.
describe('Spanish content', () => {
  it('passes the content validator with no issues', () => {
    const issues = validateAll()
    if (issues.length) console.error(issues)
    expect(issues).toEqual([])
  })
})
