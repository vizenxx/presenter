// Renders build/icon.svg to build/icon.png (1024 px). Run: npx electron tools/make-icon.cjs "<path to build>"
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const dir = process.argv[process.argv.length - 1]
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8')
  const win = new BrowserWindow({ show: false, width: 200, height: 200, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<html><body></body></html>')
  // Draw on a 1024 canvas: its size does not depend on the window or the screen.
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 1024
      c.getContext('2d').drawImage(img, 0, 0, 1024, 1024)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)})
  })`)
  fs.writeFileSync(path.join(dir, 'icon.png'), Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log('icon written')
  app.exit(0)
})
