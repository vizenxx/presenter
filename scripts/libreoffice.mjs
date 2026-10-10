#!/usr/bin/env node
/**
 * The LibreOffice that ships inside Presenter, so PowerPoint files open (with their click
 * animations) on a computer with nothing else installed.
 *
 *   node scripts/libreoffice.mjs prepare [--from <installed LibreOffice folder>] [--arch x64|arm64]
 *   node scripts/libreoffice.mjs check [--arch x64|arm64]
 *
 * prepare: takes the official LibreOffice release (downloaded and checked against its SHA-256,
 * or an installed copy with --from), keeps only what turning slides into pages needs, and puts
 * it in vendor/libreoffice-<platform>-<arch>/ (Windows: program/ and share/; Mac: LibreOffice.app).
 * The parts left out are the word processor, spreadsheet, formula editor, databases, Python,
 * templates, galleries, dictionaries and other languages. LibreOffice's core library links some
 * of them directly (solver, database client, help search, some import filters): those stay, or
 * LibreOffice does not start.
 *
 * check: converts a small test deck with click animations (scripts/fixtures/animated-deck.fodp)
 * to PPTX and that PPTX to the animated page set (SVG) and to PDF with the bundled copy.
 *
 * LibreOffice is free software under the Mozilla Public License 2.0; its licence files go along
 * (LICENSE.html, NOTICE, license.txt, CREDITS.fodt). Source: https://www.libreoffice.org/download/source-code/
 */
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VERSION = '26.8.1'
const BASE = `https://download.documentfoundation.org/libreoffice/stable/${VERSION}`
/** Official files and their SHA-256 (from the download site's .mirrorlist pages). */
const RELEASES = {
  'win32-x64': { url: `${BASE}/win/x86_64/LibreOffice_${VERSION}_Win_x86-64.msi`, sha256: 'c6298b10cfa1748bcbedad94c62ce771e240e5021bfd6d7a967cd571b04b5312' },
  'darwin-arm64': { url: `${BASE}/mac/aarch64/LibreOffice_${VERSION}_MacOS_aarch64.dmg`, sha256: 'ca074e0b13571efb30a31fc531c5f95e997030637325e5d5de92d67aefdf0dfc' },
  'darwin-x64': { url: `${BASE}/mac/x86_64/LibreOffice_${VERSION}_MacOS_x86-64.dmg`, sha256: '4c7464313a529e9074400cbcdc894fc40ac4ef9421ded03b16b5a78d12cb155e' }
}
const LICENCE_FILES = ['LICENSE.html', 'NOTICE', 'license.txt', 'CREDITS.fodt']

// ---------- what is left out ----------

/** Windows: files in program/ (globs on file names). */
const WIN_PROGRAM_OUT = [
  // Python scripting and the Java bean
  'python*', 'pyuno*', 'pythonloader*', 'pythonscript*', 'officebean*',
  // Writer, Calc, Math, VBA for them
  'swlo.dll', 'swuilo.dll', 'swdlo.dll', 'sw_writerfilterlo.dll', 'mswordlo.dll', 'msworks*',
  'sclo.dll', 'scuilo.dll', 'scdlo.dll', 'scfiltlo.dll', 'vbaswobjlo.dll', 'vbaobjlo.dll', 'smlo.dll', 'smdlo.dll',
  // Base: database front end, report builder, the Firebird engine (its client stays: the core links it)
  'dba*', 'dbu*', 'dbp*', 'dbmm*', 'dbtools*', 'rpt*', 'abp*', 'postgresql*', 'mysql*', 'Engine12*',
  // Import filters for other kinds of documents (word processing, spreadsheets, drawings)
  'wpftcalc*', 'wpftwriter*', 't602*', 'lwpft*', 'hwp*', 'abw*', 'ebook*', 'epub*', 'pagemaker*',
  'freehand*', 'visio*', 'cdr*', 'mspub*', 'qxp*', 'zmf*'
]
/** Windows: folders in program/. */
const WIN_PROGRAM_DIRS_OUT = ['python-core-*', 'classes', 'wizards']
/** share/ (Windows) and Contents/Resources (Mac): folders only the editors use. */
const SHARE_DIRS_OUT = ['extensions', 'gallery', 'template', 'wizards', 'autotext', 'autocorr', 'wordbook', 'xpdfimport', 'basic', 'Scripts', 'firebird', 'help']
/** Mac: frameworks only Python scripting uses. */
const MAC_FRAMEWORKS_OUT = ['LibreOfficePython.framework']

// ---------- helpers ----------

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}

function globToRegExp(glob) {
  return new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i')
}

function removeMatching(dir, globs, { dirs = false } = {}) {
  if (!fs.existsSync(dir)) return 0
  const patterns = globs.map(globToRegExp)
  let n = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() !== dirs) continue
    if (!patterns.some((p) => p.test(entry.name))) continue
    fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true })
    n++
  }
  return n
}

