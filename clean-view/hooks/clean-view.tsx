import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'

import type { Checklist, Phase, Task } from '../types'

type Engine = EngineInterface

const enabledAtom = atom({ plugin: 'clean-view', key: 'cleanViewEnabled' } as const, true)
const checklistAtom = atom({ plugin: 'clean-view', key: 'checklist' } as const, null as Checklist | null)
const tickAtom = atom({ plugin: 'clean-view', key: 'tick' } as const, 0)

const STORE_KEY = 'cleanViewEnabled'
const PLAN_TOOL = 'mcp__clean-view__plan_steps'
const PROGRESS_TOOL = 'mcp__clean-view__report_progress'
const ALWAYS_ALLOWED = new Set([
  'ToolSearch',
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'AskUserQuestion',
  PLAN_TOOL,
  PROGRESS_TOOL,
])

const MAX_NAME = 40
const METER = 10
const TICK_MS = 250
const COLLAPSE_MS = 5000
const FAILURES_TO_STUCK = 3

const PLACEHOLDERS = ['Entender o seu pedido', 'Planejar os passos']
const FALLBACK_TITLE = 'Seu pedido'

const REASONS = {
  permission: 'o Claude precisa do seu OK para continuar',
  question: 'o Claude tem uma pergunta para você',
  waiting: 'o Claude está esperando sua resposta',
  saidNo: 'você recusou um passo, então o Claude pausou',
  failing: 'um passo continua falhando, o Claude está tentando outro caminho',
  refusal: 'o Claude não conseguiu ajudar com esse pedido',
  rateLimit: 'você atingiu seu limite de uso, tente de novo daqui a pouco',
  overloaded: 'os servidores do Claude estão ocupados, tente de novo em um minuto',
  tooLong: 'a conversa ficou longa demais, digite /compact e tente de novo',
  network: 'a conexão com a internet caiu, tente de novo',
  auth: 'você precisa entrar de novo, digite /login',
  unknown: 'algo deu errado, tente de novo',
}

const GUIDANCE = `# Clean View: show your plan as a simple checklist

The person is using Clean View, which hides tool calls and shows a plain checklist of your work instead. Keep it accurate:

- For every request, even a quick question, first call \`${PLAN_TOOL}\` with every step of the job, 2 to 8 short names in order. If it is deferred, load it with ToolSearch first. Other tools are refused until a plan exists.
- Write every step name in plain Brazilian Portuguese (pt-BR) that a non-technical person understands. Keep it under 40 characters and start it with a verb in the infinitive, like "Montar a seção de preços". Pass the step names to the tools exactly in that language.
- Never put file paths, file names, commands, code or tool names in a step name.
- Call \`${PROGRESS_TOOL}\` as real progress happens on the current step, and with percent 100 the moment a step finishes.
- If this session has TodoWrite or TaskCreate, you may use your to-do list as the plan instead, with step names that follow the same rules.
- This applies to the main conversation only. A subagent skips it.`

const CODE_EXTENSIONS =
  'tsx?|jsx?|mjs|cjs|mts|cts|py|rb|go|rs|java|kt|swift|cc|cpp|c|hpp|h|cs|php|sh|bash|zsh|ps1|json|jsonc|ya?ml|toml|ini|env|lock|css|scss|sass|less|html?|xml|svg|md|mdx|sql|vue|svelte|astro|gradle|tf|ipynb|dockerfile'
const CODE_FILE = new RegExp(`\\S*\\.(?:${CODE_EXTENSIONS})(?![\\w])\\S*`, 'gi')

/** Every name shown passes through here: no code, paths or file names, at most 40 characters. */
export function cleanName(raw: unknown): string {
  let text = typeof raw === 'string' ? raw : ''
  text = text.replace(/`[^`]*`?/g, ' ')
  text = text.replace(/\S*[/\\]\S*/g, ' ')
  text = text.replace(CODE_FILE, ' ')
  text = text.replace(/\(\s*\)|\[\s*\]/g, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  text = text.replace(/^[,;:.\-–—\s]+/, '')

  if (text === '') {
    return 'Trabalhando nisso'
  }

  text = text.charAt(0).toUpperCase() + text.slice(1)

  if (text.length <= MAX_NAME) {
    return text
  }

  const head = text.slice(0, MAX_NAME - 1)
  const space = head.lastIndexOf(' ')
  const cut = (space > 0 ? head.slice(0, space) : head).replace(/[\s,;:.\-–—]+$/, '')

  return `${cut}…`
}

/** Plain, calm wording for an API failure, from the engine's error kind or the error text. */
export function describeApiError(kind: string | undefined, text: string): string {
  const said = `${kind ?? ''} ${text}`.toLowerCase()

  if (/rate.?limit|usage limit|429|quota/.test(said)) return REASONS.rateLimit
  if (/overload|529|server_error|busy|5\d\d\b/.test(said)) return REASONS.overloaded
  if (/too long|context|max_output_tokens|prompt is too/.test(said)) return REASONS.tooLong
  if (/auth|login|401|403|oauth|credential|api key|billing|account/.test(said)) return REASONS.auth
  if (/network|econn|connection|socket|fetch failed|timed? ?out|offline|enotfound/.test(said)) return REASONS.network

  return REASONS.unknown
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60

  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`

  return `${s}s`
}

