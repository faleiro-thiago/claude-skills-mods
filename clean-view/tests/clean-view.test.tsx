import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { applyPlan, applyProgress, asksUser, cleanName } from '../hooks/clean-view'

const SURFACES = ['terminal', 'desktop'] as const

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const

const BAND = {
  plugin: 'clean-view',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 19 },
    view: {},
  },
} as const

/** The world beneath the mod: a clock, a store and the tools it reaches. */
async function start($: Engine, on: On) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__clean-view__${e.name}` } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('classic.Notification', () => ({}))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', { tool: 'Read' }, () => ({ result: 'file text' }))
  on('tool.call', { tool: 'TodoWrite' }, (_$, e) => ({ result: { oldTodos: [], newTodos: e.todos } }))
  // What's beneath the band, other plugins' rows (image-view's thumbnails) included: nothing here.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="beneath" />
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  return clock
}

const TODOS = [
  { content: 'Read your brand notes', status: 'completed', activeForm: 'Reading' },
  { content: 'Build the pricing section', status: 'in_progress', activeForm: 'Building' },
  { content: 'Add the contact form', status: 'pending', activeForm: 'Adding' },
  { content: 'Polish the footer', status: 'pending', activeForm: 'Polishing' },
] as const

test('1. names are cleaned into plain English', () => {
  expect(cleanName('Build the pricing section in `src/Pricing.tsx`')).toBe('Build the pricing section in')
  expect(cleanName('Update src/app/page.tsx with the new copy')).toBe('Update with the new copy')
  expect(cleanName('fix Pricing.tsx layout')).toBe('Fix layout')
  expect(cleanName('`npm run build`')).toBe('Trabalhando nisso')

  const long = cleanName(
    'Rewrite the whole onboarding experience so that new customers feel welcome every time',
  )
  expect(long.length).toBeLessThanOrEqual(40)
  expect(long).toEndWith('…')
  expect(long).toStartWith('Rewrite the whole onboarding')
})

test('2. a to-do list and a 60% report draw done, current, next and up next', async ($, on) => {
  await start($, on)
  await $.tool.call({ tool: 'TodoWrite', todos: [...TODOS] })
  await $.tool.call({ tool: 'mcp__clean-view__report_progress', task: 'Build the pricing section', percent: 60 })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: '✓' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Feito' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '▶' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '██████░░░░' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '60%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ Próximo$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Em seguida/ })).toBeDefined()
    expect(await ui.find({ key: 'clean-view-toggle' })).toBeDefined()
    await ui.unmount()
  }
})

test('3. a permission prompt shows Needs you', async ($, on) => {
  await start($, on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await $.classic.Notification({
    message: 'Claude needs your permission to use Bash',
    notification_type: 'permission_prompt',
  })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Precisa de você/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /precisa do seu OK para continuar/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '‖' })).toBeDefined()
    await ui.unmount()
  }
})

test('4. /simple off hides the band and leaves only the button', async ($, on) => {
  await start($, on)
  await $.tool.call({ tool: 'TodoWrite', todos: [...TODOS] })
  await $.command.run({ ...RUN, command: 'simple', args: 'off' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /pricing section/ })).toBeUndefined()
    expect((await ui.find({ key: 'clean-view-toggle' }))?.props.label).toBe('○ Clean View: DESLIGADO')
    await ui.unmount()
  }

  await $.command.run({ ...RUN, command: 'simple', args: '' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /pricing section/ })).toBeDefined()
})

test('5. plan_steps then 100% checks off step one and starts step two', async ($, on) => {
  await start($, on)
  const planned = await $.tool.call({
    tool: 'mcp__clean-view__plan_steps',
    steps: ['Read your brand notes', 'Build the pricing section', 'Polish the footer'],
  })
  expect(planned.result).toBe('3 passos planejados. O primeiro já começou.')

  const noted = await $.tool.call({
    tool: 'mcp__clean-view__report_progress',
    task: 'Read your brand notes',
    percent: 140,
  })
  expect(noted.result).toBe('Progresso registrado: 100%.')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const row = async (i: number) => (await ui.find({ type: 'Box', key: `row-${i}` }))?.text ?? ''
  expect(await row(0)).toMatch(/^✓ Read your brand notes.*Feito$/)
  expect(await row(1)).toMatch(/^▶ Build the pricing section.*Trabalhando$/)
  expect(await row(2)).toMatch(/^○ Polish the footer.*Próximo$/)

  const later = applyProgress(applyPlan(null, ['A step', 'B step', 'C step'], 0), 'C step', 30, 0)
  expect(later.tasks.map(task => task.status)).toEqual(['done', 'done', 'active'])
  expect(later.tasks[2]?.percent).toBe(30)
})

test('6. tools are denied before a plan and allowed after', async ($, on) => {
  await start($, on)
  await $.turn.start({ text: 'Fix the typo on the home page', turnId: 't1' })

  const before = await $.tool.call({ tool: 'Read', file_path: '/tmp/a.md' })
  expect(before.deny ?? before.text ?? '').toMatch(/plan_steps primeiro/)

  await $.tool.call({ tool: 'mcp__clean-view__plan_steps', steps: ['Find the typo', 'Fix the typo'] })
  const after = await $.tool.call({ tool: 'Read', file_path: '/tmp/a.md' })
  expect(after.deny).toBeUndefined()
  expect(after.result).toBe('file text')
})

test('a finished job says All done and shrinks after 5 seconds', async ($, on) => {
  const clock = await start($, on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await $.tool.call({ tool: 'mcp__clean-view__plan_steps', steps: ['Build the page'] })
  await clock.advance(134_000)
  await $.tool.call({ tool: 'mcp__clean-view__report_progress', task: 'Build the page', percent: 100 })
  await $.turn.complete({ answer: 'Done.', durationMs: 134_000, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Tudo pronto/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /levou 2m 14s/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Build the page/ })).toBeDefined()

  await clock.advance(5_000)
  await ui.redraw()
  expect(await ui.findAll({ type: 'Text', text: /Build the page/ })).toHaveLength(0)
  expect(await ui.find({ type: 'Text', text: /Tudo pronto/ })).toBeDefined()
})

test('tool rows are hidden while on and come back when off', async ($, on) => {
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>raw tool output</Text>
  })
  await start($, on)
  const row = {
    plugin: 'clean-view',
    component: 'ToolResult',
    requestId: 'toolu_1',
    props: { tool_use_id: 'toolu_1', tool: 'Bash', output: { stdout: 'ok' }, isErrored: false },
  } as const

  const hidden = await $.ui.mount({ ...row, surface: 'terminal' })
  expect(await hidden.find({ type: 'Text', text: /raw tool output/ })).toBeUndefined()
  await hidden.unmount()

  await $.command.run({ ...RUN, command: 'simple', args: 'off' })
  const shown = await $.ui.mount({ ...row, surface: 'terminal' })
  expect(await shown.find({ type: 'Text', text: /raw tool output/ })).toBeDefined()
})

test('the band keeps what is beneath it, such as image-view thumbnails', async ($, on) => {
  await start($, on)
  await $.tool.call({ tool: 'TodoWrite', todos: [...TODOS] })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /pricing section/ })).toBeDefined()
    expect(await ui.find({ key: 'beneath' })).toBeDefined()
    await ui.unmount()
  }
})

test('a turn that ends with steps unreported still says All done', async ($, on) => {
  await start($, on)
  await $.turn.start({ text: 'Delete my backups', turnId: 't1' })
  await $.tool.call({ tool: 'mcp__clean-view__plan_steps', steps: ['List the backups', 'Delete them'] })
  await $.turn.complete({ answer: 'Deleted both files.', durationMs: 3_000, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Tudo pronto/ })).toBeDefined()
  expect(await ui.findAll({ type: 'Text', text: /Precisa de você/ })).toHaveLength(0)
})

test('a turn that ends on a question with steps left says Needs you', async ($, on) => {
  await start($, on)
  await $.turn.start({ text: 'Clean my folder', turnId: 't1' })
  await $.tool.call({ tool: 'mcp__clean-view__plan_steps', steps: ['Find old files', 'Delete them'] })
  await $.turn.complete({ answer: 'Found 3 old files. Delete them?', durationMs: 3_000, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Precisa de você/ })).toBeDefined()
})

test('asksUser spots a closing question and ignores the rest', () => {
  expect(asksUser('Quer que eu faça?')).toBe(true)
  expect(asksUser('**Quer que eu faça?**')).toBe(true)
  expect(asksUser('Quer que eu faça?\n')).toBe(true)
  expect(asksUser('Feito. O que era `a?b` já passou.')).toBe(false)
  expect(asksUser('Feito.')).toBe(false)
  expect(asksUser(undefined)).toBe(false)
})
