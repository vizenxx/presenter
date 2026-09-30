import { spawn, type ChildProcess } from 'node:child_process'

/** Window capture sources are named "window:<handle>:0" on Windows. */
export function windowHandle(sourceId: string): number | null {
  const m = /^window:(\d+):/.exec(sourceId)
  return m ? Number(m[1]) : null
}

/**
 * Restores a minimized window and brings it to the front. The call attaches to the input
 * of the window in front (the Presenter console the teacher just clicked), which is what
 * Windows requires before another program's window may come forward.
 */
export const RAISE_SCRIPT = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PresenterRaise {
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
  public static void Raise(long value) {
    IntPtr h = new IntPtr(value);
    if (IsIconic(h)) ShowWindow(h, 9);
    uint front = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    uint me = GetCurrentThreadId();
    if (front != me) AttachThreadInput(me, front, true);
    BringWindowToTop(h);
    SetForegroundWindow(h);
    if (front != me) AttachThreadInput(me, front, false);
  }
}
'@

`

/**
 * Brings another program's window to the front (Windows only; on a Mac the teacher clicks it).
 * One hidden PowerShell, started on first use, serves every request without a new start delay.
 */
export class WindowRaiser {
  private shell: ChildProcess | null = null

  raise(sourceId: string): void {
    if (process.platform !== 'win32') return
    const handle = windowHandle(sourceId)
    if (handle === null) return
    if (!this.shell || this.shell.exitCode !== null || !this.shell.stdin?.writable) {
      this.shell = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] })
      this.shell.on('error', () => (this.shell = null))
      this.shell.stdin?.write(RAISE_SCRIPT)
    }
    this.shell.stdin?.write(`[PresenterRaise]::Raise(${handle})\n`)
  }

  dispose(): void {
    this.shell?.kill()
    this.shell = null
  }
}