function clampPercent(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0
}

function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

let nextId = 0
function makeId(): string {
  nextId += 1

  return `step-${Date.now().toString(36)}-${nextId}`
}

function newTask(name: string, status: Task['status'] = 'upcoming'): Task {
  return { id: makeId(), name: cleanName(name), status, percent: 0, hasReported: false }
}

/** At most one active step; when none is active and some are left, the first left starts. */
function normalize(tasks: Task[]): Task[] {
  let seenActive = false
  const out = tasks.map(task => {
    if (task.status === 'done') return { ...task, percent: 100 }
    if (task.status !== 'active') return task
    if (seenActive) return { ...task, status: 'upcoming' as const }
    seenActive = true

    return task
  })

  if (!seenActive) {
    const first = out.findIndex(task => task.status === 'upcoming')
    const task = out[first]
    if (task !== undefined) out[first] = { ...task, status: 'active' }
  }

  return out
}

function newJob(now: number, title: string, tasks: Task[], isPlanned: boolean): Checklist {
  return {
    title,
    phase: 'working',
    tasks: normalize(tasks),
    needsYouReason: null,
    stuckReason: null,
    startedAt: now,
    finishedAt: null,
    isCollapsed: false,
    isPlanned,
  }
}

function resume(list: Checklist): Checklist {
  return { ...list, phase: 'working', needsYouReason: null, stuckReason: null, finishedAt: null, isCollapsed: false }
}

function isRunning(list: Checklist | null): boolean {
  return list !== null && (list.phase === 'working' || list.phase === 'needsYou' || list.phase === 'stuck')
}

/** The plan as plan_steps lays it out: the first step starts right away. */
export function applyPlan(list: Checklist | null, steps: readonly unknown[], now: number): Checklist {
  const names = steps.map(cleanName).slice(0, 8)
  const tasks = names.map(name => newTask(name))
  const base = list && isRunning(list) ? resume(list) : newJob(now, list?.title ?? FALLBACK_TITLE, [], true)

  return { ...base, tasks: normalize(tasks), isPlanned: true }
}

/** A progress report: earlier steps are checked off, 100 checks this one off and starts the next. */
export function applyProgress(list: Checklist | null, task: unknown, percentIn: unknown, now: number): Checklist {
  const name = cleanName(task)
  const percent = clampPercent(percentIn)
  const base = list && isRunning(list) ? resume(list) : newJob(now, list?.title ?? FALLBACK_TITLE, [], true)
  const tasks = base.isPlanned ? [...base.tasks] : []
  let at = tasks.findIndex(one => sameName(one.name, name))

  if (at < 0) {
    const active = tasks.findIndex(one => one.status === 'active')
    at = active >= 0 ? active + 1 : tasks.length
    tasks.splice(at, 0, newTask(name))
  }

  const next = tasks.map((one, i): Task => {
    if (i < at) return { ...one, status: 'done', percent: 100 }
    if (i > at) return one.status === 'active' ? { ...one, status: 'upcoming' } : one

    return percent >= 100
      ? { ...one, status: 'done', percent: 100, hasReported: true }
      : { ...one, status: 'active', percent, hasReported: true }
  })

  return { ...base, tasks: normalize(next), isPlanned: true }
}

type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed' }

