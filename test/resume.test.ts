import { describe, expect, it } from 'vitest'
import { RESUME_MS, resumeIndex } from '../src/shared/resume'

describe('resumeIndex', () => {
  it('opens on the last page within 3 hours (a restart or a crash in class)', () => {
    expect(resumeIndex({ index: 22, at: 1000 }, 1000 + 60_000)).toBe(22)
    expect(resumeIndex({ index: 22, at: 1000 }, 1000 + RESUME_MS - 1)).toBe(22)
  })
  it('opens on the first page later, on page 1 anyway, or with nothing saved', () => {
    expect(resumeIndex({ index: 22, at: 1000 }, 1000 + RESUME_MS)).toBeNull()
    expect(resumeIndex({ index: 0, at: 1000 }, 2000)).toBeNull()
    expect(resumeIndex(undefined, 2000)).toBeNull()
  })
})
