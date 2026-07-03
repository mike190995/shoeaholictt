import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridApi, CellValueChangedEvent } from 'ag-grid-community';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import { fetchProducts, batchUpdateProducts, pushProductToWoo, pushFilteredToWoo, api, type Product } from '../api/products';
import { importFromLightspeed } from '../api/lightspeed';
import { ProductCellSchema } from '../lib/validation';

ModuleRegistry.registerModules([AllCommunityModule]);

// ── Smart Filter Definitions ─────────────────────
type FilterType = 'orphaned' | 'enrichment' | 'in_stock' | 'out_of_stock' | 'low_stock' | 'has_photo' | 'no_photo' | 'online' | 'instore';

function isDefaultImage(url?: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return lower.includes('default') || lower.includes('placeholder') || lower.includes('none');
}

function applyFilters(products: Product[], activeFilters: Set<FilterType>): Product[] {
  if (activeFilters.size === 0) return products;

  return products.filter(p => {
    for (const filter of activeFilters) {
      if (filter === 'orphaned' && p.imageUrl) return false;
      if (filter === 'enrichment' && !(isDefaultImage(p.imageUrl) || !p.category || p.price === 0)) return false;
      if (filter === 'in_stock' && p.stock <= 0) return false;
      if (filter === 'out_of_stock' && p.stock > 0) return false;
      if (filter === 'low_stock' && (p.stock <= 0 || p.stock > 2)) return false;
      if (filter === 'has_photo' && isDefaultImage(p.imageUrl)) return false;
      if (filter === 'no_photo' && !isDefaultImage(p.imageUrl)) return false;
      if (filter === 'online' && !(p.tags && p.tags.some(t => t.toLowerCase() === 'online'))) return false;
      if (filter === 'instore' && !(p.tags && p.tags.some(t => t.toLowerCase() === 'instore' || t.toLowerCase() === 'in-store'))) return false;
    }
    return true;
  });
}

// ── Custom Cell Renderers (React) ────────────────
const BadgeRenderer: React.FC<any> = (params) => {
  const value = params.value;
  if (params.colDef.field === 'woocommerceId') {
    const isLinked = !!value;
    return (
      <div className="flex items-center h-full">
        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${
          isLinked 
            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' 
            : 'bg-slate-500/10 text-slate-400 border-white/10'
        }`}>
          {isLinked ? 'Live' : 'Staged'}
        </span>
      </div>
    );
  }
  return null;
};
  
const StatusRenderer: React.FC<any> = (params) => {
  const isPublished = params.value === 'published';
  return (
    <div className="flex items-center h-full">
      <div className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border flex items-center gap-1.5 ${
        isPublished 
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.1)]' 
          : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${isPublished ? 'bg-emerald-400 animate-pulse' : 'bg-amber-500'}`}></span>
        {params.value}
      </div>
    </div>
  );
};

const ImageRenderer: React.FC<any> = (params) => {
  const imageUrl = params.value; // field 'imageUrl'
  const thumbUrl = params.data?.thumbnailUrl;
  
  const isPlaceholder = (u?: string) => !u || u.includes('placeholder') || u.includes('no-image') || u.includes('default-product');
  
  const finalImageUrl = !isPlaceholder(imageUrl) ? imageUrl : (!isPlaceholder(thumbUrl) ? thumbUrl : null);
  
  return (
    <div className="flex items-center justify-center h-full py-1">
      {finalImageUrl ? (
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg blur opacity-0 group-hover:opacity-40 transition duration-300"></div>
          <img 
            src={finalImageUrl} 
            className="relative w-10 h-10 object-cover rounded-lg border border-white/10 shadow-lg transition-transform group-hover:scale-110" 
            alt="" 
          />
        </div>
      ) : (
        <div className="w-10 h-10 bg-slate-800/50 rounded-lg flex items-center justify-center text-[10px] text-slate-500 font-black border border-white/5 uppercase">
          {params.data?.sku?.substring(0, 2) || 'NA'}
        </div>
      )}
    </div>
  );
};

