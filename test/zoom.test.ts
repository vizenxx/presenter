import { describe, expect, it } from 'vitest'
import { stepZoom, ZOOM_STEPS, zoomKey } from '../src/shared/zoom'

describe('stepZoom', () => {
  it('moves along the browser zoom steps', () => {
    expect(stepZoom(100, 'in')).toBe(110)
    expect(stepZoom(110, 'in')).toBe(125)
    expect(stepZoom(100, 'out')).toBe(90)
    expect(stepZoom(90, 'out')).toBe(80)
  })
  it('stops at both ends', () => {
    expect(stepZoom(ZOOM_STEPS[ZOOM_STEPS.length - 1], 'in')).toBe(ZOOM_STEPS[ZOOM_STEPS.length - 1])
    expect(stepZoom(ZOOM_STEPS[0], 'out')).toBe(ZOOM_STEPS[0])
  })
  it('snaps an off-step value to the next step in that direction', () => {
    expect(stepZoom(105, 'in')).toBe(110)
    expect(stepZoom(105, 'out')).toBe(100)
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
