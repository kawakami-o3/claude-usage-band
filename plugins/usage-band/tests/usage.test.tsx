import { expect, test } from 'claude-code/testing'

const NOW = Date.parse('2026-11-06T00:00:00Z')

const LIMITS = [
  { kind: 'seven_day', percentUsed: 26, resetsAt: '2026-11-08T02:00:00Z' },
  { kind: 'five_hour', percentUsed: 92, resetsAt: '2026-11-06T03:19:00Z' },
]

const BAND = {
  plugin: 'usage-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false },
} as const

// Stands in for the engine; every fs.write call is recorded in writes.
function engine(on: Parameters<Parameters<typeof test>[1]>[1], writes: { path: string; text: string }[], limits = LIMITS) {
  on('clock.now', () => ({ value: NOW }))
  on('env.get', () => ({ value: '/Users/me' }))
  on('fs.write', (_, e) => (writes.push({ path: e.path, text: e.text }), { value: undefined }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: {}, rateLimits: limits } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

const START = { cwd: '/', surface: 'desktop', isInteractive: true } as const

test('default (file): writes the file and draws no band', async ($, on) => {
  const writes: { path: string; text: string }[] = []
  engine(on, writes)
  await $.session.start(START)

  expect(writes.length).toBe(1)
  expect(writes[0]?.path).toBe('/Users/me/.claude/plan-usage.json')
  const body = JSON.parse(writes[0]?.text ?? '{}')
  expect(body.readAt).toBe(NOW / 1000)
  expect(body.windows[1]).toEqual({
    kind: 'five_hour',
    percentUsed: 92,
    resetsAt: '2026-11-06T03:19:00Z',
    resetsAtEpoch: Date.parse('2026-11-06T03:19:00Z') / 1000,
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('band: draws the band and writes no file', { options: { display: 'band' } }, async ($, on) => {
  const writes: { path: string; text: string }[] = []
  engine(on, writes)
  await $.session.start(START)

  expect(writes.length).toBe(0)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /5h/ }))?.text).toBe('5h 92% (3h19m left)')
    expect((await ui.find({ type: 'Text', text: /7d/ }))?.text).toBe('  ·  7d 26% (2d2h left)')
    await ui.unmount()
  }
})

test('both: updates the band and the file', { options: { display: 'both' } }, async ($, on) => {
  const writes: { path: string; text: string }[] = []
  engine(on, writes)
  await $.session.start(START)
  await $.session.measure({
    context: {},
    rateLimits: [{ kind: 'five_hour', percentUsed: 40, resetsAt: '2026-11-06T01:00:00Z' }],
    changed: ['rateLimits'],
  })

  expect(writes.length).toBe(2)
  expect(JSON.parse(writes[1]?.text ?? '{}').windows[0].percentUsed).toBe(40)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /5h/ }))?.text).toBe('5h 40% (1h0m left)')
  expect(await ui.find({ type: 'Text', text: /7d/ })).toBeUndefined()
  await ui.unmount()
})

test('with no reading, writes nothing and leaves the band to the engine', { options: { display: 'both' } }, async ($, on) => {
  const writes: { path: string; text: string }[] = []
  engine(on, writes, [])
  await $.session.start(START)
  await $.session.measure({ context: {}, rateLimits: [], changed: ['context'] })

  expect(writes.length).toBe(0)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})
