import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { LLMConfig, BrowserMode } from '@shared/types'
import {
  STORAGE_KEYS,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_DIMENSIONS,
} from '@shared/constants'

/**
 * 用户偏好与大模型配置状态管理
 */

interface PreferenceState {
  llmConfig: LLMConfig
  isConfigValid: boolean
  /** v6.0.1: 新建 Session 时自动归档上一个（默认关闭） */
  autoArchiveOnNewSession: boolean
  /** v6.0.1: 浏览器自动化启用开关（默认开启） */
  browserEnabled: boolean
  /** v6.1: 浏览器操作模式 extract(文本提取) | agent(智能操作)，默认 extract */
  browserMode: BrowserMode

  setLLMConfig: (config: Partial<LLMConfig>) => void
  validateConfig: () => boolean
  setAutoArchiveOnNewSession: (val: boolean) => void
  setBrowserEnabled: (val: boolean) => void
  setBrowserMode: (mode: BrowserMode) => void
}

const defaultConfig: LLMConfig = {
  apiKey: '',
  baseUrl: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  temperature: DEFAULT_TEMPERATURE,
  embeddingModel: DEFAULT_EMBEDDING_MODEL,
  embeddingDimensions: DEFAULT_EMBEDDING_DIMENSIONS,
}

export const usePreferenceStore = create<PreferenceState>()(
  persist(
    (set, get) => ({
      llmConfig: { ...defaultConfig },
      isConfigValid: false,
      autoArchiveOnNewSession: false,
      browserEnabled: true,
      browserMode: 'extract' as BrowserMode,

      setLLMConfig: (config: Partial<LLMConfig>) => {
        set((state) => ({
          llmConfig: { ...state.llmConfig, ...config },
        }))
      },

      validateConfig: () => {
        const { apiKey, baseUrl, model } = get().llmConfig
        const valid = apiKey.length > 0 && baseUrl.length > 0 && model.length > 0
        set({ isConfigValid: valid })
        return valid
      },

      setAutoArchiveOnNewSession: (val: boolean) => {
        set({ autoArchiveOnNewSession: val })
      },

      setBrowserEnabled: (val: boolean) => {
        set({ browserEnabled: val })
      },

      setBrowserMode: (mode: BrowserMode) => {
        set({ browserMode: mode })
      },
    }),
    {
      name: STORAGE_KEYS.LLM_CONFIG,
    }
  )
)
