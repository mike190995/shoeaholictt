import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import ProductMatrix from './components/ProductMatrix';
import LogViewer from './components/LogViewer';
import SpreadsheetView from './components/SpreadsheetView';
import LightspeedImporter from './components/LightspeedImporter';

type View = 'dashboard' | 'importer' | 'spreadsheet' | 'products' | 'logs';

export default function AppRoot() {
  const [currentView, setCurrentView] = useState<View>('dashboard');

  return (
    <div className="AppRoot min-h-screen bg-[#0f172a] flex">
      {/* Sidebar Navigation */}
      <nav className="w-64 bg-slate-900/80 backdrop-blur-3xl border-r border-white/5 flex flex-col p-6 h-screen sticky top-0">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 bg-[#10b981] rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-[#10b981]/20">🚀</div>
          <span className="text-xl font-black tracking-tighter text-white">LSWOO</span>
        </div>

        <div className="space-y-2 flex-1">
          <NavItem active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} icon="📊" label="Dashboard" />
          <NavItem active={currentView === 'importer'} onClick={() => setCurrentView('importer')} icon="📥" label="Import Node" />
          <NavItem active={currentView === 'spreadsheet'} onClick={() => setCurrentView('spreadsheet')} icon="🗂️" label="Spreadsheet" />
          <NavItem active={currentView === 'products'} onClick={() => setCurrentView('products')} icon="📦" label="Catalog" />
          <NavItem active={currentView === 'logs'} onClick={() => setCurrentView('logs')} icon="📜" label="Sync Logs" />
        </div>

        <div className="mt-auto pt-6 border-t border-white/5">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Connected Node</div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-bold text-slate-200">X-Series Staging</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 min-h-screen overflow-y-auto">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'importer' && <LightspeedImporter />}
        {currentView === 'spreadsheet' && <SpreadsheetView />}
        {currentView === 'products' && <ProductMatrix />}
        {currentView === 'logs' && <LogViewer />}
      </main>
    </div>
  );
}

const NavItem: React.FC<{ active: boolean; onClick: () => void; icon: string; label: string }> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-bold text-sm tracking-tight ${active ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20' : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'}`}
  >
    <span className="text-lg">{icon}</span>
    {label}
  </button>
);
