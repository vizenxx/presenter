// Throwaway spike 2: can we inject trusted keys into an UNFOCUSED view (CDP Input.dispatchKeyEvent)?
const { app, BaseWindow, WebContentsView, protocol, session, net, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const DECK_DIR = 'C:/Users/vizen/Desktop/GCIT Tasks/Teach/Curriculum/2026-Autumn/UXD202/Final Slides';
const DECK_FILE = 'Week-08-Unit 3 Interaction Design and Prototyping.html';
protocol.registerSchemesAsPrivileged([{ scheme: 'deck', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const states = {};
ipcMain.on('deck-state', (_e, msg) => { states[msg.tabId] = msg; });
const out = [];
const log = (k, v) => { out.push([k, v]); console.log('[spike2]', k, JSON.stringify(v)); };

function view(name) {
  const ses = session.fromPartition(name);
  ses.protocol.handle('deck', (req) => net.fetch(pathToFileURL(path.join(DECK_DIR, decodeURIComponent(new URL(req.url).pathname))).toString()));
  return new WebContentsView({ webPreferences: { session: ses, preload: path.join(__dirname, 'spike-preload.cjs'), sandbox: false, backgroundThrottling: false } });
}

app.whenReady().then(async () => {
  const win = new BaseWindow({ width: 1300, height: 400, x: 20, y: 20 });
  const a = view('s2-a'); const b = view('s2-b');
  win.contentView.addChildView(a); win.contentView.addChildView(b);
  a.setBounds({ x: 0, y: 0, width: 640, height: 360 }); b.setBounds({ x: 650, y: 0, width: 640, height: 360 });
  await a.webContents.loadURL('deck://w8/' + encodeURIComponent(DECK_FILE) + '?tabId=a');
  await b.webContents.loadURL('deck://w8/' + encodeURIComponent(DECK_FILE) + '?tabId=b');
  await wait(2500);
  const seenB = [];
  b.webContents.on('before-input-event', (_e, i) => seenB.push(i.type + ':' + i.key));
  a.webContents.focus(); // b is NOT focused
  await wait(200);
  log('start', { a: states.a?.currentSlide, b: states.b?.currentSlide, focusedA: a.webContents.isFocused(), focusedB: b.webContents.isFocused() });

  // Method 1: sendInputEvent on unfocused b
  b.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
  b.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' });
  await wait(700);
  log('sendInputEvent_unfocused', { b: states.b?.currentSlide, seenB: [...seenB] });
  seenB.length = 0;

  // Method 2: CDP Input.dispatchKeyEvent on unfocused b
  const dbg = b.webContents.debugger;
  dbg.attach('1.3');
  const key = { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 };
  await dbg.sendCommand('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key });
  await dbg.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
  await wait(700);
  log('cdp_unfocused', { b: states.b?.currentSlide, seenB: [...seenB], stillFocusedA: a.webContents.isFocused() });
  log('a_unchanged', states.a?.currentSlide);
  fs.writeFileSync(path.join(__dirname, 'out', 'results2.json'), JSON.stringify(out, null, 2));
  app.quit();
});