/** Other UI languages: only English stays (it is built in; the rest are translations). */
function removeLanguages(resourceDir, registryDir) {
  if (fs.existsSync(resourceDir)) {
    for (const entry of fs.readdirSync(resourceDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'common' && !/^en(_|$)/.test(entry.name)) fs.rmSync(path.join(resourceDir, entry.name), { recursive: true, force: true })
    }
  }
  if (fs.existsSync(registryDir)) {
    for (const name of fs.readdirSync(registryDir)) {
      if (/^Langpack-/.test(name) && name !== 'Langpack-en-US.xcd') fs.rmSync(path.join(registryDir, name), { force: true })
    }
    const res = path.join(registryDir, 'res')
    if (fs.existsSync(res)) {
      for (const name of fs.readdirSync(res)) {
        if (!/en-US/.test(name)) fs.rmSync(path.join(res, name), { force: true })
      }
    }
  }
}

/** Icon themes: one is enough (the editors are never shown). */
function keepOneIconTheme(configDir) {
  if (!fs.existsSync(configDir)) return
  const themes = fs.readdirSync(configDir).filter((n) => /^images_.*\.zip$/.test(n))
  const keep = themes.find((n) => n === 'images_colibre.zip') ?? themes.find((n) => n === 'images_colibre_svg.zip') ?? themes[0]
  for (const n of themes) if (n !== keep) fs.rmSync(path.join(configDir, n), { force: true })
}

function folderSize(dir) {
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) total += folderSize(p)
    else if (entry.isFile()) total += fs.statSync(p).size
  }
  return total
}

function sha256(file) {
  const hash = crypto.createHash('sha256')
  const fd = fs.openSync(file, 'r')
  const buf = Buffer.alloc(1 << 20)
  let n
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n))
  fs.closeSync(fd)
  return hash.digest('hex')
}

