import { describe, expect, it } from 'vitest'
import { keepInside } from '../src/shared/place'

const area = { x: 0, y: 0, width: 1920, height: 1040 }

describe('keepInside', () => {
  it('leaves a window that fits', () => {
    const box = { x: 100, y: 50, width: 700, height: 56 }
    expect(keepInside(box, area)).toEqual(box)
  })
  it('pulls a window back from every edge', () => {
    expect(keepInside({ x: -300, y: -20, width: 700, height: 56 }, area)).toEqual({ x: 0, y: 0, width: 700, height: 56 })
    expect(keepInside({ x: 1700, y: 1030, width: 700, height: 56 }, area)).toEqual({ x: 1220, y: 984, width: 700, height: 56 })
  })
  it('works on a display that does not start at 0', () => {
    const right = { x: 1920, y: -200, width: 1280, height: 720 }
    expect(keepInside({ x: 1900, y: -210, width: 400, height: 100 }, right)).toEqual({ x: 1920, y: -200, width: 400, height: 100 })
  })
  it('shrinks a window that is bigger than the area', () => {
    expect(keepInside({ x: 10, y: 10, width: 2400, height: 1200 }, area)).toEqual({ x: 0, y: 0, width: 1920, height: 1040 })
  })
})
