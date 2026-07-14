// Pure: string in/out, no disk access. cli.ts reads the convention files and passes them in.
import type { Inspection } from './engine.js'
import { scoreArithmetic } from './explain.js'
import { ranked, severity } from './severity.js'
import type { Gap, TestKind } from './types.js'

/** Full text of `conventions/<lang>/<layer>.md`, for the layers the project ships one for. */
export type Conventions = Partial<Record<TestKind, string>>

/**
 * The briefing: the document the whole tool exists to produce.
 *
 * It is written for an AGENT to execute and for a HUMAN to audit, in that order. Everything the
 * agent needs is inside it — the work, the order, the layer, the standard, and the provenance of
 * every number. That self-containment is the point: the dev pastes this into whatever agent they
 * already use, with no MCP, no plugin, no redbar installed on their machine. The document
 * outlives the tool that produced it.
 */
export function renderBriefing(
  inspection: Inspection,
  conventions: Conventions,
  repoName: string,
): string {
  const { language, runner, base, gaps, stale } = inspection
  const out: string[] = []

  out.push(
    `# Testing brief — ${repoName}`,
    '',
    `Produced by **redbar** from \`${runner.reportPath}\` × \`git diff ${base}...HEAD\`. ` +
      `**No language model produced the list below** — it is the coverage report your test runner ` +
      `wrote, crossed with the diff of this branch. Every number here is reproducible: run it ` +
      `twice, get the same document.`,
    '',
    `| | |`,
    `|---|---|`,
    `| language | ${language.name} |`,
    `| runner | ${runner.name} |`,
    `| base | \`${base}\` |`,
    `| gaps | ${gaps.length} |`,
    '',
  )

  if (stale) {
    // The document is the agent's source of truth, so it has to be honest about its own limits.
    // A stale report does not under-report evenly — code written after the last coverage run is
    // ABSENT from it, and an absent file is indistinguishable from one with nothing to test. The
    // gaps this document hides best are the newest ones, which are the ones that matter most.
    out.push(
      `> **WARNING — this list is a lower bound, not the truth.**`,
      `>`,
      `> \`${runner.reportPath}\` is **older than the source code it describes**. Anything written ` +
        `since the last coverage run is missing from the report entirely, and missing reads as ` +
        `"nothing to test". Everything listed below is real; what is *not* listed cannot be trusted.`,
      `>`,
      `> Regenerate it before relying on this document: \`${runner.coverageCommand}\``,
      '',
    )
  }

  if (gaps.length === 0) {
    out.push(
      'No gaps. Every line this branch changed is executed by a test. There is nothing to write.',
      '',
    )
    return out.join('\n')
  }

  const work = ranked(gaps)
  // only the layers that actually have work — a brief that ships three standards for one unit
  // test is a brief the agent skims, and skimming is how the standard gets ignored
  const layers = [...new Set(work.map((g) => g.kind))]

  out.push(
    '## How to use this document',
    '',
    'Hand it to your agent. It is the complete brief: **what** to test, in **what order**, at ' +
      '**which layer**, and to **whose standard**. Work top to bottom — the order is the priority, ' +
      'and it was computed, not chosen.',
    '',
    '## The rules',
    '',
    '1. **One test file per gap.** Create nothing else. A pull request that touches twelve files ' +
      'to cover one symbol will not be reviewed.',
    '2. **Never weaken an assertion to make a test pass.** A test that asserts nothing is worse ' +
      'than no test: it reports coverage that does not exist, which is the exact lie this ' +
      'document exists to eliminate. If it will not pass honestly, say so and move on.',
    '3. **Run every test you write.** A test that was never executed is not a test, it is a ' +
      'guess with a filename. If it fails twice, delete it and flag the gap for a human.',
    '4. **Follow the standard for the layer** (reproduced at the bottom). Do not write from memory ' +
      'of what a good test looks like — that memory is a house style, and importing it is the ' +
      'problem this document was built to solve.',
    '',
    '## The work',
    '',
  )

  work.forEach((gap, i) => {
    const std = language.standards[gap.kind]
    out.push(
      `### ${i + 1}. \`${gap.symbol ?? '(no symbol)'}\` — ${severity(gap)}`,
      '',
      `- **File:** \`${gap.file}:${gap.lines[0]}\``,
      `- **Layer:** **${gap.kind}** — follow [${std.name}](${std.url})`,
      `- **Uncovered:** ${gap.lines.length} changed line(s) that no test executes, ` +
        `across ${gap.branches} branch(es)`,
      `- **Coverage:** ${gap.fullyUncovered ? 'none at all — every branch in it is a path nothing has ever run' : 'partly covered — a test already points at it, extend that one'}`,
      `- **Score:** ${scoreArithmetic(gap)}  *(uncovered lines × (no coverage ? 2 : 1) × (1 + branches))*`,
      '',
    )
  })

  out.push('## The standards', '')

  for (const layer of layers) {
    const std = language.standards[layer]
    const text = conventions[layer]

    out.push(`### ${layer} — ${std.name}`, '')

    if (text) {
      out.push(text.trim(), '')
    } else {
      // No convention file for this language yet — and the document still works. The standard is
      // the library's documentation either way, and the model was trained on it.
      out.push(
        `The standard is **[${std.name}](${std.url})**. Follow it as written. It is not a house ` +
          `style and it is not up for debate in review — it is the library's own documentation.`,
        '',
      )
    }
  }

  out.push(
    '---',
    '',
    `<sub>Generated by redbar. The gap list is a measurement, not an opinion: \`${runner.reportPath}\` ` +
      `× \`git diff ${base}...HEAD\`. Reproduce it with \`redbar briefing\`, audit any single number ` +
      `with \`redbar explain <symbol>\`.</sub>`,
  )

  return out.join('\n')
}
