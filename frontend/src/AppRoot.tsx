import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import ProductMatrix from './components/ProductMatrix';
import LogViewer from './components/LogViewer';
import SpreadsheetView from './components/SpreadsheetView';
import LightspeedImporter from './components/LightspeedImporter';
import CategoryMapper from './components/CategoryMapper';

export default function AppRoot() {
  return (
    <div className="AppRoot min-h-screen bg-[#0f172a] flex">
      {/* Sidebar Navigation */}
      <nav className="w-64 bg-slate-900/80 backdrop-blur-3xl border-r border-white/5 flex flex-col p-6 h-screen sticky top-0">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 bg-[#10b981] rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-[#10b981]/20">🚀</div>
          <span className="text-xl font-black tracking-tighter text-white">LSWOO</span>
        </div>

        <div className="space-y-2 flex-1">
          <NavItem to="/dashboard" icon="📊" label="Dashboard" />
          <NavItem to="/importer" icon="📥" label="Import Node" />
          <NavItem to="/spreadsheet" icon="🗂️" label="Spreadsheet" />
          <NavItem to="/mapper" icon="🗺️" label="Category Mapper" />
          <NavItem to="/products" icon="📦" label="Catalog" />
          <NavItem to="/logs" icon="📜" label="Sync Logs" />
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
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/importer" element={<LightspeedImporter />} />
          <Route path="/spreadsheet" element={<SpreadsheetView />} />
          <Route path="/mapper" element={<CategoryMapper />} />
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
      w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-bold text-sm tracking-tight border
      ${isActive 
        ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20' 
        : 'text-slate-400 hover:text-white hover:bg-white/5 border-transparent'}
    `}
  >
    <span className="text-lg">{icon}</span>
    {label}
  </NavLink>
);
