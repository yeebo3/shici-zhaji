// Quick script to extract poems array from poems.ts into poems-source.json
const fs = require('fs')
const path = require('path')

const tsContent = fs.readFileSync(path.join(__dirname, '..', 'data', 'poems.ts'), 'utf-8')

// Extract the array portion between the first [ and the matching ]
const start = tsContent.indexOf('[')
// Find the closing ] before the helper functions
const helperStart = tsContent.indexOf('// Helper functions')
const arrayStr = tsContent.substring(start, helperStart).trim().replace(/,\s*$/, '')

// Convert TS-style object to valid JSON by:
// 1. Adding quotes around keys
// 2. Replacing single quotes with double quotes
let json = arrayStr
  // Replace property keys without quotes
  .replace(/(\s+)(\w+):/g, '$1"$2":')
  // Replace single-quoted strings with double-quoted
  .replace(/'/g, '"')

try {
  const parsed = JSON.parse(json)
  const outPath = path.join(__dirname, '..', 'data', 'poems-source.json')
  fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2))
  console.log(`Extracted ${parsed.length} poems to poems-source.json`)
} catch(e) {
  console.error('Parse error, writing raw for debug')
  fs.writeFileSync(path.join(__dirname, 'debug.json'), json)
  console.error(e.message)
}
