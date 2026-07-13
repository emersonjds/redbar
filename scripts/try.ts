// usage: npx tsx scripts/try.ts <repo-path> [base]
import { inspect } from '../src/engine.js'

const [root, base] = process.argv.slice(2)
if (!root) {
  console.error('usage: npx tsx scripts/try.ts <repo-path> [base]')
  process.exit(1)
}

const { language, base: usedBase, gaps } = inspect(root, base ? { base } : {})

console.log(`language: ${language.name}`)
console.log(`base:     ${usedBase}`)
console.log(`gaps:     ${gaps.length}\n`)

for (const g of gaps.slice(0, 20)) {
  const mark = g.fullyUncovered ? '!' : ' '
  const symbol = g.symbol ?? '(no symbol)'
  console.log(
    `${mark} [${String(g.score).padStart(3)}] ${g.kind.padEnd(11)} ${g.file}:${g.lines[0]} ${symbol} ` +
      `— ${g.lines.length} line(s), ${g.branches} branch(es)`,
  )
}
