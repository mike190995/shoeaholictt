import React, { useEffect, useState } from 'react';
import { fetchDashboardData, type DashboardData } from '../api/dashboard';

const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData()
      .then(setData)
      .catch(err => console.error('Dashboard fetch error:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="p-8 min-h-screen bg-[#0f172a] text-slate-400 flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center text-center">
        <div className="w-16 h-16 border-4 border-[#10b981] border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(16,185,129,0.3)]"></div>
        <p className="mt-6 text-xl font-bold tracking-tight text-white">Initializing LSWOO Engine</p>
        <p className="text-slate-500 text-sm mt-1">Syncing with Lightspeed Cloud...</p>
      </div>
    </div>
  );

  if (!data) return (
    <div className="p-8 min-h-screen bg-[#0f172a] text-red-400 flex items-center justify-center">
      <div className="bg-rose-500/5 backdrop-blur-xl border border-rose-500/20 p-10 rounded-[2rem] text-center max-w-md shadow-2xl">
        <div className="text-5xl mb-6">📡</div>
        <h2 className="text-2xl font-black mb-3 text-white">Telemetry Link Lost</h2>
        <p className="text-slate-400 leading-relaxed">Could not establish a connection to the middleware API. Please verify the server status and try again.</p>
        <button onClick={() => window.location.reload()} className="mt-8 px-8 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-rose-900/20">
          Reconnect
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-8 min-h-screen bg-[#0f172a] text-slate-200">
      <header className="mb-14 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="relative">
          <div className="absolute -left-4 top-0 w-1 h-12 bg-gradient-to-b from-[#10b981] to-transparent rounded-full shadow-[0_0_15px_#10b981]"></div>
          <h1 className="text-5xl font-black tracking-tighter bg-gradient-to-br from-white via-white to-slate-500 bg-clip-text text-transparent">
            LSWOO <span className="text-[#10b981]">X</span>
          </h1>
          <p className="text-slate-400 mt-1 font-bold tracking-widest uppercase text-[10px] opacity-60">Enterprise Sync Middleware</p>
        </div>
        <div className="flex items-center gap-4 p-2 bg-white/5 backdrop-blur-md rounded-2xl border border-white/5">
          <button className="px-5 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-white rounded-xl transition-all font-bold text-xs uppercase tracking-widest border border-white/5">
            Logs
          </button>
          <button className="px-6 py-2.5 bg-[#10b981] hover:bg-[#059669] text-white rounded-xl transition-all font-bold text-xs uppercase tracking-widest shadow-lg shadow-[#10b981]/20">
            System Sync
          </button>
        </div>
      </header>

      {/* Stats Cluster */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <StatCard label="Catalog Size" value={data.metrics.productCount} growth="+12%" subtext="Synced objects" theme="emerald" />
        <StatCard label="Task Backlog" value={data.metrics.pendingTasks} growth="-5" subtext="In processing" theme="blue" />
        <StatCard label="Error Threshold" value={data.metrics.errorLogs} growth="0" subtext="Last 24 hours" theme="rose" />
        <StatCard label="Uptime" value="99.9%" growth="Live" subtext="System health" theme="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Connection Matrix */}
        <section className="bg-slate-900/50 backdrop-blur-2xl border border-white/5 p-8 rounded-[2.5rem] shadow-2xl">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-xl font-black tracking-tight">Node Matrix</h2>
            <div className="w-8 h-8 bg-[#10b981]/10 rounded-lg flex items-center justify-center">
              <div className="w-2 h-2 bg-[#10b981] rounded-full animate-ping"></div>
            </div>
          </div>
          <div className="space-y-4">
            <NodeItem name="Lightspeed Retail X" type="External API" status={data.metrics.systemHealth.lightspeed} />
            <NodeItem name="WooCommerce Core" type="External API" status={data.metrics.systemHealth.wooCommerce} />
            <NodeItem name="Redis Cache" type="Internal Storage" status={data.metrics.systemHealth.redis} />
            <NodeItem name="GCP Worker" type="Queue Processor" status={data.metrics.systemHealth.cloudTasks} />
          </div>
        </section>

        {/* Intelligence Stream */}
        <section className="lg:col-span-2 bg-slate-900/50 backdrop-blur-2xl border border-white/5 p-8 rounded-[2.5rem] shadow-2xl">
          <h2 className="text-xl font-black tracking-tight mb-10 flex items-center gap-3">
             Intelligence Stream
             <span className="text-[10px] font-bold bg-white/5 px-2 py-1 rounded text-slate-500 uppercase tracking-widest">Real-time</span>
          </h2>
          <div className="overflow-hidden">
            <div className="space-y-1">
              {data.recentActivity.map((log) => (
                <div key={log.id} className="group flex items-center gap-6 p-4 rounded-2xl hover:bg-white/5 transition-all cursor-pointer border border-transparent hover:border-white/5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${log.status === 'success' ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                    {log.status === 'success' ? '✅' : '❌'}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">{log.message}</div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{new Date(log.createdAt).toLocaleString()}</div>
                  </div>
                  <div className={`text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded ${log.status === 'success' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {log.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string | number; growth: string; subtext: string; theme: 'emerald' | 'blue' | 'rose' | 'amber' }> = ({ label, value, growth, subtext, theme }) => {
  const themes = {
    emerald: 'text-emerald-400 shadow-emerald-500/5 bg-emerald-500/5',
    blue: 'text-blue-400 shadow-blue-500/5 bg-blue-500/5',
    rose: 'text-rose-400 shadow-rose-500/5 bg-rose-500/5',
    amber: 'text-amber-400 shadow-amber-500/5 bg-amber-500/5',
  };
  return (
    <div className={`p-8 rounded-[2.5rem] border border-white/5 group hover:border-white/10 transition-all ${themes[theme]}`}>
      <div className="flex justify-between items-start mb-6">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 text-slate-400">{label}</span>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${themes[theme]} border border-current opacity-30`}>{growth}</span>
      </div>
      <div className="text-5xl font-black tracking-tighter mb-2 text-white">{value}</div>
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{subtext}</div>
    </div>
  );
};

const NodeItem: React.FC<{ name: string; type: string; status: string }> = ({ name, type, status }) => {
  const isHealthy = status === 'connected' || status === 'active' || status === 'healthy';
  return (
    <div className="flex items-center justify-between p-5 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/[0.07] transition-all">
      <div>
        <div className="text-sm font-black tracking-tight text-white">{name}</div>
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{type}</div>
      </div>
      <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${isHealthy ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
        {status}
      </div>
    </div>
  );
};

export default Dashboard;
