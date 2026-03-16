import { useState, useEffect, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { searchLightspeed, importFromLightspeed } from '../api/lightspeed';
import type { Product } from '../api/products';

export default function LightspeedImporter() {
  const [rowData, setRowData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [gridApi, setGridApi] = useState<any>(null);

  // Load initial initial batch
  useEffect(() => {
    handleSearch('');
  }, []);

  const handleSearch = async (query: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await searchLightspeed(query, 50);
      setRowData(data.products || []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (selectedSkus.length === 0) return;
    
    setImporting(true);
    setMessage(null);
    try {
      const res = await importFromLightspeed(selectedSkus);
      if (res.success) {
        setMessage({ type: 'success', text: res.message });
        // Deselect all
        if (gridApi) gridApi.deselectAll();
      } else {
        setMessage({ type: 'error', text: 'Import failed or partially failed.' });
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
    { field: 'sku', headerName: 'LS SKU', flex: 1, checkboxSelection: true, headerCheckboxSelection: true },
    { field: 'name', headerName: 'Title', flex: 2 },
    { field: 'price', headerName: 'Price', flex: 1, valueFormatter: (p) => `$${Number(p.value).toFixed(2)}` },
    { field: 'stock', headerName: 'QOH', flex: 1 },
    { field: 'category', headerName: 'Category', flex: 1 },
    { field: 'brand', headerName: 'Brand', flex: 1 },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
  }), []);

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white mb-2">📥 Import Node</h1>
          <p className="text-slate-400 font-medium">Search the live Lightspeed Retail catalog and selectively pull products into the staging database.</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl mb-6 font-medium ${message.type === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
          {message.text}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 bg-slate-900 rounded-2xl border border-white/10 p-2 flex items-center">
          <span className="text-slate-500 px-3">🔍</span>
          <input
            type="text"
            placeholder="Search Lightspeed by SKU... (Leave empty for recent catalog items)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
            className="bg-transparent border-none text-white focus:outline-none flex-1 font-medium placeholder:text-slate-600"
          />
          <button
            onClick={() => handleSearch(searchQuery)}
            disabled={loading}
            className="px-6 py-2 bg-[#38bdf8] text-slate-900 font-bold rounded-xl hover:bg-[#7dd3fc] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        <button
          onClick={handleImport}
          disabled={selectedSkus.length === 0 || importing}
          className="px-8 bg-emerald-500 text-white font-bold tracking-tight rounded-2xl hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
        >
          {importing ? (
            <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : '📥'}
          Pull {selectedSkus.length} to Middleware
        </button>
      </div>

      {/* AG Grid */}
      <div className="flex-1 ag-theme-alpine-dark rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
        <AgGridReact
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowSelection="multiple"
          animateRows={true}
          onGridReady={(params) => setGridApi(params.api)}
          onSelectionChanged={onSelectionChanged}
          overlayLoadingTemplate='<span class="ag-overlay-loading-center">Loading live catalog...</span>'
          overlayNoRowsTemplate='<span class="ag-overlay-no-rows-center">No products found in Lightspeed</span>'
          rowHeight={60}
          headerHeight={50}
        />
      </div>
    </div>
  );
}
