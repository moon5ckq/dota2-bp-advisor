/**
 * App.jsx — 应用根组件
 * 
 * 本文件是 Dota2 BP Advisor 前端的顶层组件，负责：
 * 1. 管理当前激活的 Tab 页状态（首页/BP分析/个人中心）
 * 2. 组合顶部导航栏（Navbar）、页面内容和底部标签栏（TabBar）
 * 3. 设置全局背景色和文字颜色（暗色 Dota2 风格）
 */

import { useState, useEffect } from 'react';
import './index.css';
import Navbar from './components/Navbar.jsx';
import TabBar from './components/TabBar.jsx';
import Home from './pages/Home.jsx';
import BPAnalysis from './pages/BPAnalysis.jsx';
import Profile from './pages/Profile.jsx';

function App() {
  // 从 URL hash 恢复 tab 状态，刷新不丢失
  const validTabs = ['home', 'bp', 'me'];
  const hashTab = window.location.hash.replace('#', '');
  const [tab, setTab] = useState(validTabs.includes(hashTab) ? hashTab : 'home');

  // tab 变化时同步到 URL hash
  useEffect(() => {
    window.location.hash = tab;
  }, [tab]);

  return (
    <div className="min-h-screen bg-[#0f1118] text-[#e8e6e3] flex justify-center">
      <div className="w-full app-container">
        {/* 顶部导航栏（标题 + 同步按钮） */}
        <Navbar />
        {/* 根据当前 Tab 渲染对应页面 */}
        {tab === 'home' && <Home />}
        {tab === 'bp' && <BPAnalysis />}
        {tab === 'me' && <Profile />}
        {/* 底部标签栏 */}
        <TabBar active={tab} onChange={setTab} />
      </div>
    </div>
  );
}

export default App;
