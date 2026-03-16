import React, { useEffect, useState } from 'react';
import { fetchProducts, type Product, forceSyncProduct } from '../api/products';

const ProductMatrix: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [syncingSkus, setSyncingSkus] = useState<Set<string>>(new Set());

  const loadProducts = (p: number, s?: string) => {
    setLoading(true);
    fetchProducts(p, s)
      .then(data => {
        setProducts(data.products);
        setTotalPages(data.pagination.totalPages);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProducts(page, search);
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadProducts(1, search);
  };

  const handleForceSync = async (sku: string) => {
    setSyncingSkus(prev => new Set(prev).add(sku));
    try {
      await forceSyncProduct(sku);
      // Refresh after a short delay to pick up the updated status
      setTimeout(() => loadProducts(page, search), 1000);
    } catch (err) {
      console.error('Force sync failed:', err);
    } finally {
      setSyncingSkus(prev => {
        const next = new Set(prev);
        next.delete(sku);
        return next;
      });
    }
  };

  return (
    <div className="p-8 min-h-screen bg-[#0f172a] text-slate-200">
      <header className="mb-12 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white">Product Matrix</h1>
          <p className="text-slate-400 mt-2 font-medium">Global inventory synchronization and mapping control.</p>
        </div>
        <div className="flex gap-4">
          <form onSubmit={handleSearch} className="relative">
            <input 
              type="text" 
              placeholder="Search catalog..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-12 py-3 text-sm focus:outline-none focus:border-[#10b981] transition-all w-80"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40 text-xl">🔍</span>
          </form>
        </div>
      </header>

      <div className="bg-slate-900/50 backdrop-blur-2xl border border-white/5 rounded-[2.5rem] shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/5 text-slate-400 uppercase text-[10px] font-black tracking-[0.2em]">
                <th className="px-8 py-6">Product Details</th>
                <th className="px-8 py-6">SKU</th>
                <th className="px-8 py-6">Category</th>
                <th className="px-8 py-6">Pricing</th>
                <th className="px-8 py-6">Inventory</th>
                <th className="px-8 py-6">Status</th>
                <th className="px-8 py-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-8 py-12 text-center text-slate-500 italic">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 border-2 border-[#10b981] border-t-transparent rounded-full animate-spin mb-4"></div>
                      Indexing catalog...
                    </div>
                  </td>
                </tr>
              ) : products.map(product => (
                <tr key={product.id} className="group hover:bg-white/5 transition-all">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      {product.imageUrl && (
                        <img src={product.imageUrl} alt="" className="w-10 h-10 rounded-xl object-cover border border-white/10" />
                      )}
                      <div>
                        <div className="font-bold text-white group-hover:text-[#10b981] transition-colors">{product.name}</div>
                        {product.brand && <div className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mt-1">{product.brand}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6 tabular-nums font-medium text-slate-400">{product.sku}</td>
                  <td className="px-8 py-6">
                    {product.category && (
                      <span className="text-[10px] font-bold bg-white/5 px-2 py-1 rounded text-slate-400 uppercase tracking-widest">{product.category}</span>
                    )}
                  </td>
                  <td className="px-8 py-6 font-black text-white">${product.price.toFixed(2)}</td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                       <span className={`w-2 h-2 rounded-full ${product.stock > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                       <span className="font-black tabular-nums">{product.stock}</span>
                       <span className="text-[10px] text-slate-500 font-bold uppercase ml-1">Units</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${product.status === 'published' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                      {product.status}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <button
                      onClick={() => handleForceSync(product.sku)}
                      disabled={syncingSkus.has(product.sku)}
                      className="p-2 hover:bg-[#10b981]/10 rounded-lg transition-all text-[#10b981] font-bold text-xs uppercase tracking-tighter disabled:opacity-40"
                    >
                      {syncingSkus.has(product.sku) ? (
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 border-2 border-[#10b981] border-t-transparent rounded-full animate-spin"></span>
                          Syncing...
                        </span>
                      ) : 'Sync Now'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-8 py-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-xs font-bold uppercase tracking-widest hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Previous
            </button>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 rounded-xl bg-[#10b981] text-white text-xs font-bold uppercase tracking-widest hover:bg-[#059669] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-[#10b981]/10"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductMatrix;
