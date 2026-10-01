// Presenter's window helper for macOS: the Mac counterpart of the PowerShell helper used on Windows
// (src/main/windowsHelper.ts). Presenter starts it once and asks it questions on stdin, one per
// line; every answer is one line of JSON on stdout.
//
//   list            -> [{"h":id,"t":title,"m":notOnScreen,"p":appPath,"d":appName}, ...]
//   states 12,34    -> {"fg":frontWindowId,"w":[{"h":id,"x":..,"y":..,"w":..,"hh":..,"m":notOnScreen}, ...]}
//   raise 12        -> (no answer) brings that window's program to the front
//
// What macOS allows, and so what this does:
// - The window list (CGWindowList) needs no permission. Without Screen Recording permission it has
//   no window titles; the program name is used instead.
// - Bringing a program forward (NSWorkspace, like clicking its Dock icon) needs no permission and
//   un-minimizes its window in most programs.
// - Raising one exact window and un-minimizing it uses Accessibility; only when Presenter is
//   allowed there (System Settings > Privacy & Security > Accessibility).
// Window ids are CGWindowIDs, the same numbers Chromium uses in "window:<id>:0".

import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
/** Presenter itself (this helper's parent): its windows are never listed. */
let presenterPid = getppid()

func quote(_ s: String) -> String {
  var out = "\""
  for ch in s.unicodeScalars {
    switch ch {
    case "\"": out += "\\\""
    case "\\": out += "\\\\"
    default:
      if ch.value < 0x20 { out += " " } else { out.unicodeScalars.append(ch) }
    }
  }
  return out + "\""
}

func windows(_ option: CGWindowListOption, _ relativeTo: CGWindowID = kCGNullWindowID) -> [[String: Any]] {
  return (CGWindowListCopyWindowInfo(option, relativeTo) as? [[String: Any]]) ?? []
}

func int(_ w: [String: Any], _ key: CFString) -> Int? {
  return (w[key as String] as? NSNumber)?.intValue
}

func bounds(_ w: [String: Any]) -> CGRect {
  guard let b = w[kCGWindowBounds as String] as? [String: Any] else { return .zero }
  let n = { (k: String) -> CGFloat in CGFloat((b[k] as? NSNumber)?.doubleValue ?? 0) }
  return CGRect(x: n("X"), y: n("Y"), width: n("Width"), height: n("Height"))
}

/** An ordinary program window (layer 0, visible size, not Presenter's own). */
func isProgramWindow(_ w: [String: Any]) -> Bool {
  guard int(w, kCGWindowLayer) == 0, let pid = int(w, kCGWindowOwnerPID) else { return false }
  if pid_t(pid) == presenterPid || pid_t(pid) == getpid() { return false }
  if let alpha = (w[kCGWindowAlpha as String] as? NSNumber)?.doubleValue, alpha <= 0 { return false }
  let b = bounds(w)
  return b.width >= 60 && b.height >= 40
}

/** On-screen windows front to back, then the others (minimized, or on another Space). */
func list() -> String {
  let shown = windows([.optionOnScreenOnly, .excludeDesktopElements]).filter(isProgramWindow)
  let shownIds = Set(shown.compactMap { int($0, kCGWindowNumber) })
  let hidden = windows([.optionAll, .excludeDesktopElements]).filter(isProgramWindow).filter { !shownIds.contains(int($0, kCGWindowNumber) ?? -1) }
  var items: [String] = []
  for (w, onScreen) in shown.map({ ($0, true) }) + hidden.map({ ($0, false) }) {
    guard let id = int(w, kCGWindowNumber), let pid = int(w, kCGWindowOwnerPID) else { continue }
    let app = NSRunningApplication(processIdentifier: pid_t(pid))
    // Only programs with a Dock icon; background helpers have windows too.
    if app?.activationPolicy != .regular { continue }
    let owner = (w[kCGWindowOwnerName as String] as? String) ?? app?.localizedName ?? ""
    let title = (w[kCGWindowName as String] as? String) ?? ""
    // Hidden windows without a title are mostly a program's spare windows.
    if !onScreen && title.isEmpty { continue }
    let path = app?.bundleURL?.path ?? ""
    items.append("{\"h\":\(id),\"t\":\(quote(title.isEmpty ? owner : title)),\"m\":\(onScreen ? "false" : "true"),\"p\":\(quote(path)),\"d\":\(quote(owner))}")
  }
  return "[" + items.joined(separator: ",") + "]"
}

