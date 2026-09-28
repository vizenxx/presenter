// Throwaway spike preload: bridges the UXD202 BroadcastChannel protocol to the main process.
const { ipcRenderer } = require('electron');

const myTabId = new URLSearchParams(location.search).get('tabId');
const channel = new BroadcastChannel('UXD202_SLIDES_SYNC');

channel.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg && msg.type === 'SLIDE_STATE' && msg.tabId === myTabId) {
    ipcRenderer.send('deck-state', msg);
  }
});

ipcRenderer.on('cmd', (_e, cmd) => channel.postMessage(cmd));
setTimeout(() => channel.postMessage({ type: 'PING', targetTabId: myTabId }), 1500);
