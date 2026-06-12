/**
 * 工具模块入口
 * 导入各工具模块以完成自动注册
 * v6: 新增浏览器自动化工具
 */

import './market'
import './news'
import './strategy'
import './stock'
import './shell'
import './browser'

export { executeTool, hasTool, getToolExecutor } from './registry'