async function download(release, cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true })
  const file = path.join(cacheDir, path.basename(new URL(release.url).pathname))
  if (fs.existsSync(file) && sha256(file) === release.sha256) return file
  console.log(`downloading ${release.url}`)
  const res = await fetch(release.url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status} ${release.url}`)
  const out = fs.createWriteStream(file)
  for await (const chunk of res.body) out.write(chunk)
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())))
  const got = sha256(file)
  if (got !== release.sha256) {
    fs.rmSync(file, { force: true })
    throw new Error(`SHA-256 does not match for ${release.url}: ${got} (expected ${release.sha256})`)
  }
  return file
}

/** The folder that holds program/soffice.com inside an extracted or installed Windows LibreOffice. */
function findWindowsRoot(dir) {
  const stack = [dir]
  while (stack.length > 0) {
    const d = stack.pop()
    if (fs.existsSync(path.join(d, 'program', 'soffice.com'))) return d
    for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) stack.push(path.join(d, e.name))
  }
  return null
}

// ---------- prepare ----------

function trimWindows(dest) {
  const program = path.join(dest, 'program')
  const share = path.join(dest, 'share')
  removeMatching(program, WIN_PROGRAM_OUT)
  removeMatching(program, WIN_PROGRAM_DIRS_OUT, { dirs: true })
  removeMatching(share, SHARE_DIRS_OUT, { dirs: true })
  removeLanguages(path.join(program, 'resource'), path.join(share, 'registry'))
  keepOneIconTheme(path.join(share, 'config'))
}

function trimMac(app) {
  const res = path.join(app, 'Contents', 'Resources')
  removeMatching(res, SHARE_DIRS_OUT, { dirs: true })
  removeMatching(path.join(app, 'Contents', 'Frameworks'), MAC_FRAMEWORKS_OUT, { dirs: true })
  removeLanguages(path.join(res, 'resource'), path.join(res, 'registry'))
  keepOneIconTheme(path.join(res, 'config'))
  // Other UI languages of the app bundle itself.
  for (const name of fs.readdirSync(res)) {
    if (name.endsWith('.lproj') && !/^en(_|\.|-)/.test(name) && name !== 'Base.lproj') fs.rmSync(path.join(res, name), { recursive: true, force: true })
  }
}

async function prepare() {
  const platform = process.platform
  const arch = arg('arch', process.arch)
  const key = `${platform}-${arch}`
  const dest = path.join(ROOT, 'vendor', `libreoffice-${key}`)
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })
  const from = arg('from')
  const release = RELEASES[key]
  if (!from && !release) throw new Error(`no LibreOffice release listed for ${key}`)
  const cache = path.join(ROOT, 'vendor', 'cache')

  if (platform === 'win32') {
    let source = from
    let work = null
    if (!source) {
      const msi = await download(release, cache)
      work = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-msi-'))
      // An administrative install only unpacks the files; nothing is installed on the computer.
      execFileSync('msiexec', ['/a', msi, '/qn', `TARGETDIR=${work}`], { stdio: 'inherit' })
      source = findWindowsRoot(work)
      if (!source) throw new Error('soffice.com not found in the unpacked MSI')
    }
    for (const part of ['program', 'share', 'presets']) {
      if (fs.existsSync(path.join(source, part))) fs.cpSync(path.join(source, part), path.join(dest, part), { recursive: true })
    }
    for (const f of LICENCE_FILES) if (fs.existsSync(path.join(source, f))) fs.copyFileSync(path.join(source, f), path.join(dest, f))
    if (work) fs.rmSync(work, { recursive: true, force: true })
    trimWindows(dest)
  } else if (platform === 'darwin') {
    const app = path.join(dest, 'LibreOffice.app')
    if (from) execFileSync('ditto', [from, app], { stdio: 'inherit' })
    else {
      const dmg = await download(release, cache)
      const mount = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-dmg-'))
      execFileSync('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, dmg], { stdio: 'inherit' })
      try {
        execFileSync('ditto', [path.join(mount, 'LibreOffice.app'), app], { stdio: 'inherit' })
      } finally {
        execFileSync('hdiutil', ['detach', mount], { stdio: 'inherit' })
      }
    }
    const res = path.join(app, 'Contents', 'Resources')
    for (const f of LICENCE_FILES) if (fs.existsSync(path.join(res, f))) fs.copyFileSync(path.join(res, f), path.join(dest, f))
    trimMac(app)
    // Files were removed from the signed app: sign it again (ad hoc, like Presenter itself).
    execFileSync('xattr', ['-cr', app])
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  } else throw new Error(`no bundled LibreOffice for ${platform}`)

  fs.writeFileSync(
    path.join(dest, 'ABOUT-PRESENTER.txt'),
    [
      `LibreOffice ${from ? '(copied from an installed copy)' : VERSION}, reduced for Presenter: it only turns slides into pages.`,
      from ? `Copied from: ${from}` : `From: ${release.url}\nSHA-256: ${release.sha256}`,
      'LibreOffice is free software under the Mozilla Public License 2.0 (see LICENSE.html and NOTICE).',
      'Source code: https://www.libreoffice.org/download/source-code/',
      ''
    ].join('\n')
  )
  console.log(`prepared ${path.relative(ROOT, dest)}: ${(folderSize(dest) / 1048576).toFixed(0)} MB`)
}

// ---------- check ----------

export function bundledSoffice(key) {
  const dest = path.join(ROOT, 'vendor', `libreoffice-${key}`)
  const soffice = process.platform === 'win32' ? path.join(dest, 'program', 'soffice.com') : path.join(dest, 'LibreOffice.app', 'Contents', 'MacOS', 'soffice')
  return fs.existsSync(soffice) ? soffice : null
}

function check() {
  const key = `${process.platform}-${arg('arch', process.arch)}`
  const soffice = bundledSoffice(key)
  if (!soffice) throw new Error(`no bundled LibreOffice in vendor/libreoffice-${key}; run prepare first`)
  // A short folder: LibreOffice's first start fails when its profile path is very long.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-check-'))
  const profile = pathToFileURL(path.join(work, 'profile')).href
  const convert = (format, input) =>
    execFileSync(soffice, ['--headless', '--norestore', '--nolockcheck', '--nodefault', `-env:UserInstallation=${profile}`, '--convert-to', format, '--outdir', work, input], { stdio: 'pipe', timeout: 180_000 })
  try {
    convert('pptx', path.join(ROOT, 'scripts', 'fixtures', 'animated-deck.fodp'))
    const pptx = path.join(work, 'animated-deck.pptx')
    if (!fs.existsSync(pptx)) throw new Error('no PPTX made from the test deck')
    convert('svg:impress_svg_Export', pptx)
    convert('pdf', pptx)
    const svg = fs.readFileSync(path.join(work, 'animated-deck.svg'), 'utf8')
    const slides = /ooo:number-of-slides="(\d+)"/.exec(svg)?.[1]
    const clicks = (svg.match(/presentation:node-type="on-click"/g) ?? []).length
    if (slides !== '3') throw new Error(`the animated page set has ${slides} slides, not 3 (the hidden slide left out)`)
    if (clicks !== 3) throw new Error(`the animated page set has ${clicks} click steps, not 3`)
    if (!/function SlideShow\(/.test(svg)) throw new Error('the animated page set has no slide show engine')
    if (!(fs.statSync(path.join(work, 'animated-deck.pdf')).size > 1000)) throw new Error('no PDF')
    console.log(`ok bundled LibreOffice (${key}): PPTX, animated pages (3 slides, 3 click steps) and PDF`)
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

const command = process.argv[2]
if (command === 'prepare') await prepare()
else if (command === 'check') check()
else if (command) {
  console.error('usage: node scripts/libreoffice.mjs prepare [--from <folder>] [--arch x64|arm64] | check [--arch x64|arm64]')
  process.exit(1)
}
