import React, { useEffect, useState } from 'react';

export interface SyncLog {
  id: string;
  direction: string;
  entityType: string;
  entityId: string;
  status: string;
  message: string;
  createdAt: string;
}

export interface LogsResponse {
  logs: SyncLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

async function fetchLogs(page: number = 1, status?: string): Promise<LogsResponse> {
  const params = new URLSearchParams({ page: String(page) });
  if (status) params.set('status', status);

  const response = await fetch(`/admin/api/logs?${params}`);
  if (!response.ok) throw new Error('Failed to fetch logs');
  return response.json();
}

async function retryLog(id: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`/admin/api/logs/${id}/retry`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to retry log');
  return response.json();
}

async function bulkRetry(): Promise<{ success: boolean; count: number }> {
  const response = await fetch('/admin/api/logs/bulk-retry', { method: 'POST' });
  if (!response.ok) throw new Error('Failed to bulk retry');
  return response.json();
}

const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [bulkRetrying, setBulkRetrying] = useState(false);

  const loadLogs = (p: number, s?: string) => {
    setLoading(true);
    fetchLogs(p, s)
      .then(data => {
        setLogs(data.logs);
        setTotalPages(data.pagination.totalPages);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadLogs(page, filter);
  }, [page, filter]);

  const handleRetry = async (id: string) => {
    setRetryingIds(prev => new Set(prev).add(id));
    try {
      await retryLog(id);
      setTimeout(() => loadLogs(page, filter), 500);
    } catch (err) {
      console.error('Retry failed:', err);
    } finally {
      setRetryingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleBulkRetry = async () => {
    setBulkRetrying(true);
    try {
      const result = await bulkRetry();
      console.log(`Bulk retry: ${result.count} tasks re-enqueued`);
      setTimeout(() => loadLogs(page, filter), 500);
    } catch (err) {
      console.error('Bulk retry failed:', err);
    } finally {
      setBulkRetrying(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': case 'completed': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'pending': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'failed': case 'error': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default: return 'bg-white/5 text-slate-400 border-white/10';
    }
  };

  const getDirectionLabel = (direction: string) => {
    switch (direction) {
      case 'woo_to_ls': return '🔵 Woo → LS';
      case 'ls_to_woo': return '🟢 LS → Woo';
      case 'site_to_ls': return '🟣 Site → LS';
      case 'admin_to_all': return '⚡ Admin → All';
      default: return direction;
    }
  };

  return (
    <div className="p-8 min-h-screen bg-[#0f172a] text-slate-200">
      <header className="mb-12 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white">Audit Trail</h1>
          <p className="text-slate-400 mt-2 font-medium">Real-time monitoring of middleware synchronization events.</p>
        </div>
        <button
          onClick={handleBulkRetry}
          disabled={bulkRetrying}
          className="px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-900/20 disabled:opacity-40"
        >
          {bulkRetrying ? 'Retrying...' : '🔄 Retry All Failed'}
        </button>
      </header>

      <div className="bg-slate-900/50 backdrop-blur-2xl border border-white/5 rounded-[2.5rem] shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
          <div className="flex gap-4">
             <button onClick={() => setFilter(undefined)} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${!filter ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20' : 'hover:bg-white/5 text-slate-500 border border-transparent'}`}>All Events</button>
             <button onClick={() => setFilter('failed')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${filter === 'failed' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'hover:bg-white/5 text-slate-500 border border-transparent'}`}>Errors Only</button>
             <button onClick={() => setFilter('pending')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${filter === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'hover:bg-white/5 text-slate-500 border border-transparent'}`}>Pending</button>
          </div>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Live Stream Active</div>
        </div>

        <div className="max-h-[600px] overflow-y-auto">
          {loading ? (
             <div className="p-20 text-center text-slate-500 italic">Streaming logs...</div>
          ) : logs.length === 0 ? (
             <div className="p-20 text-center text-slate-500 italic">No sync events found.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {logs.map((log) => (
                <div key={log.id} className="p-6 hover:bg-white/5 transition-all flex gap-8 items-center group">
                  <div className="w-24 text-[10px] tabular-nums font-bold text-slate-500 mt-1 uppercase tracking-tighter">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                  <div className="w-36 text-xs font-bold text-slate-300">{getDirectionLabel(log.direction)}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-200 leading-relaxed group-hover:text-white transition-colors">
                      {log.message}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${getStatusColor(log.status)}`}>
                      {log.status}
                    </span>
                    {(log.status === 'failed' || log.status === 'error') && (
                      <button
                        onClick={() => handleRetry(log.id)}
                        disabled={retryingIds.has(log.id)}
                        className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-40"
                      >
                        {retryingIds.has(log.id) ? '...' : 'Retry'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="px-8 py-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            Stream Frame: {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-xs font-bold uppercase tracking-widest hover:bg-white/10 disabled:opacity-30 transition-all"
            >
              Previous
            </button>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold uppercase tracking-widest hover:bg-slate-700 disabled:opacity-30 transition-all shadow-xl"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogViewer;
