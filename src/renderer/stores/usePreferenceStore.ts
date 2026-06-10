import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { LLMConfig } from '@shared/types'
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

  setLLMConfig: (config: Partial<LLMConfig>) => void
  validateConfig: () => boolean
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
    }),
    {
      name: STORAGE_KEYS.LLM_CONFIG,
    }
  )
)
