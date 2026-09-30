import { spawn, type ChildProcess } from 'node:child_process'

/** Window capture sources are named "window:<handle>:0" on Windows. */
export function windowHandle(sourceId: string): number | null {
  const m = /^window:(\d+):/.exec(sourceId)
  return m ? Number(m[1]) : null
}

/** A program window as Windows lists it (the Alt+Tab rule), minimized ones included. */
export interface ProgramWindow {
  /** Window handle. */
  h: number
  /** Title. */
  t: string
  /** Minimized. */
  m: boolean
  /** Program file (empty when Windows does not tell, e.g. an administrator program). */
  p: string
  /** Program name from the file, e.g. "Microsoft Edge". */
  d: string
}

/** Where a window is (physical pixels, frame included) and whether it is minimized. */
export interface WindowState {
  h: number
  x: number
  y: number
  w: number
  hh: number
  m: boolean
}

/** The window in front and the asked windows' places. */
export interface WindowStates {
  fg: number
  w: WindowState[]
}

/**
 * List: every visible, titled, not-owned, not-tool, not-cloaked top-level window, in front-to-back
 * order (what Alt+Tab, Zoom and Teams offer). Chromium's own list leaves minimized windows out.
 * Raise: restores and brings a window forward; it attaches to the input of the window in front
 * (the console the teacher just clicked), which Windows requires first.
 */
export const HELPER_SCRIPT = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public static class PresenterWin {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int index);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", EntryPoint = "GetWindowThreadProcessId")] static extern uint GetWindowThread(IntPtr h, IntPtr pid);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int value, int size);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
  static string Esc(string s) {
    var b = new StringBuilder();
    foreach (char c in s) {
      if (c == '"' || c == '\\\\') b.Append('\\\\').Append(c);
      else if (c < ' ') b.Append(' ');
      else b.Append(c);
    }
    return b.ToString();
  }
  public static string List() {
    var items = new List<string>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      if (GetWindow(h, 4) != IntPtr.Zero) return true;
      if ((GetWindowLong(h, -20) & 0x80) != 0) return true;
      int cloaked;
      if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      int n = GetWindowTextLength(h);
      if (n == 0) return true;
      var title = new StringBuilder(n + 1);
      GetWindowText(h, title, n + 1);
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      string file = "", name = "";
      try {
        file = Process.GetProcessById((int)pid).MainModule.FileName;
        name = FileVersionInfo.GetVersionInfo(file).FileDescription ?? "";
      } catch { }
      items.Add("{\\"h\\":" + h.ToInt64() + ",\\"t\\":\\"" + Esc(title.ToString()) + "\\",\\"m\\":" + (IsIconic(h) ? "true" : "false") + ",\\"p\\":\\"" + Esc(file) + "\\",\\"d\\":\\"" + Esc(name) + "\\"}");
      return true;
    }, IntPtr.Zero);
    return "[" + string.Join(",", items) + "]";
  }
  public static void Raise(long value) {
    IntPtr h = new IntPtr(value);
    if (IsIconic(h)) ShowWindow(h, 9);
    uint front = GetWindowThread(GetForegroundWindow(), IntPtr.Zero);
    uint me = GetCurrentThreadId();
    if (front != me) AttachThreadInput(me, front, true);
    BringWindowToTop(h);
    SetForegroundWindow(h);
    if (front != me) AttachThreadInput(me, front, false);
  }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT value, int size);
  public static string States(string handles) {
    var items = new List<string>();
    foreach (var part in handles.Split(',')) {
      long v;
      if (!long.TryParse(part, out v)) continue;
      IntPtr h = new IntPtr(v);
      RECT r;
      if (DwmGetWindowAttribute(h, 9, out r, Marshal.SizeOf(typeof(RECT))) != 0) continue;
      items.Add("{\\"h\\":" + v + ",\\"x\\":" + r.Left + ",\\"y\\":" + r.Top + ",\\"w\\":" + (r.Right - r.Left) + ",\\"hh\\":" + (r.Bottom - r.Top) + ",\\"m\\":" + (IsIconic(h) ? "true" : "false") + "}");
    }
    return "{\\"fg\\":" + GetForegroundWindow().ToInt64() + ",\\"w\\":[" + string.Join(",", items) + "]}";
  }
  public static void Restore(long value) {
    IntPtr h = new IntPtr(value);
    if (IsIconic(h)) ShowWindow(h, 4);
  }
}
'@

`

const LIST_TIMEOUT_MS = 8000

/**
 * Windows only (on a Mac these do nothing and the list comes from Chromium). One hidden
 * PowerShell, started on first use, answers every request without a new start delay.
 */
export class WindowsHelper {
  private shell: ChildProcess | null = null
  private buffer = ''
  /** Answers come back in the order the questions were asked. */
  private readonly waiting: Array<(answer: unknown) => void> = []

  /** Program windows in front-to-back order; [] when Windows cannot be asked. */
  list(): Promise<ProgramWindow[]> {
    if (process.platform !== 'win32') return Promise.resolve([])
    return this.ask('[PresenterWin]::List()', []).then((a) => (Array.isArray(a) ? (a as ProgramWindow[]) : []))
  }

  /** The window in front, and where the given windows are; null when Windows cannot be asked. */
  states(sourceIds: string[]): Promise<WindowStates | null> {
    const handles = sourceIds.map(windowHandle).filter((h): h is number => h !== null)
    if (process.platform !== 'win32' || handles.length === 0) return Promise.resolve(null)
    return this.ask(`[PresenterWin]::States('${handles.join(',')}')`, null).then((a) => (a && typeof a === 'object' && !Array.isArray(a) ? (a as WindowStates) : null))
  }

  private ask(line: string, fallback: unknown): Promise<unknown> {
    return new Promise((resolve) => {
      let done = false
      const finish = (answer: unknown): void => {
        if (done) return
        done = true
        resolve(answer)
      }
      this.waiting.push(finish)
      setTimeout(() => {
        const i = this.waiting.indexOf(finish)
        if (i >= 0) this.waiting.splice(i, 1)
        finish(fallback)
      }, LIST_TIMEOUT_MS)
      this.send(line)
    })
  }

  /** Restore and bring to the front. */
  raise(sourceId: string): void {
    const handle = windowHandle(sourceId)
    if (handle !== null) this.send(`[PresenterWin]::Raise(${handle})`)
  }

  dispose(): void {
    this.shell?.kill()
    this.shell = null
  }

  private send(line: string): void {
    if (process.platform !== 'win32') return
    if (!this.shell || this.shell.exitCode !== null || !this.shell.stdin?.writable) this.startShell()
    this.shell?.stdin?.write(`${line}\n`)
  }

  private startShell(): void {
    this.buffer = ''
    const shell = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
    shell.on('error', () => {
      if (this.shell === shell) this.shell = null
    })
    shell.stdout?.setEncoding('utf8')
    shell.stdout?.on('data', (chunk: string) => {
      this.buffer += chunk
      let nl: number
      while ((nl = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, nl).trim()
        this.buffer = this.buffer.slice(nl + 1)
        if (!line.startsWith('[') && !line.startsWith('{')) continue
        let answer: unknown = null
        try {
          answer = JSON.parse(line)
        } catch {
          // A garbled answer counts as no answer.
        }
        this.waiting.shift()?.(answer)
      }
    })
    shell.stdin?.write(HELPER_SCRIPT)
    this.shell = shell
  }
}
