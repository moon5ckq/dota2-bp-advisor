/**
 * main.jsx — 前端入口文件
 * 
 * React 应用的启动入口，负责：
 * 1. 将根组件 App 挂载到 HTML 中的 #root 节点
 * 2. 使用 StrictMode 包裹以启用开发环境的额外检查
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// 将 App 组件渲染到页面中 id 为 'root' 的 DOM 节点
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
