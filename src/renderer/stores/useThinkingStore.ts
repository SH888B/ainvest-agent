import { create } from 'zustand'

/**
 * Thinking 步骤类型
 */
export type ThinkingStepType =
  | 'intent.recognizing'
  | 'intent.resolved'
  | 'tool.extracting'
  | 'tool.calling'
  | 'tool.result'
  | 'llm.generating'
  | 'llm.streaming'

/**
 * Thinking 步骤状态
 */
export type ThinkingStepStatus = 'pending' | 'running' | 'completed' | 'failed'

/**
 * Thinking 步骤
 */
export interface ThinkingStep {
  type: ThinkingStepType
  status: ThinkingStepStatus
  message: string
  detail?: string
  error?: string
  timestamp: number
}

/**
 * Thinking 状态
 */
interface ThinkingState {
  turns: Record<string, ThinkingStep[]>
  currentTurnId: string | null
  isExpanded: boolean

  startTurn: (turnId: string) => void
  addStep: (step: Omit<ThinkingStep, 'timestamp'>) => void
  completeStep: (stepType: ThinkingStepType) => void
  failStep: (stepType: ThinkingStepType, error: string) => void
  setExpanded: (expanded: boolean) => void
  clearTurn: () => void
}

export const useThinkingStore = create<ThinkingState>((set, get) => ({
  turns: {},
  currentTurnId: null,
  isExpanded: false,

  startTurn: (turnId: string) => {
    set({
      currentTurnId: turnId,
      turns: {
        ...get().turns,
        [turnId]: [],
      },
    })
  },

  addStep: (step) => {
    const { currentTurnId, turns } = get()
    if (!currentTurnId) return
    const steps = turns[currentTurnId] || []
    set({
      turns: {
        ...turns,
        [currentTurnId]: [...steps, { ...step, timestamp: Date.now() }],
      },
    })
  },

  completeStep: (stepType) => {
    const { currentTurnId, turns } = get()
    if (!currentTurnId) return
    const steps = turns[currentTurnId] || []
    const updated = steps.map((s) =>
      s.type === stepType ? { ...s, status: 'completed' as const } : s
    )
    set({
      turns: {
        ...turns,
        [currentTurnId]: updated,
      },
    })
  },

  failStep: (stepType, error) => {
    const { currentTurnId, turns } = get()
    if (!currentTurnId) return
    const steps = turns[currentTurnId] || []
    const updated = steps.map((s) =>
      s.type === stepType
        ? { ...s, status: 'failed' as const, error }
        : s
    )
    set({
      turns: {
        ...turns,
        [currentTurnId]: updated,
      },
    })
  },

  setExpanded: (expanded: boolean) => set({ isExpanded: expanded }),

  clearTurn: () => set({ currentTurnId: null }),
}))