/** A TodoWrite list replaces the plan; steps keep their reported progress by name. */
export function applyTodos(list: Checklist | null, todos: readonly Todo[], now: number): Checklist {
  const base = list && isRunning(list) ? resume(list) : newJob(now, list?.title ?? FALLBACK_TITLE, [], true)
  const known = base.isPlanned ? base.tasks : []
  const tasks = todos.map((todo): Task => {
    const name = cleanName(todo.content)
    const was = known.find(one => sameName(one.name, name))
    const status = todo.status === 'completed' ? 'done' : todo.status === 'in_progress' ? 'active' : 'upcoming'
    const keep = was && status === 'active' ? { percent: was.percent, hasReported: was.hasReported } : null

    return {
      id: was?.id ?? makeId(),
      name,
      status,
      percent: status === 'done' ? 100 : (keep?.percent ?? 0),
      hasReported: keep?.hasReported ?? false,
    }
  })

  return { ...base, tasks: normalize(tasks), isPlanned: true }
}

function padTo(text: string, width: number): string {
  if (width <= 0) return ''
  if (text.length > width) return width > 1 ? `${text.slice(0, width - 1)}…` : text.slice(0, width)

  return text + ' '.repeat(width - text.length)
}

function meter(task: Task, tick: number): string {
  if (task.status === 'done') return '█'.repeat(METER)
  if (task.status === 'upcoming') return '░'.repeat(METER)
  if (task.hasReported) {
    const filled = Math.round(task.percent / (100 / METER))

    return '█'.repeat(filled) + '░'.repeat(METER - filled)
  }

  const span = METER + 3
  const head = tick % span
  let out = ''
  for (let i = 0; i < METER; i += 1) out += i <= head && i > head - 3 ? '█' : '░'

  return out
}

let ticker: Timer | undefined
let failures = 0
let lastApiError: { kind: string; details: string } | undefined

async function syncTicker($: Engine) {
  const list = await read($, checklistAtom)
  const isEnabled = await read($, enabledAtom)
  const shouldTick = isEnabled && list !== null && (list.phase === 'working' || list.phase === 'needsYou')

  if (shouldTick && ticker === undefined) {
    ticker = $.clock.every(TICK_MS, () => void update($, tickAtom, n => (n ?? 0) + 1))
  } else if (!shouldTick && ticker !== undefined) {
    ticker.cancel()
    ticker = undefined
  }
}

async function mutate($: Engine, fn: (list: Checklist | null, now: number) => Checklist | null) {
  const now = await $.clock.now()
  await update($, checklistAtom, list => fn(list ?? null, now))
  await syncTicker($)
}

async function setEnabled($: Engine, isEnabled: boolean) {
  await update($, enabledAtom, () => isEnabled)
  await $.store.set(STORE_KEY, isEnabled)
  await syncTicker($)
}

async function needsYou($: Engine, reason: string) {
  await mutate($, list => (list && isRunning(list) ? { ...list, phase: 'needsYou', needsYouReason: reason } : list))
}

async function stuck($: Engine, reason: string) {
  await mutate($, list => (list ? { ...list, phase: 'stuck', stuckReason: reason, needsYouReason: null } : list))
}

async function backToWork($: Engine, phases: readonly Phase[]) {
  await mutate($, list => (list && phases.includes(list.phase) ? resume(list) : list))
}

async function finish($: Engine) {
  let doneAt = 0
  await mutate($, (list, now) => {
    if (list === null) return list
    doneAt = list.startedAt

    return { ...list, phase: 'done', finishedAt: now, needsYouReason: null, stuckReason: null }
  })
  $.clock.after(COLLAPSE_MS, () => {
    void update($, checklistAtom, list =>
      list && list.phase === 'done' && list.startedAt === doneAt ? { ...list, isCollapsed: true } : (list ?? null),
    )
  })
}

