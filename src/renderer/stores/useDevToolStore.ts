import { create } from 'zustand'

/**
 * DevTool 面板状态管理
 * 控制 Agent 日志看板的显隐，不持久化
 */

interface DevToolState {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
}

export const useDevToolStore = create<DevToolState>((set) => ({
  isOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
