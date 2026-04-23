/**
 * App.jsx — 应用根组件
 * 
 * 本文件是 Dota2 BP Advisor 前端的顶层组件，负责：
 * 1. 管理当前激活的 Tab 页状态（首页/BP分析/个人中心）
 * 2. 组合顶部导航栏（Navbar）、页面内容和底部标签栏（TabBar）
 * 3. 设置全局背景色和文字颜色（暗色 Dota2 风格）
 */

import { useState } from 'react';
import './index.css';
import Navbar from './components/Navbar.jsx';
import TabBar from './components/TabBar.jsx';
import Home from './pages/Home.jsx';
import BPAnalysis from './pages/BPAnalysis.jsx';
import Profile from './pages/Profile.jsx';

function App() {
  // 当前激活的 Tab 页标识：'home' | 'bp' | 'me'
  const [tab, setTab] = useState('home');

  return (
    <div className="min-h-screen bg-[#0f1118] text-[#e8e6e3]">
      {/* 顶部导航栏（标题 + 同步按钮） */}
      <Navbar />
      {/* 根据当前 Tab 渲染对应页面 */}
      {tab === 'home' && <Home />}
      {tab === 'bp' && <BPAnalysis />}
      {tab === 'me' && <Profile />}
      {/* 底部标签栏 */}
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}

export default App;
