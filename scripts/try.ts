// usage: npx tsx scripts/try.ts <repo-path> [base]
import { inspect } from '../src/engine.js'
import { renderText } from '../src/report.js'

const [root, base] = process.argv.slice(2)
if (!root) {
  console.error('usage: npx tsx scripts/try.ts <repo-path> [base]')
  process.exit(1)
}

console.log(renderText(inspect(root, base ? { base } : {})))
