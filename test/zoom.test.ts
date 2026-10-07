import { describe, expect, it } from 'vitest'
import { stepZoom, ZOOM_MAX, ZOOM_MIN, zoomKey } from '../src/shared/zoom'

describe('stepZoom', () => {
  it('moves in steps of 5 %', () => {
    expect(stepZoom(100, 'in')).toBe(105)
    expect(stepZoom(105, 'in')).toBe(110)
    expect(stepZoom(100, 'out')).toBe(95)
    expect(stepZoom(95, 'out')).toBe(90)
  })
  it('stops at both ends', () => {
    expect(stepZoom(ZOOM_MAX, 'in')).toBe(ZOOM_MAX)
    expect(stepZoom(ZOOM_MIN, 'out')).toBe(ZOOM_MIN)
  })
  it('snaps an off-step value (e.g. remembered from an older version) to the next step in that direction', () => {
    expect(stepZoom(67, 'in')).toBe(70)
    expect(stepZoom(67, 'out')).toBe(65)
  })
  it('resets to 100', () => {
    expect(stepZoom(175, 'reset')).toBe(100)
  })
})

describe('zoomKey', () => {
  it('maps the browser zoom shortcuts', () => {
    expect(zoomKey('=', { control: true })).toBe('in')
    expect(zoomKey('+', { control: true, shift: true })).toBe('in')
    expect(zoomKey('-', { control: true })).toBe('out')
    expect(zoomKey('0', { control: true })).toBe('reset')
  })
  it('needs the Ctrl key', () => {
    expect(zoomKey('=')).toBeNull()
    expect(zoomKey('0')).toBeNull()
    expect(zoomKey('ArrowRight', { control: true })).toBeNull()
  })
})
