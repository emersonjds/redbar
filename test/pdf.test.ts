import { afterEach, describe, expect, it, vi } from 'vitest'

// pdf.ts shells out to a real browser binary — a unit test must never launch Chrome, so the two
// I/O dependencies (the process spawn and the filesystem probe) are the exception the convention
// itself names: this is not code with a bug, it is code whose job IS the I/O.
vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }))
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdtempSync: vi.fn(() => '/tmp/redbar-fake'),
  writeFileSync: vi.fn(),
}))

const { execFileSync } = await import('node:child_process')
const { existsSync, writeFileSync } = await import('node:fs')
const { findBrowser, htmlToPdf } = await import('../src/pdf.js')

const existsSyncMock = vi.mocked(existsSync)
const execFileSyncMock = vi.mocked(execFileSync)
const writeFileSyncMock = vi.mocked(writeFileSync)

afterEach(() => {
  vi.clearAllMocks()
})

describe('findBrowser', () => {
  it('returns null when none of the candidate paths exist', () => {
    existsSyncMock.mockReturnValue(false)

    expect(findBrowser()).toBeNull()
  })

  it('returns the first candidate path that exists on disk', () => {
    existsSyncMock.mockImplementation((path) => path === '/usr/bin/google-chrome-stable')

    expect(findBrowser()).toBe('/usr/bin/google-chrome-stable')
  })
})

describe('htmlToPdf', () => {
  it('returns false and never spawns a process when no browser is found', () => {
    existsSyncMock.mockReturnValue(false)

    expect(htmlToPdf('<html></html>', '/out/report.pdf')).toBe(false)
    expect(execFileSyncMock).not.toHaveBeenCalled()
  })

  it('writes the html to a temp file and drives the browser headless when one is found', () => {
    existsSyncMock.mockImplementation((path) => path === '/usr/bin/chromium')

    const result = htmlToPdf('<html>report</html>', '/out/report.pdf')

    expect(result).toBe(true)
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      '/tmp/redbar-fake/report.html',
      '<html>report</html>',
    )
    expect(execFileSyncMock).toHaveBeenCalledWith(
      '/usr/bin/chromium',
      [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--no-pdf-header-footer',
        '--print-to-pdf=/out/report.pdf',
        '/tmp/redbar-fake/report.html',
      ],
      { stdio: 'ignore' },
    )
  })
})
