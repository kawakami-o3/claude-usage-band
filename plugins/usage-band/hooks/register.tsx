import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { UsageReading, UsageWindow } from '../types'

// Relative to the home directory. The menu bar script reads this file.
export const FILE_PATH = '.claude/plan-usage.json'

// Windows shown in the band, in display order, with their labels.
const LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }

const reading = atom({ plugin: 'usage-band', key: 'reading' } as const, null)

type Display = 'file' | 'band' | 'both'

export function displayOf(options: PluginOptions): Display {
  const value = options['display']
  return value === 'band' || value === 'both' ? value : 'file'
}

// The JSON written to disk. resetsAtEpoch is in seconds so that shell
// scripts can compare it with `date +%s` without parsing dates.
export function toFileText(windows: readonly UsageWindow[], readAt: number): string {
  const body = {
    version: 1,
    readAt: Math.floor(readAt / 1000),
    windows: windows.map(w => ({
      kind: w.kind,
      percentUsed: w.percentUsed,
      resetsAt: w.resetsAt ?? null,
      resetsAtEpoch: w.resetsAt ? Math.floor(Date.parse(w.resetsAt) / 1000) : null,
    })),
  }
  return JSON.stringify(body, null, 2) + '\n'
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'reset'
  const minutes = Math.floor(ms / 60000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}d${hours}h`
  if (hours > 0) return `${hours}h${mins}m`
  return `${mins}m`
}

export function pickWindows(windows: readonly UsageWindow[]): UsageWindow[] {
  return Object.keys(LABELS)
    .map(kind => windows.find(w => w.kind === kind))
    .filter((w): w is UsageWindow => w !== undefined)
}

async function save($: EngineInterface, windows: readonly UsageWindow[], display: Display) {
  // No reading yet (e.g. right after startup): keep the previous values
  // instead of overwriting them with nothing.
  if (windows.length === 0) return
  const now = await $.clock.now()
  const copy = windows.map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt }))

  if (display !== 'file') {
    const value: UsageReading = { windows: copy, readAt: now }
    await update($, reading, () => value)
  }
  if (display !== 'band') {
    const home = await $.env.get('HOME')
    if (home) await $.fs.write(`${home}/${FILE_PATH}`, toFileText(copy, now))
  }
}

export const register: Register = (on, options) => {
  const display = displayOf(options)

  // Read once at startup. Calling usage() with no arguments costs no tokens.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const usage = await $.session.usage()
    await save($, usage.rateLimits, display)
    return result
  })

  // Pushed by the engine after each turn and whenever a window moves a
  // whole point. Saved every time so that readAt stays fresh.
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await save($, e.rateLimits, display)
    return result
  })

  if (display === 'file') return

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const current = await read($, reading)
    const shown = current ? pickWindows(current.windows) : []
    if (shown.length === 0) return next(e)

    const now = await $.clock.now()
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        {shown.map((w, i) => {
          const color = w.percentUsed >= 90 ? 'error' : w.percentUsed >= 75 ? 'warning' : undefined
          const remaining = w.resetsAt ? formatRemaining(Date.parse(w.resetsAt) - now) : '?'
          const suffix = remaining === 'reset' ? 'reset' : `${remaining} left`
          return (
            <Text color={color} dimColor={color === undefined}>
              {i > 0 ? '  ·  ' : ''}
              {LABELS[w.kind]} {w.percentUsed}% ({suffix})
            </Text>
          )
        })}
      </Box>
    )
  })
}
