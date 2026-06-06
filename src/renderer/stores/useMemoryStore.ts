import { create } from 'zustand'
import { UserMemory } from '@shared/types'
import { FILE_PATHS } from '@shared/constants'
import { logInfo, logError } from '../services/logger/logger'

/**
 * 长期记忆状态管理
 * 管理用户偏好（风险偏好、关注板块、常问问题、摘要）
 * 持久化到 userData/ainvest/memory.json
 */

interface MemoryState {
  memory: UserMemory
  isLoaded: boolean

  loadMemory: () => Promise<void>
  saveMemory: () => Promise<void>
  updateMemory: (update: Partial<UserMemory>) => void
  setRiskPreference: (risk: UserMemory['riskPreference']) => void
  addFocusSector: (sector: string) => void
  removeFocusSector: (sector: string) => void
  addFrequentQuestion: (question: string) => void
  clearMemory: () => void
}

const defaultMemory: UserMemory = {
  riskPreference: undefined,
  focusSectors: [],
  frequentQuestions: [],
  summary: '',
  updatedAt: undefined,
}

const readFile = async (path: string): Promise<string | null> => {
  if (typeof window !== 'undefined' && window.persistence) {
    const result = await window.persistence.readFile(path)
    if (result.success) return result.data
  }
  return null
}

const writeFile = async (path: string, content: string): Promise<boolean> => {
  if (typeof window !== 'undefined' && window.persistence) {
    const result = await window.persistence.writeFile(path, content)
    return result.success
  }
  return false
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  memory: { ...defaultMemory },
  isLoaded: false,

  loadMemory: async () => {
    try {
      const data = await readFile(FILE_PATHS.MEMORY)
      if (data) {
        const parsed = JSON.parse(data) as UserMemory
        set({ memory: parsed, isLoaded: true })
        logInfo('memory', 'memory.loaded', { memory: parsed })
      } else {
        set({ memory: { ...defaultMemory }, isLoaded: true })
        logInfo('memory', 'memory.empty', {})
      }
    } catch (err) {
      logError('memory', 'memory.loadError', { error: String(err) })
      set({ memory: { ...defaultMemory }, isLoaded: true })
    }
  },

  saveMemory: async () => {
    try {
      const { memory } = get()
      const toSave: UserMemory = {
        ...memory,
        updatedAt: new Date().toISOString(),
      }
      await writeFile(FILE_PATHS.MEMORY, JSON.stringify(toSave, null, 2))
      set({ memory: toSave })
      logInfo('memory', 'memory.saved', { memory: toSave })
    } catch (err) {
      logError('memory', 'memory.saveError', { error: String(err) })
    }
  },

  updateMemory: (update: Partial<UserMemory>) => {
    set((state) => ({
      memory: { ...state.memory, ...update },
    }))
  },

  setRiskPreference: (risk) => {
    set((state) => ({
      memory: { ...state.memory, riskPreference: risk },
    }))
  },

  addFocusSector: (sector: string) => {
    set((state) => {
      const sectors = state.memory.focusSectors || []
      if (sectors.includes(sector)) return state
      return {
        memory: { ...state.memory, focusSectors: [...sectors, sector] },
      }
    })
  },

  removeFocusSector: (sector: string) => {
    set((state) => ({
      memory: {
        ...state.memory,
        focusSectors: (state.memory.focusSectors || []).filter((s) => s !== sector),
      },
    }))
  },

  addFrequentQuestion: (question: string) => {
    set((state) => {
      const questions = state.memory.frequentQuestions || []
      if (questions.includes(question)) return state
      // 保留最近 20 个
      const updated = [...questions, question]
      if (updated.length > 20) updated.shift()
      return {
        memory: { ...state.memory, frequentQuestions: updated },
      }
    })
  },

  clearMemory: () => {
    set({ memory: { ...defaultMemory } })
  },
}))
