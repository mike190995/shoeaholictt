import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { searchLightspeed, importFromLightspeed, fetchBrands, fetchTypes } from '../api/lightspeed';
import type { Product } from '../api/products';

// ── Custom React Cell Renderers ────────────────
const StockRenderer: React.FC<any> = (params) => {
  const stock = params.value || 0;
  return (
    <div className="flex items-center h-full">
      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black tracking-wider border ${
        stock > 0 
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
      }`}>
        {stock} UNIT{stock !== 1 ? 'S' : ''}
      </span>
    </div>
  );
};

export default function LightspeedImporter() {
  const [rowData, setRowData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [gridApi, setGridApi] = useState<any>(null);

  // Filters
  const [brands, setBrands] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [filterBrandId, setFilterBrandId] = useState('');
  const [filterTypeId, setFilterTypeId] = useState('');
  const [filterActive, setFilterActive] = useState('1'); // Default to Active
  const [filterChannel, setFilterChannel] = useState(''); // Default to All

  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    handleSearch('', 0);
    fetchBrands().then(data => setBrands(data.brands)).catch(console.error);
    fetchTypes().then(data => setTypes(data.types)).catch(console.error);
  }, []);

  const handleSearch = async (query: string, currentOffset: number = 0) => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await searchLightspeed({ 
        search: query, 
        brandId: filterBrandId || undefined, 
        typeId: filterTypeId || undefined,
        active: filterActive || undefined,
        channel: filterChannel || undefined,
        offset: currentOffset
      }, limit);
      setRowData(data.products || []);
      setOffset(currentOffset);
      if (data.products?.length === 0 && query) {
        setMessage({ type: 'error', text: `No products found matching "${query}". Try searching by Name if SKU doesn't work.` });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.details || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleImportSelected = async () => {
    if (selectedSkus.length === 0) return;
    setImporting(true);
    setMessage(null);
    try {
      const res = await importFromLightspeed(selectedSkus);
      if (res.success) {
        setMessage({ type: 'success', text: `Successfully pulled ${res.imported} products into staging.` });
        if (gridApi) gridApi.deselectAll();
      } else {
        setMessage({ type: 'error', text: 'Import failed. Check logs for details.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setImporting(false);
    }
  };

  const handleImportAll = async () => {
    if (!window.confirm('This will trigger a background synchronization of the entire Lightspeed catalog. Continue?')) return;
    setImporting(true);
    setMessage(null);
    try {
      const res = await importFromLightspeed(undefined, undefined, true);
      if (res.success) {
        setMessage({ type: 'success', text: 'Full catalog import initiated successfully in the background. Check the Dashboard for progress.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setImporting(false);
    }
  };

  const onSelectionChanged = useCallback(() => {
    if (gridApi) {
      const selectedNodes = gridApi.getSelectedNodes();
      const skus = selectedNodes.map((node: any) => node.data.sku);
      setSelectedSkus(skus);
    }
  }, [gridApi]);

  const columnDefs = useMemo<ColDef<Product>[]>(() => [
    {
      headerName: '',
      field: 'imageUrl',
      width: 70,
      cellRenderer: (params: any) => {
        const url = params.data?.thumbnailUrl || params.value;
        const hasImage = url && !url.includes('placeholder') && !url.includes('no-image');
        
        return hasImage ? (
          <div className="flex items-center justify-center h-full">
              <img 
                  src={url} 
                  className="w-10 h-10 object-cover rounded-lg border border-white/10 shadow-sm" 
                  alt=""
                  onError={(e: any) => { 
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
              />
              <div 
                style={{ display: 'none' }}
                className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center text-[10px] text-slate-500 font-black border border-white/5"
              >
                {params.data?.sku?.substring(0, 2).toUpperCase() || '??'}
              </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center text-[10px] text-slate-600 font-black border border-white/5">
              {params.data?.sku?.substring(0, 2).toUpperCase() || 'NA'}
            </div>
          </div>
        );
      }
    },
    { 
        field: 'sku', 
        headerName: 'SKU', 
        flex: 1, 
        checkboxSelection: true, 
        headerCheckboxSelection: true,
        cellClass: 'font-mono text-[11px] text-slate-500' 
    },
    { field: 'name', headerName: 'Title', flex: 2, cellClass: 'font-bold text-slate-200' },
    { field: 'price', headerName: 'Price', flex: 1, valueFormatter: (p) => `$${Number(p.value).toFixed(2)}`, cellClass: 'font-bold text-blue-400' },
    { field: 'stock', headerName: 'Inventory', flex: 1, cellRenderer: StockRenderer },
    { field: 'category', headerName: 'Type', flex: 1, cellClass: 'text-slate-500 text-xs' },
  ], []);

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden p-6 gap-6">
      {/* Premium Header */}
      <header className="flex justify-between items-end">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-lg shadow-lg shadow-emerald-500/20">📥</span>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">Import Node</h1>
          </div>
          <p className="text-slate-500 font-medium text-sm">Fetch live data from Lightspeed X-Series and clone to staging.</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleImportAll}
            disabled={importing}
            className="px-6 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 active:scale-95"
          >
            Pull Entire Catalog
          </button>
          <button
            onClick={handleImportSelected}
            disabled={selectedSkus.length === 0 || importing}
            className={`px-8 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
              selectedSkus.length > 0 && !importing
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 active:scale-95' 
                : 'bg-white/5 text-slate-600 cursor-not-allowed'
            }`}
          >
            {importing ? 'Importing...' : `Pull Selected (${selectedSkus.length})`}
          </button>
        </div>
      </header>

      {/* Tool Tray */}
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 items-center">
            <div className="flex-1 glass-panel px-4 py-2 rounded-2xl flex items-center gap-3">
                <span className="text-slate-500">🔍</span>
                <input
                    type="text"
                    placeholder="Search SKU or Title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery, 0)}
                    className="bg-transparent border-none text-white focus:outline-none flex-1 font-bold text-sm placeholder:text-slate-700"
                />
            </div>

            <select 
                value={filterBrandId} 
                onChange={(e) => {
                    setFilterBrandId(e.target.value);
                    handleSearch(searchQuery, 0);
                }}
                className="bg-white/5 border border-white/10 text-slate-300 text-xs font-bold rounded-xl px-4 py-3 focus:outline-none transition-all hover:bg-white/10"
            >
                <option value="">All Brands</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>

            <select 
                value={filterTypeId} 
                onChange={(e) => {
                    setFilterTypeId(e.target.value);
                    handleSearch(searchQuery, 0);
                }}
                className="bg-white/5 border border-white/10 text-slate-300 text-xs font-bold rounded-xl px-4 py-3 focus:outline-none transition-all hover:bg-white/10"
            >
                <option value="">All Categories</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            <select 
                value={filterActive} 
                onChange={(e) => {
                    setFilterActive(e.target.value);
                    handleSearch(searchQuery, 0);
                }}
                className="bg-white/5 border border-white/10 text-slate-300 text-xs font-bold rounded-xl px-4 py-3 focus:outline-none transition-all hover:bg-white/10"
            >
                <option value="">All Statuses</option>
                <option value="1">Active Only</option>
                <option value="0">Inactive Only</option>
            </select>

            <select 
                value={filterChannel} 
                onChange={(e) => {
                    setFilterChannel(e.target.value);
                    handleSearch(searchQuery, 0);
                }}
                className="bg-white/5 border border-white/10 text-slate-300 text-xs font-bold rounded-xl px-4 py-3 focus:outline-none transition-all hover:bg-white/10"
            >
                <option value="">All Channels</option>
                <option value="online">Online Store</option>
                <option value="instore">In-Store Only</option>
            </select>

            <button
                onClick={() => handleSearch(searchQuery, 0)}
                disabled={loading}
                className="glass-button-primary bg-blue-600/80"
            >
                {loading ? 'Searching...' : 'Search'}
            </button>
            
            <div className="flex gap-2 items-center ml-2">
                <button 
                  disabled={loading || offset === 0} 
                  onClick={() => handleSearch(searchQuery, Math.max(0, offset - limit))}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-slate-300 text-xs font-bold disabled:opacity-50 hover:bg-white/10"
                >
                  Prev
                </button>
                <span className="text-slate-400 text-xs font-bold w-20 text-center">
                  {offset + 1} - {offset + rowData.length}
                </span>
                <button 
                  disabled={loading || rowData.length < limit} 
                  onClick={() => handleSearch(searchQuery, offset + limit)}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-slate-300 text-xs font-bold disabled:opacity-50 hover:bg-white/10"
                >
                  Next
                </button>
            </div>
        </div>

        {message && (
          <div className={`px-5 py-3 rounded-2xl border text-xs font-bold animate-in fade-in slide-in-from-left-4 duration-300 ${
            message.type === 'error' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
            {message.type === 'error' ? '⚠️ ' : '✅ '}{message.text}
          </div>
        )}
      </div>

      {/* Main Grid View */}
      <main className="flex-1 glass-card overflow-hidden flex flex-col p-4">
        <div className="flex-1 ag-theme-alpine-dark ag-theme-glass">
            <AgGridReact
              rowData={rowData}
              columnDefs={columnDefs}
              onGridReady={(params) => setGridApi(params.api)}
              onSelectionChanged={onSelectionChanged}
              rowSelection="multiple"
              rowHeight={56}
              headerHeight={48}
              animateRows={true}
              overlayNoRowsTemplate='<span class="text-slate-600 font-bold uppercase tracking-widest text-[10px]">No catalog data found</span>'
            />
        </div>
      </main>
    </div>
  );
}