// ── Status Toast ──────────────────────────────────
const Toast: React.FC<{ message: string; type: 'success' | 'error' | 'info' }> = ({ message, type }) => {
  const colors = { 
    success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-emerald-500/10', 
    error: 'bg-rose-500/10 border-rose-500/20 text-rose-400 shadow-rose-500/10', 
    info: 'bg-blue-500/10 border-blue-500/20 text-blue-400 shadow-blue-500/10' 
  };
  return (
    <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl border backdrop-blur-2xl text-xs font-bold shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 ${colors[type]}`}>
      {message}
    </div>
  );
};

// ── Main SpreadsheetView ──────────────────────────
const SpreadsheetView: React.FC = () => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState<Set<FilterType>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dirtyRows, setDirtyRows] = useState<Map<string, Partial<Product>>>(new Map());
  const [committing, setCommitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const gridApiRef = useRef<GridApi | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info', duration = 3000) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), duration);
  };

  const loadProducts = useCallback(async (pageNo: number = 1, query?: string) => {
    setLoading(true);
    try {
      const data = await fetchProducts(pageNo, query);
      setAllProducts(data.products);
      setPage(data.pagination.page || 1);
      setTotalPages(data.pagination.totalPages || 1);
    } catch {
      showToast('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts(page, searchQuery || undefined);
  }, [page, loadProducts]);

  const handleSearch = () => {
    setPage(1);
    loadProducts(1, searchQuery || undefined);
  };

  const filteredProducts = useMemo(() => applyFilters(allProducts, activeFilters), [allProducts, activeFilters]);

  const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    const sku = event.data.sku as string;
    const field = event.colDef.field as string;
    const newValue = event.newValue;

    const fieldSchema = ProductCellSchema.shape[field as keyof typeof ProductCellSchema.shape];
    if (fieldSchema) {
      const result = fieldSchema.safeParse(newValue);
      if (!result.success) {
        event.node.setDataValue(field, event.oldValue);
        showToast(`Invalid ${field}: ${result.error.issues[0]?.message}`, 'error');
        return;
      }
    }

    setDirtyRows(prev => {
      const next = new Map(prev);
      const existing = next.get(sku) || { sku };
      next.set(sku, { ...existing, [field]: newValue });
      return next;
    });
  }, []);

  const handleCommit = async () => {
    if (dirtyRows.size === 0) return;
    setCommitting(true);
    try {
      const updates = Array.from(dirtyRows.values()) as Array<Partial<Product> & { sku: string }>;
      const result = await batchUpdateProducts(updates);
      showToast(result.message, 'success');
      setDirtyRows(new Map());
    } catch {
      showToast('Commit failed.', 'error');
    } finally {
      setCommitting(false);
    }
  };

  const commonActions = {
    pushToWoo: async () => {
      const selected = gridApiRef.current?.getSelectedRows() ?? [];
      if (!selected.length) return;
      showToast(`Pushing ${selected.length} products...`, 'info');
      for (const row of selected) await pushProductToWoo(row.sku).catch(console.error);
      loadProducts(page, searchQuery || undefined);
      showToast('Push complete', 'success');
    },
    pushGroup: async () => {
      const selected = gridApiRef.current?.getSelectedRows() ?? [];
      if (!selected.length) {
        showToast('Select a parent product first', 'info');
        return;
      }
      showToast('Pushing style groups...', 'info');
      for (const row of selected) {
        try {
          await api.pushProductGroupToWoo(row.sku);
        } catch (err: any) {
          console.error(`Group push failed for ${row.sku}:`, err.message);
        }
      }
      loadProducts(page, searchQuery || undefined);
      showToast('Group push sequence finished', 'success');
    },
    sync: async () => {
      showToast('Starting full catalog pull from Lightspeed...', 'info');
      try {
        await importFromLightspeed(undefined, undefined, true);
        showToast('Lightspeed catalog sync started in the background.', 'success');
        setTimeout(() => {
          loadProducts(page, searchQuery || undefined);
        }, 3000);
      } catch (err: any) {
        showToast(`Sync failed: ${err.message}`, 'error');
      }
    },
    pushFiltered: async () => {
      if (activeFilters.size <= 1) return;
      showToast('Starting background push of all filtered products to WooCommerce...', 'info');
      try {
        const result = await pushFilteredToWoo(Array.from(activeFilters), searchQuery || undefined);
        showToast(result.message || 'Background push of filtered products started!', 'success');
      } catch (err: any) {
        showToast(`Push failed: ${err.message}`, 'error');
      }
    }
  };

  const colDefs: ColDef[] = useMemo(() => [
    {
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 50,
      pinned: 'left',
      resizable: false,
    },
    { field: 'sku', headerName: 'SKU', width: 130, pinned: 'left', cellClass: 'font-mono text-[11px] text-slate-500' },
    {
      field: 'name',
      headerName: 'Product Title',
      editable: true,
      flex: 2,
      cellClass: 'font-semibold',
    },
    {
      field: 'woocommerceId',
      headerName: 'Store',
      width: 90,
      cellRenderer: BadgeRenderer,
    },
    { 
      field: 'price', 
      headerName: 'Price', 
      editable: true, 
      width: 100, 
      valueFormatter: p => p.value != null ? `$${Number(p.value).toFixed(2)}` : '',
      cellClass: 'font-bold text-blue-400'
    },
    { field: 'stock', headerName: 'In Stock', editable: true, width: 100, cellClass: 'font-bold' },
    { field: 'category', headerName: 'Category', editable: true, flex: 1, cellClass: 'text-slate-400' },
    { 
      field: 'imageUrl', 
      headerName: 'Preview', 
      width: 80, 
      cellRenderer: ImageRenderer,
      suppressNavigable: true,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      cellRenderer: StatusRenderer,
    },
  ], []);

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden p-6 gap-6">
      {/* Premium Header */}
      <header className="flex justify-between items-end">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-lg shadow-lg shadow-blue-500/20">🚀</span>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">Spreadsheet</h1>
          </div>
          <p className="text-slate-500 font-medium text-sm">Direct staging database control. <span className="text-slate-700">Modified fields highlight in real-time.</span></p>
        </div>

        <div className="flex gap-3">
          <button onClick={commonActions.sync} className="glass-button-secondary">⚡ Sync</button>
          <button onClick={commonActions.pushGroup} className="glass-button-secondary border-blue-500/30 text-blue-300">📦 Push Group</button>
          <button onClick={commonActions.pushToWoo} className="glass-button-primary">Push to Store</button>
          {activeFilters.size > 1 && (
            <button 
              onClick={commonActions.pushFiltered} 
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 border border-indigo-500/30 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-500/20 hover:scale-105 active:scale-95 transition-all"
            >
              📤 Push All (Filtered)
            </button>
          )}
          <div className="w-px h-8 bg-white/10 mx-2" />
          <button
            onClick={handleCommit}
            disabled={dirtyRows.size === 0 || committing}
            className={`px-8 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
              dirtyRows.size > 0 
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 active:scale-95' 
                : 'bg-white/5 text-slate-600 cursor-not-allowed'
            }`}
          >
            {committing ? 'Saving...' : `Commit (${dirtyRows.size})`}
          </button>
        </div>
      </header>

      {/* Tool Tray */}
      <div className="flex gap-4 items-center">
        {/* Search Bar */}
        <div className="flex-1 glass-panel px-4 py-2 rounded-2xl flex items-center gap-3">
            <span className="text-slate-500 text-sm">🔍</span>
            <input
                type="text"
                placeholder="Search staging by SKU or Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="bg-transparent border-none text-white focus:outline-none flex-1 font-bold text-sm placeholder:text-slate-700"
            />
            {searchQuery && (
              <button 
                onClick={() => { setSearchQuery(''); loadProducts(1); }}
                className="text-slate-600 hover:text-slate-400 text-xs font-black p-1"
              >
                ESC
              </button>
            )}
        </div>

        {/* Filter Bar (Two Rows) */}
        <div className="flex flex-col gap-2 p-2 bg-white/[0.03] border border-white/5 rounded-3xl w-fit">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveFilters(new Set())}
              className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeFilters.size === 0 ? 'bg-white/10 text-white shadow-inner' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              All
            </button>
            {(['orphaned', 'enrichment', 'in_stock', 'out_of_stock'] as FilterType[]).map(f => {
              const isActive = activeFilters.has(f);
              return (
                <button
                  key={f}
                  onClick={() => {
                    const next = new Set(activeFilters);
                    if (next.has(f)) next.delete(f);
                    else next.add(f);
                    setActiveFilters(next);
                  }}
                  className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                    isActive 
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 shadow-inner' 
                      : 'text-slate-500 hover:text-slate-300 border-transparent'
                  }`}
                >
                  {f.replace(/_/g, ' ')}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            {(['low_stock', 'has_photo', 'no_photo', 'online', 'instore'] as FilterType[]).map(f => {
              const isActive = activeFilters.has(f);
              return (
                <button
                  key={f}
                  onClick={() => {
                    const next = new Set(activeFilters);
                    if (next.has(f)) next.delete(f);
                    else next.add(f);
                    setActiveFilters(next);
                  }}
                  className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                    isActive 
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 shadow-inner' 
                      : 'text-slate-500 hover:text-slate-300 border-transparent'
                  }`}
                >
                  {f.replace(/_/g, ' ')}
                </button>
              );
            })}
          </div>
        </div>

        <button
            onClick={handleSearch}
            disabled={loading}
            className="glass-button-primary bg-blue-600/80 !px-8 h-12"
        >
            Search
        </button>

        {/* Pagination controls */}
        <div className="flex gap-2 items-center">
            <button 
              disabled={loading || page <= 1} 
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-slate-300 text-xs font-bold disabled:opacity-50 hover:bg-white/10"
            >
              Prev
            </button>
            <span className="text-slate-400 text-xs font-bold w-16 text-center">
              {page} / {totalPages}
            </span>
            <button 
              disabled={loading || page >= totalPages} 
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-slate-300 text-xs font-bold disabled:opacity-50 hover:bg-white/10"
            >
              Next
            </button>
        </div>
      </div>


      {/* Main Grid Card */}
      <main className="flex-1 glass-card overflow-hidden flex flex-col p-4">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Initializing Catalog</p>
          </div>
        ) : (
          <div className="flex-1 ag-theme-alpine-dark ag-theme-glass">
            <AgGridReact
              rowData={filteredProducts}
              columnDefs={colDefs}
              onGridReady={(p) => (gridApiRef.current = p.api)}
              onCellValueChanged={onCellValueChanged}
              rowSelection="multiple"
              getRowId={(p) => p.data.sku}
              stopEditingWhenCellsLoseFocus={true}
              rowHeight={56}
              headerHeight={48}
              animateRows={true}
            />
          </div>
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
};

export default SpreadsheetView;
