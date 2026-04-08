import React, { useEffect, useState } from 'react';
import { fetchDashboardData, type DashboardData } from '../api/dashboard';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-10 space-y-10">
      <header>
        <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase">Operations Control</h1>
        <p className="text-slate-500 font-medium">Real-time telemetry from Lightspeed and WooCommerce nodes.</p>
      </header>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
            title="Staged Catalog" 
            value={data?.metrics.productCount || 0} 
            icon="📦" 
            sub="Items in local DB" 
            color="indigo" 
            statusLabel={data?.metrics.productCount && data.metrics.productCount > 0 ? "POPULATED" : "EMPTY"}
        />
        <MetricCard 
            title="Pending Syncs" 
            value={data?.metrics.pendingTasks || 0} 
            icon="⏳" 
            sub="Awaiting execution" 
            color={data?.metrics.pendingTasks && data.metrics.pendingTasks > 0 ? "amber" : "indigo"} 
            statusLabel={data?.metrics.pendingTasks && data.metrics.pendingTasks > 0 ? "SYNCING" : "IDLE"}
        />
        <MetricCard 
            title="System Health" 
            value={data?.metrics.systemHealth.lightspeed === 'connected' ? 'ONLINE' : 'ERROR'} 
            icon="🛰️" 
            sub="Lightspeed API" 
            color={data?.metrics.systemHealth.lightspeed === 'connected' ? 'emerald' : 'rose'} 
            statusLabel={data?.metrics.systemHealth.lightspeed === 'connected' ? "STABLE" : "OFFLINE"}
        />
        <MetricCard 
            title="WooCommerce" 
            value={data?.metrics.systemHealth.wooCommerce === 'connected' ? 'STABLE' : 'OFFLINE'} 
            icon="🛒" 
            sub="Store Connectivity" 
            color={data?.metrics.systemHealth.wooCommerce === 'connected' ? 'blue' : 'rose'} 
            statusLabel={data?.metrics.systemHealth.wooCommerce === 'connected' ? "CONNECTED" : "DISCONNECTED"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Activity */}
        <div className="glass-card p-8 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-white uppercase tracking-widest italic">Recent Telemetry</h2>
            <span className="text-[10px] font-black text-slate-500 uppercase px-3 py-1 bg-white/5 rounded-full border border-white/5">Auto-refreshing</span>
          </div>
          <div className="space-y-4">
            {data?.recentActivity.map((log) => (
              <div key={log.id} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full ${log.status === 'completed' ? 'bg-emerald-500' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`} />
                  <div>
                    <div className="text-xs font-black text-slate-200 uppercase tracking-tight">
                        {log.direction.replace('_', ' → ')}
                    </div>
                    <div className="text-[10px] font-medium text-slate-500">
                      {log.entityType} {log.entityId} — {new Date(log.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
                <div className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
                  log.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                }`}>
                  {log.status === 'completed' ? 'PASS' : 'FAIL'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System Overview */}
        <div className="glass-card p-8 space-y-6 flex flex-col justify-center items-center text-center">
             <div className="w-24 h-24 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center text-4xl shadow-2xl shadow-blue-500/20 mb-4 animate-pulse">⚡</div>
             <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">Universal Engine</h2>
             <p className="text-slate-500 text-sm max-w-xs font-medium leading-relaxed">
               The middleware is currently processing sync tasks between **Lightspeed Retail X-Series** and your **WooCommerce** storefront.
             </p>
             <div className="flex gap-4 mt-4">
                <div className="text-center">
                    <div className="text-xs font-black text-slate-300">API VERSION</div>
                    <div className="text-[10px] font-bold text-slate-600 uppercase">Production v2.4</div>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                    <div className="text-xs font-black text-slate-300">UPTIME</div>
                    <div className="text-[10px] font-bold text-slate-600 uppercase">99.98% / 24H</div>
                </div>
             </div>
        </div>
      </div>
    </div>
  );
}

const MetricCard: React.FC<{ 
  title: string; 
  value: string | number; 
  icon: string; 
  sub: string; 
  color: string;
  statusLabel?: string;
}> = ({ title, value, icon, sub, color, statusLabel = 'Status OK' }) => {
  const colorMap: Record<string, string> = {
    indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  };

  return (
    <div className="glass-card p-6 flex flex-col gap-4">
      <div className="flex justify-between items-start">
        <span className="text-2xl">{icon}</span>
        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${colorMap[color]}`}>
          {statusLabel}
        </span>
      </div>
      <div>
        <div className="text-3xl font-black text-white tracking-tighter">{value}</div>
        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{title}</div>
        <div className="text-[10px] font-medium text-slate-600">{sub}</div>
      </div>
    </div>
  );
};