/** The front program window (the first ordinary window on screen, Presenter's included) and where the asked windows are. */
func states(_ ids: [Int]) -> String {
  let front = windows([.optionOnScreenOnly, .excludeDesktopElements]).first { w in
    int(w, kCGWindowLayer) == 0 && ((w[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1) > 0
  }
  let fg = front.flatMap { int($0, kCGWindowNumber) } ?? 0
  var items: [String] = []
  for id in ids {
    guard let w = windows([.optionIncludingWindow], CGWindowID(id)).first else { continue }
    let b = bounds(w)
    let onScreen = (w[kCGWindowIsOnscreen as String] as? NSNumber)?.boolValue ?? false
    items.append("{\"h\":\(id),\"x\":\(Int(b.origin.x)),\"y\":\(Int(b.origin.y)),\"w\":\(Int(b.width)),\"hh\":\(Int(b.height)),\"m\":\(onScreen ? "false" : "true")}")
  }
  return "{\"fg\":\(fg),\"w\":[" + items.joined(separator: ",") + "]}"
}

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
  var value: CFTypeRef?
  return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}

/** The Accessibility window that is this CGWindow: same title, else same place and size. */
func axWindow(pid: pid_t, title: String, frame: CGRect) -> AXUIElement? {
  guard let list = attribute(AXUIElementCreateApplication(pid), kAXWindowsAttribute) as? [AXUIElement] else { return nil }
  if !title.isEmpty, let same = list.first(where: { (attribute($0, kAXTitleAttribute) as? String) == title }) { return same }
  return list.first { w in
    var point = CGPoint.zero
    var size = CGSize.zero
    guard let p = attribute(w, kAXPositionAttribute), CFGetTypeID(p) == AXValueGetTypeID(),
          let s = attribute(w, kAXSizeAttribute), CFGetTypeID(s) == AXValueGetTypeID() else { return false }
    AXValueGetValue(p as! AXValue, .cgPoint, &point)
    AXValueGetValue(s as! AXValue, .cgSize, &size)
    return abs(point.x - frame.origin.x) < 3 && abs(point.y - frame.origin.y) < 3 && abs(size.width - frame.width) < 3 && abs(size.height - frame.height) < 3
  }
}

func raise(_ id: Int) {
  guard let w = windows([.optionIncludingWindow], CGWindowID(id)).first, let pid = int(w, kCGWindowOwnerPID) else { return }
  // With Accessibility allowed: exactly this window, un-minimized and on top of its program's windows.
  if AXIsProcessTrusted(), let ax = axWindow(pid: pid_t(pid), title: (w[kCGWindowName as String] as? String) ?? "", frame: bounds(w)) {
    AXUIElementSetAttributeValue(ax, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
    AXUIElementPerformAction(ax, kAXRaiseAction as CFString)
  }
  // Always: bring the program forward, like a click on its Dock icon (this also un-minimizes
  // a window in most programs, with no permission needed).
  guard let app = NSRunningApplication(processIdentifier: pid_t(pid)), let url = app.bundleURL else { return }
  let config = NSWorkspace.OpenConfiguration()
  config.activates = true
  NSWorkspace.shared.openApplication(at: url, configuration: config) { _, _ in }
}

while let line = readLine() {
  let parts = line.split(separator: " ", maxSplits: 1).map(String.init)
  switch parts.first {
  case "list":
    print(list())
  case "states":
    let ids = (parts.count > 1 ? parts[1] : "").split(separator: ",").compactMap { Int($0) }
    print(states(ids))
  case "raise":
    if parts.count > 1, let id = Int(parts[1]) { raise(id) }
  default:
    break
  }
  fflush(stdout)
}
