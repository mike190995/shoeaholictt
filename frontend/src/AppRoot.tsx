import React from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import ProductMatrix from './components/ProductMatrix';
import LogViewer from './components/LogViewer';
import SpreadsheetView from './components/SpreadsheetView';
import LightspeedImporter from './components/LightspeedImporter';
import DataMapper from './components/DataMapper';

export default function AppRoot() {
  return (
    <div className="AppRoot min-h-screen flex" style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-72 shrink-0 flex flex-col h-screen sticky top-0 border-r border-white/5"
             style={{ background: 'rgba(10,10,11,0.6)', backdropFilter: 'blur(24px)' }}>

        {/* Logo */}
        <a href="/admin" className="h-20 flex items-center px-10 border-b border-white/5 shrink-0 no-underline">
          <div className="flex items-center gap-3">
            <div style={{ boxShadow: '0 0 20px rgba(59,130,246,0.3)' }}
                 className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center font-black text-xs animate-pulse">⚡</div>
            <span className="text-xl font-black italic tracking-tighter uppercase text-white">
              LSWOO <span className="text-blue-500 font-medium">Core</span>
            </span>
          </div>
        </a>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto pt-8 px-6 space-y-1" style={{ scrollbarWidth: 'none' }}>
          <SectionLabel>Mission Control</SectionLabel>

          {/* EJS admin pages — full page navigation */}
          <NavHardLink href="/admin" icon={<HomeIcon />} label="Health Monitor" />
          <NavHardLink href="/admin/import" icon={<DownloadIcon />} label="Import Node" />

          <SectionLabel className="pt-6">Operations</SectionLabel>
          <SpaNavItem to="/spreadsheet" icon={<GridIcon />} label="Spreadsheet" />
          <SpaNavItem to="/mapper" icon={<MapIcon />} label="Category Mapper" />

          <SectionLabel className="pt-6">Catalog</SectionLabel>
          <SpaNavItem to="/products" icon={<BoxIcon />} label="Product Catalog" />
          <NavHardLink href="/admin/sync" icon={<SyncIcon />} label="Manual Override" />
          <NavHardLink href="/admin/logs" icon={<LogIcon />} label="Audit Stream" />
        </nav>

        {/* Footer */}
        <div className="p-8 border-t border-white/5 shrink-0">
          <div className="flex items-center p-4 rounded-2xl border border-white/8"
               style={{ background: 'rgba(255,255,255,0.015)', backdropFilter: 'blur(16px)' }}>
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-xs font-black shrink-0 shadow-lg">⚡</div>
            <div className="ml-4">
              <p className="text-[10px] font-black text-white uppercase tracking-wider">Ops Admin</p>
              <p className="text-[9px] text-blue-500 font-bold uppercase tracking-widest">Connection Live</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/spreadsheet" replace />} />
          <Route path="/dashboard" element={<Navigate to="/spreadsheet" replace />} />
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

// === Sub-components ===

const SectionLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={`px-4 text-[9px] font-black uppercase tracking-[0.3em] text-slate-600 mb-4 ${className || 'pt-2'}`}>
    {children}
  </p>
);

/** SPA route — uses React Router NavLink */
const SpaNavItem: React.FC<{ to: string; icon: React.ReactNode; label: string }> = ({ to, icon, label }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `group flex items-center px-5 py-3.5 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all duration-300 ${
        isActive
          ? 'text-white border-l-2 border-blue-500'
          : 'text-slate-500 hover:text-white hover:bg-white/5'
      }`
    }
    style={({ isActive }) => isActive ? { background: 'linear-gradient(90deg, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0) 100%)' } : {}}
  >
    <span className="mr-4 h-4 w-4 shrink-0 transition-colors group-hover:[&>svg]:text-blue-400">{icon}</span>
    {label}
  </NavLink>
);

/** EJS page — uses full page navigation via <a href> */
const NavHardLink: React.FC<{ href: string; icon: React.ReactNode; label: string }> = ({ href, icon, label }) => {
  const loc = useLocation();
  const isActive = loc.pathname === href || (href === '/admin' && loc.pathname === '/');
  return (
    <a
      href={href}
      className={`group flex items-center px-5 py-3.5 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all duration-300 ${
        isActive ? 'text-white border-l-2 border-blue-500' : 'text-slate-500 hover:text-white hover:bg-white/5'
      }`}
      style={isActive ? { background: 'linear-gradient(90deg, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0) 100%)' } : {}}
    >
      <span className="mr-4 h-4 w-4 shrink-0 transition-colors">{icon}</span>
      {label}
    </a>
  );
};

// === SVG Icons ===
const HomeIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);
const DownloadIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);
const GridIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M6 3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3z" />
  </svg>
);
const MapIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
  </svg>
);
const BoxIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);
const SyncIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);
const LogIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
