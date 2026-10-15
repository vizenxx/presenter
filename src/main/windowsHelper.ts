import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'

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
  /** The root owner of the window in front (a pop-up or dialog of a program window gives that window). */
  ro?: number
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
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
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
    IntPtr front = GetForegroundWindow();
    // The window in front may be a dialog or pop-up that belongs to the program window: its root owner is that window.
    IntPtr owner = front == IntPtr.Zero ? IntPtr.Zero : GetAncestor(front, 3);
    return "{\\"fg\\":" + front.ToInt64() + ",\\"ro\\":" + owner.ToInt64() + ",\\"w\\":[" + string.Join(",", items) + "]}";
  }
  // Windows this helper maximized itself: only those are put back.
  static readonly HashSet<long> filled = new HashSet<long>();
  public static void Fill(long value) {
    IntPtr h = new IntPtr(value);
    if (IsIconic(h)) ShowWindow(h, 9);
    if (!IsZoomed(h)) {
      ShowWindow(h, 3);
      filled.Add(value);
    }
  }
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  // The pad and the toolbar directly above the followed window, the toolbar above the pad, and nothing
  // else changes: a window that covers the followed window covers them too, and when the followed window
  // comes to the front they come with it. Nothing is activated. A followed window that is itself
  // always on top gets them in the always-on-top band.
  public static void StackAbove(long target, long pad, long bar) {
    const uint flags = 0x0001 | 0x0002 | 0x0010; // no size, no move, no activate
    IntPtr t = new IntPtr(target), p = new IntPtr(pad), b = new IntPtr(bar);
    bool topmost = (GetWindowLong(t, -20) & 0x8) != 0;
    IntPtr floor = topmost ? new IntPtr(-1) : IntPtr.Zero; // HWND_TOPMOST or HWND_TOP
    IntPtr above = GetWindow(t, 3); // the window directly above the target (GW_HWNDPREV)
    while (above != IntPtr.Zero && (above == p || above == b)) above = GetWindow(above, 3);
    SetWindowPos(p, above != IntPtr.Zero ? above : floor, 0, 0, 0, 0, flags);
    IntPtr overPad = GetWindow(p, 3);
    if (overPad != b) SetWindowPos(b, overPad != IntPtr.Zero ? overPad : floor, 0, 0, 0, 0, flags);
  }
  // Brings the program window to the front and puts the pad and the toolbar right above it again, in one
  // call, so there is no moment (no frame) in which the window covers them: no flash.
  public static void RaiseAbove(long target, long pad, long bar) {
    const uint flags = 0x0001 | 0x0002 | 0x0010; // no size, no move, no activate
    IntPtr p = new IntPtr(pad), b = new IntPtr(bar);
    // Raise() waits for the program to take its activation (tens of milliseconds): in that time the window
    // is already above the pad and the toolbar, which is what flashed. So the two are made always-on-top
    // for the length of the raise (nothing can cover them), then they go back to lie right above the window.
    SetWindowPos(p, new IntPtr(-1), 0, 0, 0, 0, flags);
    SetWindowPos(b, new IntPtr(-1), 0, 0, 0, 0, flags);
    Raise(target);
    SetWindowPos(p, new IntPtr(-2), 0, 0, 0, 0, flags); // HWND_NOTOPMOST: the top of the normal windows
    SetWindowPos(b, new IntPtr(-2), 0, 0, 0, 0, flags);
    StackAbove(target, pad, bar);
  }
  [StructLayout(LayoutKind.Sequential)] struct PT { public int X, Y; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(PT p);
  [DllImport("user32.dll")] static extern IntPtr GetTopWindow(IntPtr h);
  [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int index, int value);
  // What the system really does with the ink pad: its extended style, whether it is above the program window,
  // and who would get a click at its middle. With heal, a click-through style left on the pad is cleared.
  public static string PadState(long pad, long target, bool heal) {
    IntPtr p = new IntPtr(pad), t = new IntPtr(target);
    int ex = GetWindowLong(p, -20);
    bool healed = false;
    if (heal && (ex & 0x20) != 0) {
      SetWindowLong(p, -20, ex & ~0x20);
      SetWindowPos(p, IntPtr.Zero, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0004 | 0x0010 | 0x0020); // frame changed, nothing else
      ex = GetWindowLong(p, -20);
      healed = true;
    }
    RECT r;
    GetWindowRect(p, out r);
    PT mid; mid.X = (r.Left + r.Right) / 2; mid.Y = (r.Top + r.Bottom) / 2;
    IntPtr hit = WindowFromPoint(mid);
    int zp = -1, zt = -1, i = 0;
    for (IntPtr h = GetTopWindow(IntPtr.Zero); h != IntPtr.Zero; h = GetWindow(h, 2)) {
      if (h == p) zp = i;
      if (h == t) zt = i;
      i++;
    }
    return "{\\"pad\\":" + pad + ",\\"ex\\":" + ex + ",\\"clickThrough\\":" + ((ex & 0x20) != 0 ? "true" : "false") + ",\\"healed\\":" + (healed ? "true" : "false") + ",\\"visible\\":" + (IsWindowVisible(p) ? "true" : "false") + ",\\"hit\\":" + hit.ToInt64() + ",\\"zPad\\":" + zp + ",\\"zTarget\\":" + zt + ",\\"rect\\":[" + r.Left + "," + r.Top + "," + r.Right + "," + r.Bottom + "]}";
  }
  [DllImport("user32.dll")] static extern bool GetCursorPos(out PT p);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  // Where the mouse is, which top-level window is under it, and whether the left button is down.
  public static string Cursor() {
    PT p;
    GetCursorPos(out p);
    IntPtr hit = WindowFromPoint(p);
    IntPtr root = hit == IntPtr.Zero ? IntPtr.Zero : GetAncestor(hit, 2);
    string title = "";
    if (root != IntPtr.Zero) {
      int n = GetWindowTextLength(root);
      if (n > 0) { var sb = new StringBuilder(n + 1); GetWindowText(root, sb, n + 1); title = sb.ToString(); }
    }
    bool down = (GetAsyncKeyState(0x01) & 0x8000) != 0;
    return "{\\"x\\":" + p.X + ",\\"y\\":" + p.Y + ",\\"down\\":" + (down ? "true" : "false") + ",\\"root\\":" + root.ToInt64() + ",\\"title\\":\\"" + Esc(title) + "\\"}";
  }
  public static void Release(long value) {
    IntPtr h = new IntPtr(value);
    if (filled.Remove(value) && IsZoomed(h)) ShowWindow(h, 9);
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
 * Asks the system about program windows. Windows: one hidden PowerShell with HELPER_SCRIPT.
 * macOS: the small Swift helper (native/mac-helper/main.swift) packed with the app; without it
 * these answer nothing and the list comes from Chromium. Either one starts on first use and
 * then answers every request without a new start delay.
 */
export class WindowsHelper {
  /** macHelper = the path of the macOS helper program (it may be missing in a source copy). */
  constructor(private readonly macHelper: string | null = null) {}

  private shell: ChildProcess | null = null
  private buffer = ''
  /** Answers come back in the order the questions were asked. */
  private readonly waiting: Array<(answer: unknown) => void> = []

  /** Program windows in front-to-back order; [] when Windows cannot be asked. */
  list(): Promise<ProgramWindow[]> {
    if (!this.available()) return Promise.resolve([])
    return this.ask(this.isMac() ? 'list' : '[PresenterWin]::List()', []).then((a) => (Array.isArray(a) ? (a as ProgramWindow[]) : []))
  }

  /** The window in front, and where the given windows are; null when Windows cannot be asked. */
  states(sourceIds: string[]): Promise<WindowStates | null> {
    const handles = sourceIds.map(windowHandle).filter((h): h is number => h !== null)
    if (!this.available() || handles.length === 0) return Promise.resolve(null)
    return this.ask(this.isMac() ? `states ${handles.join(',')}` : `[PresenterWin]::States('${handles.join(',')}')`, null).then((a) => (a && typeof a === 'object' && !Array.isArray(a) ? (a as WindowStates) : null))
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

  /** Restore and bring to the front (macOS: its program, and the exact window with Accessibility allowed). */
  raise(sourceId: string): void {
    const handle = windowHandle(sourceId)
    if (handle !== null && this.available()) this.send(this.isMac() ? `raise ${handle}` : `[PresenterWin]::Raise(${handle})`)
  }

  /**
   * Windows: the window fills its screen (maximized), so that the picture the projector gets has
   * as many pixels as the screen has: a small window would be enlarged and look soft. Only a
   * window that was not maximized is changed, and release puts it back as it was.
   */
  fill(sourceId: string): void {
    const handle = windowHandle(sourceId)
    if (handle !== null && process.platform === 'win32') this.send(`[PresenterWin]::Fill(${handle})`)
  }

  release(sourceId: string): void {
    const handle = windowHandle(sourceId)
    if (handle !== null && process.platform === 'win32') this.send(`[PresenterWin]::Release(${handle})`)
  }

  /**
   * Windows: the ink pad and the floating toolbar lie directly above the followed program window (the
   * toolbar right above the pad), not above everything: another window in front of the program window
   * covers the toolbar too. When the toolbar is seen, the pad is in front of the window as well, so
   * drawing reaches it. (macOS keeps them apart by window levels.)
   */
  stackTools(targetHandle: number, padHandle: number, barHandle: number): void {
    if (process.platform === 'win32') this.send(`[PresenterWin]::StackAbove(${targetHandle}, ${padHandle}, ${barHandle})`)
  }

  /** Windows: the window comes to the front and the pad and toolbar stay right above it, with no moment in between (no flash). */
  raiseAbove(sourceId: string, padHandle: number, barHandle: number): void {
    const handle = windowHandle(sourceId)
    if (handle === null || process.platform !== 'win32') return
    this.send(`[PresenterWin]::RaiseAbove(${handle}, ${padHandle}, ${barHandle})`)
  }

  /** Windows: the ink pad as the system sees it (see PadState in the helper script); with heal, a stuck click-through style is cleared. */
  padState(padHandle: number, targetHandle: number, heal: boolean): Promise<Record<string, unknown> | null> {
    if (process.platform !== 'win32') return Promise.resolve(null)
    return this.ask(`[PresenterWin]::PadState(${padHandle}, ${targetHandle}, $${heal ? 'true' : 'false'})`, null).then((a) => (a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, unknown>) : null))
  }

  /** Windows: where the mouse is and which window is under it (for tools-log.txt). */
  cursorState(): Promise<{ x: number; y: number; down: boolean; root: number; title: string } | null> {
    if (process.platform !== 'win32') return Promise.resolve(null)
    return this.ask('[PresenterWin]::Cursor()', null).then((a) => (a && typeof a === 'object' && !Array.isArray(a) ? (a as { x: number; y: number; down: boolean; root: number; title: string }) : null))
  }

  private isMac(): boolean {
    return process.platform === 'darwin'
  }

  /** Windows always; macOS when the helper program is there. */
  private available(): boolean {
    if (process.platform === 'win32') return true
    return this.isMac() && this.macHelper !== null && fs.existsSync(this.macHelper)
  }

  dispose(): void {
    this.shell?.kill()
    this.shell = null
  }

  private send(line: string): void {
    if (!this.available()) return
    if (!this.shell || this.shell.exitCode !== null || !this.shell.stdin?.writable) this.startShell()
    this.shell?.stdin?.write(`${line}\n`)
  }

  private startShell(): void {
    this.buffer = ''
    const shell =
      this.isMac() && this.macHelper
        ? spawn(this.macHelper, [], { stdio: ['pipe', 'pipe', 'ignore'] })
        : spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
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
    if (!this.isMac()) shell.stdin?.write(HELPER_SCRIPT)
    this.shell = shell
  }
}
