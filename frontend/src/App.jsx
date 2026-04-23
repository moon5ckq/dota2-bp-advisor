import { useState } from 'react';
import './index.css';
import Navbar from './components/Navbar.jsx';
import TabBar from './components/TabBar.jsx';
import Home from './pages/Home.jsx';
import BPAnalysis from './pages/BPAnalysis.jsx';
import Profile from './pages/Profile.jsx';

function App() {
  const [tab, setTab] = useState('home');

  return (
    <div className="min-h-screen bg-[#0f1118] text-[#e8e6e3]">
      <Navbar />
      {tab === 'home' && <Home />}
      {tab === 'bp' && <BPAnalysis />}
      {tab === 'me' && <Profile />}
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}

export default App;
