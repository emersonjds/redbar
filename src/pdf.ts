import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The browser already on the machine, used as the PDF engine.
 *
 * A PDF library would be the first runtime dependency this project has ever had — a large one,
 * with its own font stack, to re-render a page the browser already renders correctly. The HTML
 * report ships with a print stylesheet precisely so that the browser IS the renderer. This finds
 * it and drives it headless; if it is not there, the human presses Cmd+P and gets the same file.
 */
const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
]

export function findBrowser(): string | null {
  return CANDIDATES.find((path) => existsSync(path)) ?? null
}

/**
 * Render `html` to a PDF at `out`. Returns false when no browser was found — the caller decides
 * what to tell the human, and the HTML is already on disk either way, so nothing is lost.
 */
export function htmlToPdf(html: string, out: string): boolean {
  const browser = findBrowser()
  if (!browser) return false

  // the page must be a real file: --print-to-pdf on a data: URL silently drops the print stylesheet
  const dir = mkdtempSync(join(tmpdir(), 'redbar-'))
  const page = join(dir, 'report.html')
  writeFileSync(page, html)

  execFileSync(
    browser,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--no-pdf-header-footer',
      `--print-to-pdf=${out}`,
      page,
    ],
    { stdio: 'ignore' },
  )

  return true
}
