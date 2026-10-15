export type TaskStatus = 'done' | 'active' | 'upcoming'

export type Task = {
  id: string
  name: string
  status: TaskStatus
  percent: number
  hasReported: boolean
}

export type Phase = 'working' | 'needsYou' | 'stuck' | 'stopped' | 'done'

export type Checklist = {
  title: string
  phase: Phase
  tasks: Task[]
  needsYouReason: string | null
  stuckReason: string | null
  startedAt: number
  finishedAt: number | null
  isCollapsed: boolean
  /** False while only the placeholder steps show; the plan-first gate reads it. */
  isPlanned: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'clean-view': {
      cleanViewEnabled: boolean
      checklist: Checklist | null
      tick: number
    }
  }
}
