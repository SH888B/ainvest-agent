import React from 'react'
import { Shield, Info } from 'lucide-react'
import { BROWSER_DOMAIN_WHITELIST } from '@shared/constants'
import { usePreferenceStore } from '../../stores/usePreferenceStore'

/**
 * 浏览器自动化设置
 * 白名单域名展示 + 启用开关
 * v6.0.1: 启用开关持久化到 usePreferenceStore
 * 注：白名单增删暂未实现持久化（编译时常量），v6.1 再实现动态白名单
 */
export const BrowserSettings: React.FC = () => {
  const { browserEnabled, setBrowserEnabled } = usePreferenceStore()

  return (
    <div className="space-y-6">
      {/* 启用开关 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-sm text-text">启用浏览器自动化</span>
        </div>
        <button
          onClick={() => setBrowserEnabled(!browserEnabled)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            browserEnabled ? 'bg-primary' : 'bg-surface-hover'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              browserEnabled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {/* 说明 */}
      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <p className="text-xs text-text-muted">
          浏览器自动化允许 Agent 打开指定网站提取内容。仅白名单中的域名可被访问，确保安全。
        </p>
      </div>

      {/* 白名单域名列表（只读展示） */}
      <div className={browserEnabled ? '' : 'pointer-events-none opacity-50'}>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-medium text-text">允许访问的网站</span>
          <span className="text-xs text-text-muted">({BROWSER_DOMAIN_WHITELIST.length})</span>
        </div>

        <div className="space-y-1.5">
          {BROWSER_DOMAIN_WHITELIST.map((domain) => (
            <div
              key={domain}
              className="flex items-center rounded-lg border border-border bg-surface/60 px-3 py-2"
            >
              <span className="text-sm text-text">{domain}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