async function nameJob($: Engine, startedAt: number, prompt: string) {
  try {
    const answer = await $.model.complete({
      model: 'haiku',
      effort: 'low',
      maxTokens: 30,
      timeoutMs: 20000,
      system:
        'Você dá nomes a tarefas num checklist de progresso lido por pessoas não técnicas. Responda só com o nome, em português do Brasil: de 2 a 6 palavras simples, começando com um verbo no infinitivo, sem aspas, sem pontuação no final, sem nomes de arquivos, caminhos, comandos ou código.',
      prompt: `Dê um nome a esta tarefa:\n\n${prompt.slice(0, 2000)}`,
    })
    if (!answer.isAnswered) return

    const words = answer.text.replace(/["'“”‘’]/g, '').trim().split(/\s+/).slice(0, 6).join(' ')
    const title = cleanName(words.replace(/[.!?]+$/, ''))
    await update($, checklistAtom, list => (list && list.startedAt === startedAt ? { ...list, title } : (list ?? null)))
  } catch {
    // The placeholder title stays.
  }
}

export function registerCleanView(on: On): void {
  on('session.start', async ($, e, next) => {
    try {
      const stored = await $.store.get(STORE_KEY)
      await update($, enabledAtom, () => stored !== false)
    } catch {
      // Starts on.
    }

    try {
      await $.tool.register({
        name: 'plan_steps',
        isDeferred: false,
        description:
          'Lay out every step of the job up front, 2 to 8 short plain Brazilian Portuguese names in order, each starting with a verb in the infinitive and under 40 characters (no file names, paths, commands or code). The first step starts right away. Call this first for every request.',
        inputSchema: {
          type: 'object',
          properties: {
            steps: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 },
          },
          required: ['steps'],
        },
      })
      await $.tool.register({
        name: 'report_progress',
        isDeferred: false,
        description:
          'Report progress on the current step, by its plain Brazilian Portuguese name, as real progress happens. Send 100 the moment a step finishes: it is checked off and the next one starts.',
        inputSchema: {
          type: 'object',
          properties: {
            task: { type: 'string' },
            percent: { type: 'number', minimum: 0, maximum: 100 },
          },
          required: ['task', 'percent'],
        },
      })
      await $.command.register({
        name: 'simple',
        description: 'Liga ou desliga o Clean View (sem argumento, alterna)',
        argumentHint: 'ligar|desligar',
      })
    } catch {
      // A host without these leaves the band alone.
    }

    await syncTicker($)

    return next(e)
  })

  on('command.run', { command: 'simple' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const isEnabled =
      ['on', 'ligar', 'ligado'].includes(arg) ? true : ['off', 'desligar', 'desligado'].includes(arg) ? false : !(await read($, enabledAtom))
    await setEnabled($, isEnabled)

    return {
      text: isEnabled
        ? 'Clean View ligado: os detalhes técnicos ficam ocultos.'
        : 'Clean View desligado: tudo aparece de novo.',
    }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await read($, enabledAtom))) return composed

    return {
      sections: [
        ...composed.sections.filter(one => one.id !== 'clean-view:plan'),
        { id: 'clean-view:plan', text: GUIDANCE, scope: 'session' },
      ],
    }
  })

  on('turn.start', async ($, e, next) => {
    const text = e.text.trim()
    const list = await read($, checklistAtom)

    if (text !== '' && !text.startsWith('/')) {
      if (isRunning(list)) {
        await backToWork($, ['needsYou', 'stuck'])
      } else {
        const now = await $.clock.now()
        const placeholders = PLACEHOLDERS.map(name => newTask(name))
        await update($, checklistAtom, () => newJob(now, FALLBACK_TITLE, placeholders, false))
        failures = 0
        lastApiError = undefined
        await syncTicker($)
        $.clock.after(0, () => void nameJob($, now, text))
      }
    }

    return next(e)
  })

  on('tool.call', { tool: PLAN_TOOL }, async ($, e) => {
    const input = e as unknown as { steps?: unknown }
    const steps = Array.isArray(input.steps) ? input.steps : []
    if (steps.length === 0) {
      return { deny: 'Passe para o plan_steps uma lista de 2 a 8 nomes curtos de passos.' }
    }
    await mutate($, (list, now) => applyPlan(list, steps, now))
    const count = Math.min(steps.length, 8)

    return { result: `${count} passos planejados. O primeiro já começou.` }
  })

  on('tool.call', { tool: PROGRESS_TOOL }, async ($, e) => {
    const input = e as unknown as { task?: unknown; percent?: unknown }
    const percent = clampPercent(input.percent)
    await mutate($, (list, now) => applyProgress(list, input.task, percent, now))

    return { result: `Progresso registrado: ${percent}%.` }
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (tool === PLAN_TOOL || tool === PROGRESS_TOOL) return next(e)
    if (e.agentId !== undefined) return next(e)

    const isEnabled = await read($, enabledAtom)
    const list = await read($, checklistAtom)
    if (isEnabled && !ALWAYS_ALLOWED.has(tool) && !(list?.isPlanned ?? false)) {
      return {
        deny: `Clean View: chame ${PLAN_TOOL} primeiro para listar os passos desta tarefa em português simples, depois tente de novo.`,
      }
    }

    if (tool === 'AskUserQuestion') await needsYou($, REASONS.question)

    const ran = await next(e)

    if (ran.deny !== undefined) return ran

    if (ran.isError === true) {
      const said = ran.text ?? String(ran.result ?? '')
      if (/doesn't want to proceed|was rejected|user (denied|rejected|declined)|permission.*denied/i.test(said)) {
        failures = 0
        await stuck($, REASONS.saidNo)
      } else {
        failures += 1
        if (failures >= FAILURES_TO_STUCK) await stuck($, REASONS.failing)
        else await backToWork($, ['needsYou'])
      }

      return ran
    }

    failures = 0
    await backToWork($, ['needsYou', 'stuck'])

    if (tool === 'TodoWrite') {
      const todos = (e as unknown as { todos?: Todo[] }).todos
      if (Array.isArray(todos)) await mutate($, (cur, now) => applyTodos(cur, todos, now))
    } else if (tool === 'TaskCreate') {
      const created = (ran.result as { task?: { id?: string; subject?: string } } | undefined)?.task
      const subject = (e as unknown as { subject?: string }).subject ?? created?.subject ?? ''
      await mutate($, (cur, now) => {
        const base = cur && isRunning(cur) ? cur : newJob(now, cur?.title ?? FALLBACK_TITLE, [], true)
        const tasks = base.isPlanned ? base.tasks : []
        const task = { ...newTask(subject), id: created?.id ?? makeId() }

        return { ...base, isPlanned: true, tasks: normalize([...tasks, task]) }
      })
    } else if (tool === 'TaskUpdate') {
      const input = e as unknown as { taskId?: string; status?: string; subject?: string }
      await mutate($, cur => {
        if (cur === null || !cur.tasks.some(one => one.id === input.taskId)) return cur
        let tasks = cur.tasks
        if (input.status === 'deleted') {
          tasks = tasks.filter(one => one.id !== input.taskId)
        } else {
          tasks = tasks.map((one): Task => {
            if (one.id !== input.taskId) {
              return input.status === 'in_progress' && one.status === 'active' ? { ...one, status: 'upcoming' } : one
            }
            const name = input.subject !== undefined ? cleanName(input.subject) : one.name
            if (input.status === 'completed') return { ...one, name, status: 'done', percent: 100 }
            if (input.status === 'in_progress') return { ...one, name, status: 'active' }
            if (input.status === 'pending') return { ...one, name, status: 'upcoming' }

            return { ...one, name }
          })
        }

        return { ...cur, tasks: normalize(tasks) }
      })
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt' || /permission/i.test(e.message)) {
      await needsYou($, REASONS.permission)
    } else if (e.notification_type === 'elicitation_dialog') {
      await needsYou($, REASONS.question)
    }

    return next(e)
  })

  on('classic.StopFailure', async ($, e, next) => {
    lastApiError = { kind: String(e.error), details: e.error_details ?? '' }
    const list = await read($, checklistAtom)
    if (list?.phase === 'stuck') {
      await stuck($, describeApiError(lastApiError.kind, lastApiError.details))
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    const list = await read($, checklistAtom)
    if (list !== null && isRunning(list)) {
      if (e.reason === 'error') {
        await stuck($, describeApiError(lastApiError?.kind, `${lastApiError?.details ?? ''} ${e.answer}`))
      } else if (e.reason === 'refusal') {
        await stuck($, REASONS.refusal)
      } else if (e.reason === 'aborted') {
        await mutate($, (cur, now) => (cur ? { ...cur, phase: 'stopped', finishedAt: now, needsYouReason: null } : cur))
      } else if (list.isPlanned && list.tasks.some(one => one.status !== 'done')) {
        await needsYou($, REASONS.waiting)
      } else {
        await finish($)
      }
    }
    lastApiError = undefined

    return next(e)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!(await read($, enabledAtom))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!(await read($, enabledAtom))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (!(await read($, enabledAtom))) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    if (!(await read($, enabledAtom))) return next(e)

    return next({ ...e, props: { ...e.props, hint: '' } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    // The band is shared: draw ours on top and let the plugins below (image-view's thumbnails) draw under it.
    const { Box, Text, Button } = $.ui.resolve(e)
    const mine = await (async () => {
      const isEnabled = await read($, enabledAtom)
      const width = Math.max(20, e.props.bodyColumns)

      const toggle = (
        <Button
          key="clean-view-toggle"
          label={isEnabled ? '● Clean View: LIGADO' : '○ Clean View: DESLIGADO'}
          onPress={async () => {
            const turnOn = !(await read($, enabledAtom))
            await setEnabled($, turnOn)
            $.ui.toast(turnOn ? 'Clean View ligado: detalhes técnicos ocultos' : 'Clean View desligado: mostrando tudo')
          }}
        />
      )

      const list = isEnabled ? await read($, checklistAtom) : null
      if (list === null) {
        return {
          rows: 1,
          tree: (
            <Box key="clean-view" flexDirection="row" justifyContent="flex-end" width={width}>
              {toggle}
            </Box>
          ),
        }
      }

      const isLive = list.phase === 'working' || list.phase === 'needsYou'
      const tick = isLive ? await read($, tickAtom) : 0
      const now = isLive || list.phase === 'stuck' ? await $.clock.now() : (list.finishedAt ?? list.startedAt)
      const elapsed = formatDuration(now - list.startedAt)
      const took = formatDuration((list.finishedAt ?? now) - list.startedAt)

      const header = (() => {
        switch (list.phase) {
          case 'needsYou':
            return (
              <Text wrap="truncate-end">
                <Text inverse bold color="warning">
                  {' Precisa de você '}
                </Text>
                <Text> {list.needsYouReason ?? REASONS.waiting}</Text>
              </Text>
            )
          case 'stuck':
            return (
              <Text wrap="truncate-end" color="warning">
                ⚠ Travado: {list.stuckReason ?? REASONS.unknown}
              </Text>
            )
          case 'stopped':
            return (
              <Text wrap="truncate-end">
                <Text color="error">■ Parado</Text>
                <Text dimColor>
                  {' · '}
                  {list.title} · você apertou Esc
                </Text>
              </Text>
            )
          case 'done':
            return (
              <Text wrap="truncate-end">
                <Text color="success" bold>
                  ✓ Tudo pronto
                </Text>
                <Text dimColor>
                  {' · '}
                  {list.title} · levou {took}
                </Text>
              </Text>
            )
          default:
            return (
              <Text wrap="truncate-end">
                <Text bold>{list.title}</Text>
                <Text dimColor> · {elapsed}</Text>
              </Text>
            )
        }
      })()

      const headerRow = (
        <Box key="clean-view-header" flexDirection="row" justifyContent="space-between" width={width}>
          <Box flexShrink={1} flexGrow={1}>
            {header}
          </Box>
          <Box flexShrink={0} marginLeft={1}>
            {toggle}
          </Box>
        </Box>
      )

      if (list.phase === 'done' && list.isCollapsed) {
        return { rows: 1, tree: headerRow }
      }

      const nameWidth = Math.max(6, Math.min(MAX_NAME, width - 2 - 1 - METER - 2 - 11))
      let upcomingSeen = 0
      const rows = list.tasks.map((task, i) => {
        const name = padTo(task.name, nameWidth)
        const bar = meter(task, tick)

        if (task.status === 'done') {
          return (
            <Box key={`row-${i}`} flexDirection="row">
              <Text color="success">✓ </Text>
              <Text dimColor>{name} </Text>
              <Text color="success">{bar}</Text>
              <Text dimColor> Feito</Text>
            </Box>
          )
        }

        if (task.status === 'active') {
          const isPaused = list.phase === 'needsYou'
          const label = task.hasReported ? `${task.percent}%` : 'Trabalhando'

          return (
            <Box key={`row-${i}`} flexDirection="row">
              <Text color={isPaused ? 'warning' : 'claude'}>{isPaused ? '‖ ' : '▶ '}</Text>
              <Text bold>{name} </Text>
              <Text color="claude">{bar}</Text>
              <Text> {label}</Text>
            </Box>
          )
        }

        upcomingSeen += 1

        return (
          <Box key={`row-${i}`} flexDirection="row">
            <Text dimColor>○ </Text>
            <Text dimColor>{name} </Text>
            <Text dimColor>{bar}</Text>
            <Text dimColor> {upcomingSeen === 1 ? 'Próximo' : 'Em seguida'}</Text>
          </Box>
        )
      })

      return {
        rows: 1 + rows.length,
        tree: (
          <Box key="clean-view" flexDirection="column">
            {headerRow}
            {rows}
          </Box>
        ),
      }
    })()
    const below = await next({ ...e, props: { ...e.props, maxRows: Math.max(0, e.props.maxRows - mine.rows) } })

    return (
      <Box flexDirection="column">
        {mine.tree}
        {below}
      </Box>
    )
  })
}
