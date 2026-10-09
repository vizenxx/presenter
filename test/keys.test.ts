import { describe, expect, it } from 'vitest'
import { blankKey, commandKey, intentToAction, keyIntent } from '../src/shared/keys'

describe('keyIntent', () => {
  it('maps clicker and arrow keys', () => {
    for (const k of ['ArrowRight', 'ArrowDown', 'PageDown', ' ']) expect(keyIntent(k)).toBe('next')
    for (const k of ['ArrowLeft', 'ArrowUp', 'PageUp']) expect(keyIntent(k)).toBe('prev')
    expect(keyIntent('Home')).toBe('first')
    expect(keyIntent('End')).toBe('last')
  })
  it('ignores other keys and shortcuts with modifiers', () => {
    expect(keyIntent('a')).toBeNull()
    expect(keyIntent('ArrowRight', { control: true })).toBeNull()
    expect(keyIntent('PageDown', { alt: true })).toBeNull()
  })
  it('turns intents into navigation actions', () => {
    expect(intentToAction('next')).toEqual({ type: 'step', delta: 1 })
    expect(intentToAction('prev')).toEqual({ type: 'step', delta: -1 })
    expect(intentToAction('first')).toEqual({ type: 'first' })
    expect(intentToAction('last')).toEqual({ type: 'last' })
  })
})

describe('commandKey', () => {
  it('uses the PowerPoint keys to start and stop projecting', () => {
    expect(commandKey('F5')).toBe('project')
    expect(commandKey('F5', { shift: true })).toBe('project')
    expect(commandKey('Escape')).toBe('stop-project')
  })
  it('ignores page keys and modified shortcuts', () => {
    expect(commandKey('ArrowRight')).toBeNull()
    expect(commandKey('F5', { control: true })).toBeNull()
    expect(commandKey('Enter')).toBeNull()
    expect(commandKey('Enter', { control: true })).toBeNull()
  })
  it('starts projecting with ⌘ Return (Mac keyboards need fn for F5)', () => {
    expect(commandKey('Enter', { meta: true })).toBe('project')
    expect(commandKey('Enter', { meta: true, alt: true })).toBeNull()
  })
})

describe('blankKey', () => {
  it('maps B and . to black, W and , to white', () => {
    expect(blankKey('b')).toBe('black')
    expect(blankKey('B')).toBe('black')
    expect(blankKey('.')).toBe('black')
    expect(blankKey('w')).toBe('white')
    expect(blankKey(',')).toBe('white')
  })
  it('ignores the keys with Ctrl, Alt or ⌘, and other keys', () => {
    expect(blankKey('b', { control: true })).toBeNull()
    expect(blankKey('w', { meta: true })).toBeNull()
    expect(blankKey('x')).toBeNull()
  })
})
