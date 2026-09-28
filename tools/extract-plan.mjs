// Writes every code block whose first line is an "@file <path>" marker.
// Usage: node tools/extract-plan.mjs <plan.md> [path-prefix ...]
import fs from 'node:fs'
import path from 'node:path'

const [plan, ...prefixes] = process.argv.slice(2)
const text = fs.readFileSync(plan, 'utf8')
// Fences only count at the start of a line, so backticks inside code do not break alignment.
const block = /^```[a-z]*\r?\n([\s\S]*?)^```[ \t]*$/gm
const marker = /^\s*(?:\/\/|#|<!--|\/\*)\s*@file\s+(.+?)\s*(?:-->|\*\/)?\s*$/
let written = 0
for (const match of text.matchAll(block)) {
  const [first, ...rest] = match[1].split(/\r?\n/)
  const hit = marker.exec(first)
  if (!hit) continue
  const file = hit[1]
  if (prefixes.length && !prefixes.some((p) => file === p || file.startsWith(p))) continue
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, rest.join('\n'))
  console.log('wrote', file)
  written++
}
if (!written) {
  console.error('no @file blocks matched', prefixes)
  process.exit(1)
}
