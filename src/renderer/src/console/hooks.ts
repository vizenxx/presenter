import { useEffect, useState } from 'react'
import { commandKey, keyIntent } from '../../../shared/keys'
import { zoomKey } from '../../../shared/zoom'
import { INK_KEYS, type InkTool } from '../../../shared/ink'
import type { AppState } from '../../../shared/types'
import { IS_MAC } from './platform'

export function useAppState(): AppState | null {
  const [state, setState] = useState<AppState | null>(null)
  useEffect(() => window.presenter.onState(setState), [])
  // The saved look (light or dark); without one the page follows the computer's setting.
  const theme = state?.theme ?? null
  useEffect(() => {
    if (theme) document.documentElement.dataset['theme'] = theme
    else delete document.documentElement.dataset['theme']
  }, [theme])
  return state
}

/** True when the console looks dark: the saved choice, else the computer's setting. */
export function useDarkLook(theme: AppState['theme']): boolean {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const change = (): void => setSystemDark(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  return theme ? theme === 'dark' : systemDark
}

/** Object URL of the latest projector frame. */
export function useMirror(): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let previous: string | null = null
    window.presenter.onMirror((jpeg) => {
      const next = URL.createObjectURL(new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }))
      setUrl(next)
      if (previous) URL.revokeObjectURL(previous)
      previous = next
    })
  }, [])
  return url
}

const isTextField = (el: EventTarget | null): boolean =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement && el.type !== 'checkbox') ||
  (el instanceof HTMLElement && el.isContentEditable)

/**
 * Console keys: page turns, F5/Esc, text size, marking tools (P H R A L E, Ctrl+Z, Delete).
 * Esc first leaves a marking tool, then stops projecting. Any key stops a ringing alarm.
 */
export function useConsoleKeys(alarming: boolean, inkTool: InkTool): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mods = { control: e.ctrlKey, alt: e.altKey, meta: e.metaKey }
      const zoom = zoomKey(e.key, mods)
      if (zoom) {
        e.preventDefault()
        window.presenter.zoom(null, zoom)
        return
      }
      if (isTextField(e.target)) return
      const command = commandKey(e.key, mods)
      if (command) {
        e.preventDefault()
        if (alarming) window.presenter.timerDismiss()
        else if (command === 'project') window.presenter.startProjecting()
        else if (inkTool !== 'pointer') window.presenter.setInkTool('pointer')
        else window.presenter.stopProjecting()
        return
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        window.presenter.inkOp({ t: 'undo' }, false)
        return
      }
      // The Mac "delete" key sends Backspace.
      if ((e.key === 'Delete' || (IS_MAC && e.key === 'Backspace')) && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        window.presenter.inkOp({ t: 'clear' }, false)
        return
      }
      const tool = !e.ctrlKey && !e.altKey && !e.metaKey ? INK_KEYS[e.key.toLowerCase()] : undefined
      if (tool) {
        e.preventDefault()
        window.presenter.setInkTool(inkTool === tool ? 'pointer' : tool)
        return
      }
      const intent = keyIntent(e.key, mods)
      if (intent) {
        e.preventDefault()
        window.presenter.key(intent)
        return
      }
      if (alarming) window.presenter.timerDismiss()
    }
    // A clicked button keeps focus and would react to Space; drop focus after each click.
    const onPointerUp = (): void => {
      const a = document.activeElement
      if (a instanceof HTMLButtonElement || (a instanceof HTMLInputElement && a.type === 'checkbox')) a.blur()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [alarming, inkTool])
}

export function useFileDrop(): void {
  useEffect(() => {
    const over = (e: DragEvent): void => e.preventDefault()
    const drop = (e: DragEvent): void => {
      e.preventDefault()
      const file = e.dataTransfer?.files?.[0]
      if (file) window.presenter.openPath(window.presenter.pathForFile(file))
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])
}
