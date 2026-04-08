import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import ProductMatrix from './components/ProductMatrix';
import LogViewer from './components/LogViewer';
import SpreadsheetView from './components/SpreadsheetView';
import LightspeedImporter from './components/LightspeedImporter';
import DataMapper from './components/DataMapper';

export default function AppRoot() {
  return (
    <div className="AppRoot min-h-screen flex bg-transparent">
      {/* Sidebar Navigation */}
      <nav className="w-64 glass-panel border-r-0 flex flex-col p-6 h-screen sticky top-0 m-4 rounded-[2rem] shadow-2xl">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-indigo-500/20">🛸</div>
          <span className="text-xl font-black tracking-tighter text-white italic">LSWOO</span>
        </div>

        <div className="space-y-1.5 flex-1">
          <NavItem to="/dashboard" icon="📊" label="Dashboard" />
          <NavItem to="/importer" icon="📥" label="Import" />
          <NavItem to="/spreadsheet" icon="🗂️" label="Sheet" />
          <NavItem to="/mapper" icon="🗺️" label="Mapper" />
          <NavItem to="/products" icon="📦" label="Catalog" />
          <NavItem to="/logs" icon="📜" label="Logs" />
        </div>

        <div className="mt-auto pt-6 border-t border-white/5">
          <div className="p-4 bg-black/20 rounded-2xl border border-white/5 backdrop-blur-md">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">System Status</div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
              <span className="text-xs font-bold text-slate-300">X-Series Active</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 min-h-screen overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/importer" element={<LightspeedImporter />} />
          <Route path="/spreadsheet" element={<SpreadsheetView />} />
          <Route path="/mapper" element={<DataMapper />} />
          <Route path="/products" element={<ProductMatrix />} />
          <Route path="/logs" element={<LogViewer />} />
        </Routes>
      </main>
    </div>
  );
}

const NavItem: React.FC<{ to: string; icon: string; label: string }> = ({ to, icon, label }) => (
  <NavLink
    to={to}
    className={({ isActive }) => `
      w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-xs uppercase tracking-widest
      ${isActive 
        ? 'bg-white/10 text-white border border-white/10 shadow-inner' 
        : 'text-slate-500 hover:text-slate-300 border border-transparent'}
    `}
  >
    <span className="text-lg opacity-80">{icon}</span>
    {label}
  </NavLink>
);
