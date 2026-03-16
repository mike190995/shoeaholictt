import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridApi, CellValueChangedEvent, GridReadyEvent } from 'ag-grid-community';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import { fetchProducts, batchUpdateProducts, forceSyncProduct, type Product } from '../api/products';
import { ProductCellSchema } from '../lib/validation';

ModuleRegistry.registerModules([AllCommunityModule]);

// ── Smart Filter Definitions ─────────────────────
type FilterType = 'all' | 'orphaned' | 'enrichment' | 'low_stock';

function applyFilter(products: Product[], filter: FilterType): Product[] {
  switch (filter) {
    case 'orphaned':
      return products.filter(p => !p.imageUrl);
    case 'enrichment':
      return products.filter(p => !p.imageUrl || !p.category || p.price === 0);
    case 'low_stock':
      return products.filter(p => p.stock <= 2);
    default:
      return products;
  }
}

// ── Bulk Normalization Tools ──────────────────────
function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>|&nbsp;|&amp;|&lt;|&gt;|&quot;/gi, ' ').replace(/\s+/g, ' ').trim();
}

// ── Status Toast ──────────────────────────────────
const Toast: React.FC<{ message: string; type: 'success' | 'error' | 'info' }> = ({ message, type }) => {
  const colors = { success: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300', error: 'bg-rose-500/20 border-rose-500/40 text-rose-300', info: 'bg-blue-500/20 border-blue-500/40 text-blue-300' };
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-6 py-4 rounded-2xl border backdrop-blur-xl text-sm font-bold shadow-2xl animate-pulse ${colors[type]}`}>
      {message}
    </div>
  );
};

// ── Main SpreadsheetView ──────────────────────────
const SpreadsheetView: React.FC = () => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [dirtyRows, setDirtyRows] = useState<Map<string, Partial<Product>>>(new Map());
  const [committing, setCommitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const gridApiRef = useRef<GridApi | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info', duration = 3000) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), duration);
  };

  // Load all products at once for the grid (higher limit)
  useEffect(() => {
    setLoading(true);
    fetchProducts(1, undefined)
      .then(data => setAllProducts(data.products))
      .catch(() => showToast('Failed to load products', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const filteredProducts = useMemo(() => applyFilter(allProducts, filter), [allProducts, filter]);

  const onGridReady = (params: GridReadyEvent) => {
    gridApiRef.current = params.api;
  };

  // Track which rows changed so we can diff before committing
  const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    const sku = event.data.sku as string;
    const field = event.colDef.field as string;
    const newValue = event.newValue;

    // Validate the cell value with Zod
    const fieldSchema = ProductCellSchema.shape[field as keyof typeof ProductCellSchema.shape];
    if (fieldSchema) {
      const result = fieldSchema.safeParse(newValue);
      if (!result.success) {
        // Revert the cell visually
        event.node.setDataValue(field, event.oldValue);
        showToast(`Invalid value for ${field}: ${result.error.issues[0]?.message}`, 'error');
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
    if (dirtyRows.size === 0) {
      showToast('No changes to commit.', 'info');
      return;
    }
    setCommitting(true);
    try {
      const updates = Array.from(dirtyRows.values()) as Array<Partial<Product> & { sku: string }>;
      const result = await batchUpdateProducts(updates);
      showToast(result.message, 'success');
      setDirtyRows(new Map());
    } catch {
      showToast('Commit failed. Please try again.', 'error');
    } finally {
      setCommitting(false);
    }
  };

  // Bulk normalize selected rows
  const handleTitleCase = () => {
    const selected = gridApiRef.current?.getSelectedRows() ?? [];
    if (!selected.length) { showToast('Select rows first.', 'info'); return; }
    selected.forEach(row => {
      const newTitle = toTitleCase(row.name);
      gridApiRef.current?.getRowNode(row.sku)?.setDataValue('name', newTitle);
      setDirtyRows(prev => {
        const next = new Map(prev);
        next.set(row.sku, { ...(next.get(row.sku) || { sku: row.sku }), title: newTitle });
        return next;
      });
    });
    showToast(`Title Caser applied to ${selected.length} rows.`, 'success');
  };

  const handleStripHtml = () => {
    const selected = gridApiRef.current?.getSelectedRows() ?? [];
    if (!selected.length) { showToast('Select rows first.', 'info'); return; }
    selected.forEach(row => {
      if (row.description) {
        const clean = stripHtml(row.description);
        gridApiRef.current?.getRowNode(row.sku)?.setDataValue('description', clean);
        setDirtyRows(prev => {
          const next = new Map(prev);
          next.set(row.sku, { ...(next.get(row.sku) || { sku: row.sku }), description: clean });
          return next;
        });
      }
    });
    showToast(`HTML stripped from ${selected.length} rows.`, 'success');
  };

  const handleForceSyncSelected = async () => {
    const selected = gridApiRef.current?.getSelectedRows() ?? [];
    if (!selected.length) { showToast('Select rows first.', 'info'); return; }
    showToast(`Syncing ${selected.length} products...`, 'info', 1500);
    await Promise.allSettled(selected.map(r => forceSyncProduct(r.sku)));
    showToast(`Sync enqueued for ${selected.length} products.`, 'success');
  };

  const colDefs: ColDef[] = useMemo(() => [
    {
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 52,
      pinned: 'left' as const,
      lockPosition: true,
      suppressHeaderMenuButton: true,
      resizable: false,
    },
    {
      field: 'name',
      headerName: 'Title',
      editable: true,
      flex: 2,
      cellStyle: (params) => {
        if (dirtyRows.has(params.data?.sku) && dirtyRows.get(params.data?.sku)?.title !== undefined) {
          return { borderLeft: '2px solid #10b981', background: 'rgba(16,185,129,0.05)' };
        }
        return null;
      },
    },
    { field: 'sku', headerName: 'SKU', editable: false, width: 140, pinned: 'left' as const },
    { field: 'price', headerName: 'Price', editable: true, width: 110, valueFormatter: p => p.value != null ? `$${Number(p.value).toFixed(2)}` : '' },
    { field: 'stock', headerName: 'Stock', editable: true, width: 90 },
    { field: 'category', headerName: 'Category', editable: true, flex: 1 },
    { field: 'brand', headerName: 'Brand', editable: true, flex: 1 },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      cellRenderer: (params: any) => {
        const isPublished = params.value === 'published';
        return `<span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;${isPublished ? 'background:rgba(16,185,129,.1);color:#34d399;border:1px solid rgba(16,185,129,.3)' : 'background:rgba(245,158,11,.1);color:#fbbf24;border:1px solid rgba(245,158,11,.3)'}">${params.value}</span>`;
      },
    },
    {
      field: 'imageUrl',
      headerName: 'Image',
      width: 80,
      cellRenderer: (params: any) => params.value
        ? `<img src="${params.value}" style="width:32px;height:32px;border-radius:6px;object-fit:cover;border:1px solid rgba(255,255,255,.1)" />`
        : `<span style="color:#475569;font-size:10px;">None</span>`,
    },
  ], [dirtyRows]);

  return (
    <div className="p-8 min-h-screen bg-[#0f172a] text-slate-200 flex flex-col">
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white">Spreadsheet Mode</h1>
          <p className="text-slate-400 mt-1 font-medium">Click any cell to edit. Dirty rows are highlighted. Commit all changes with one click.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Bulk Tools */}
          <div className="flex gap-2 items-center bg-white/5 rounded-2xl p-2 border border-white/5">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Bulk:</span>
            <button onClick={handleTitleCase} className="px-3 py-1.5 hover:bg-white/10 rounded-xl text-xs font-bold text-slate-300 transition-all" title="Apply Title Case to selected rows">Aa Title</button>
            <button onClick={handleStripHtml} className="px-3 py-1.5 hover:bg-white/10 rounded-xl text-xs font-bold text-slate-300 transition-all" title="Strip HTML from description">{'</>'}Strip</button>
            <button onClick={handleForceSyncSelected} className="px-3 py-1.5 hover:bg-[#10b981]/10 rounded-xl text-xs font-bold text-[#10b981] transition-all" title="Force sync selected to all channels">⚡ Sync</button>
          </div>

          {/* Commit */}
          <button
            onClick={handleCommit}
            disabled={committing || dirtyRows.size === 0}
            className={`px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all shadow-lg disabled:opacity-30 disabled:cursor-not-allowed ${dirtyRows.size > 0 ? 'bg-[#10b981] hover:bg-[#059669] text-white shadow-[#10b981]/20' : 'bg-white/5 text-slate-500'}`}
          >
            {committing ? 'Committing...' : `Commit Changes${dirtyRows.size > 0 ? ` (${dirtyRows.size})` : ''}`}
          </button>
        </div>
      </header>

      {/* Smart Triage Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Filter:</span>
        {([
          { key: 'all', label: 'All Products', icon: '📦' },
          { key: 'orphaned', label: 'Missing Image', icon: '🖼️' },
          { key: 'enrichment', label: 'Needs Enrichment', icon: '⚠️' },
          { key: 'low_stock', label: 'Low Stock (≤2)', icon: '⚡' },
        ] as { key: FilterType; label: string; icon: string }[]).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${
              filter === f.key
                ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/30'
                : 'bg-white/5 text-slate-400 border-transparent hover:border-white/10 hover:text-white'
            }`}
          >
            <span>{f.icon}</span>{f.label}
            {filter === f.key && filteredProducts.length !== allProducts.length && (
              <span className="ml-1 bg-[#10b981] text-white rounded-full px-1.5 py-0.5 text-[9px]">{filteredProducts.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* AG Grid */}
      <div
        className="flex-1 rounded-3xl overflow-hidden border border-white/5 shadow-2xl"
        style={{ minHeight: '540px', height: 'calc(100vh - 340px)' }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full bg-slate-900/50">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-[#10b981] border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(16,185,129,0.3)]"></div>
              <p className="text-slate-400 font-bold text-sm">Loading catalog...</p>
            </div>
          </div>
        ) : (
          <AgGridReact
            rowData={filteredProducts}
            columnDefs={colDefs}
            onGridReady={onGridReady}
            onCellValueChanged={onCellValueChanged}
            rowSelection="multiple"
            getRowId={(params) => params.data.sku}
            stopEditingWhenCellsLoseFocus={true}
            theme="legacy"
            domLayout="normal"
          />
        )}
      </div>

      {/* Toast Notifications */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
};

export default SpreadsheetView;
