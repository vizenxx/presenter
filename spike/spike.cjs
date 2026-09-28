// Throwaway feasibility spike. Verifies:
//  S1 custom protocol + BroadcastChannel bridge to a UXD202 deck (GOTO / SLIDE_STATE / SYNC_TIMER)
//  S2 before-input-event blocking + sendInputEvent key injection
//  S3 preview scaling (device emulation vs zoom) keeps a desktop-width layout
//  S4 capturePage cost for a projector mirror
const { app, BaseWindow, WebContentsView, protocol, session, net, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const DECK_DIR = 'C:/Users/vizen/Desktop/GCIT Tasks/Teach/Curriculum/2026-Autumn/UXD202/Final Slides';
const DECK_FILE = 'Week-08-Unit 3 Interaction Design and Prototyping.html';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

protocol.registerSchemesAsPrivileged([
  { scheme: 'deck', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const results = {};
const log = (k, v) => { results[k] = v; console.log('[spike]', k, JSON.stringify(v)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function makeSession(name) {
  const ses = session.fromPartition(name);
  ses.protocol.handle('deck', (req) => {
    const u = new URL(req.url);
    const file = path.join(DECK_DIR, decodeURIComponent(u.pathname));
    return net.fetch(pathToFileURL(file).toString());
  });
  return ses;
}

const states = {}; // tabId -> last SLIDE_STATE
ipcMain.on('deck-state', (_e, msg) => { states[msg.tabId] = msg; });

function makeView(ses) {
  return new WebContentsView({
    webPreferences: { session: ses, preload: path.join(__dirname, 'spike-preload.cjs'), contextIsolation: true, sandbox: false },
  });
}

app.whenReady().then(async () => {
  const win = new BaseWindow({ width: 1280 + 500, height: 720, x: 20, y: 20 });
  const ses = makeSession('spike-projector');
  const proj = makeView(ses);
  win.contentView.addChildView(proj);
  proj.setBounds({ x: 0, y: 0, width: 1280, height: 720 });
  const url = 'deck://w8/' + encodeURIComponent(DECK_FILE) + '?tabId=proj';
  await proj.webContents.loadURL(url);
  await wait(3000);
  const s0 = states.proj;
  log('S1_first_state', s0 ? { total: s0.totalSlides, current: s0.currentSlide, meta: s0.metadata?.length, milestones: s0.milestones?.length, minutes: s0.metadata?.filter((m) => m.minutes).length } : null);

  // S1 GOTO
  proj.webContents.send('cmd', { type: 'GOTO', targetTabId: 'proj', slideIndex: 3 });
  await wait(800);
  log('S1_goto3_current', states.proj?.currentSlide);

  // S1 SYNC_TIMER shows in deck navbar
  proj.webContents.send('cmd', { type: 'SYNC_TIMER', targetTabId: 'proj', remaining: 125, isRunning: true, isDone: false });
  await wait(500);
  log('S1_timer_text_visible', await proj.webContents.executeJavaScript("document.body.innerText.includes('02:05')"));
  proj.webContents.send('cmd', { type: 'SYNC_TIMER', targetTabId: 'proj', remaining: null, isRunning: false, isDone: false });

  // S2 before-input-event + sendInputEvent
  const seen = [];
  let block = true;
  proj.webContents.on('before-input-event', (e, input) => {
    seen.push(input.type + ':' + input.key);
    if (block && (input.key === 'ArrowRight' || input.key === 'ArrowLeft')) e.preventDefault();
  });
  const before = states.proj?.currentSlide;
  proj.webContents.focus();
  proj.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
  proj.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' });
  await wait(800);
  log('S2_blocked_injected', { before, after: states.proj?.currentSlide, beforeInputSaw: [...seen] });
  block = false; seen.length = 0;
  proj.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
  proj.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' });
  await wait(800);
  log('S2_unblocked_injected', { after: states.proj?.currentSlide, beforeInputSaw: [...seen] });

  // S3a device emulation preview
  const prevA = makeView(makeSession('spike-prevA'));
  win.contentView.addChildView(prevA);
  prevA.setBounds({ x: 1290, y: 10, width: 480, height: 270 });
  await prevA.webContents.loadURL('deck://w8/' + encodeURIComponent(DECK_FILE) + '?tabId=prevA');
  prevA.webContents.enableDeviceEmulation({ screenPosition: 'desktop', screenSize: { width: 1280, height: 720 }, viewPosition: { x: 0, y: 0 }, deviceScaleFactor: 0, viewSize: { width: 1280, height: 720 }, scale: 0.375 });
  await wait(2500);
  log('S3a_emulation_innerWidth', await prevA.webContents.executeJavaScript('[innerWidth, innerHeight, Math.round(document.documentElement.getBoundingClientRect().width)]'));
  log('S3a_projector_innerWidth', await proj.webContents.executeJavaScript('[innerWidth, innerHeight]'));

  // S3b zoom preview
  const prevB = makeView(makeSession('spike-prevB'));
  win.contentView.addChildView(prevB);
  prevB.setBounds({ x: 1290, y: 300, width: 480, height: 270 });
  await prevB.webContents.loadURL('deck://w8/' + encodeURIComponent(DECK_FILE) + '?tabId=prevB');
  prevB.webContents.setZoomFactor(0.375);
  await wait(2500);
  log('S3b_zoom_innerWidth', await prevB.webContents.executeJavaScript('[innerWidth, innerHeight]'));
  log('S3b_projector_zoom_unchanged', proj.webContents.getZoomFactor());
  fs.writeFileSync(path.join(OUT, 'S3b-zoom.png'), (await prevB.webContents.capturePage()).toPNG());

  // S4 capturePage cost on projector view
  const times = [];
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    const img = await proj.webContents.capturePage();
    const jpg = img.resize({ width: 480 }).toJPEG(70);
    times.push([Date.now() - t, jpg.length]);
  }
  log('S4_capture_ms_bytes', times);
  fs.writeFileSync(path.join(OUT, 'S4-projector.png'), (await proj.webContents.capturePage()).toPNG());

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  app.quit();
});
