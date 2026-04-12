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
    <div className="p-10 space-y-10">
      <header className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📦</span>
            <h1 className="text-3xl font-black text-white italic tracking-tighter uppercase">Catalog Matrix</h1>
          </div>
          <p className="text-slate-500 font-medium">Internal database mirror of all synchronized items.</p>
        </div>
        
        <form onSubmit={handleSearch} className="group relative w-full md:w-96">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none opacity-40 group-focus-within:opacity-100 transition-opacity">
                <span>🔍</span>
            </div>
            <input 
              type="text" 
              placeholder="Query catalog..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/5 rounded-2xl pl-12 pr-4 py-3 text-xs font-bold uppercase tracking-widest focus:outline-none focus:bg-white/10 focus:border-white/20 transition-all placeholder:text-slate-700"
            />
        </form>
      </header>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/[0.03] text-slate-500 uppercase text-[10px] font-black tracking-[0.2em] border-b border-white/5">
                <th className="px-8 py-5">Product Details</th>
                <th className="px-8 py-5">Category</th>
                <th className="px-8 py-5 text-blue-400">Price</th>
                <th className="px-8 py-5">Stock</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-8 h-8 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin"></div>
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Querying Staging Node</span>
                    </div>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                    <td colSpan={6} className="px-8 py-20 text-center">
                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-tighter italic">Zero matches found in database</span>
                    </td>
                </tr>
              ) : products.map(product => {
                const isLinked = !!product.woocommerceId;
                return (
                  <tr key={product.id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-5">
                        <div className="relative">
                            <div className="w-14 h-14 flex-shrink-0 bg-black/20 rounded-2xl overflow-hidden border border-white/5 shadow-inner">
                                {product.imageUrl && !product.imageUrl.includes('placeholder') && !product.imageUrl.includes('no-image') ? (
                                    <img 
                                      src={product.imageUrl} 
                                      alt="" 
                                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        if (e.currentTarget.nextSibling) (e.currentTarget.nextSibling as HTMLElement).style.display = 'flex';
                                      }}
                                    />
                                ) : null}
                                <div 
                                  style={{ display: product.imageUrl && !product.imageUrl.includes('placeholder') && !product.imageUrl.includes('no-image') ? 'none' : 'flex' }}
                                  className="w-full h-full items-center justify-center text-[10px] font-black text-slate-600"
                                >
                                  {product.sku?.substring(0, 2).toUpperCase() || '—'}
                                </div>
                            </div>
                            {isLinked && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-slate-900 flex items-center justify-center text-[8px] text-white">🔗</div>
                            )}
                        </div>
                        <div>
                          <div className="text-sm font-black text-white tracking-tight leading-none mb-1">{product.name || product.title}</div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-500">{product.sku}</span>
                            {isLinked && (
                                <>
                                    <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                                    <span className="text-[9px] font-black text-blue-500/60 uppercase">Woo ID: {product.woocommerceId}</span>
                                </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{product.category || 'NO TYPE'}</span>
                    </td>
                    <td className="px-8 py-5 font-black text-blue-400 tabular-nums">${product.price.toFixed(2)}</td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                         <div className={`w-1.5 h-1.5 rounded-full ${product.stock > 0 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`}></div>
                         <span className="text-sm font-bold tabular-nums text-slate-200">{product.stock}</span>
                         <span className="text-[9px] text-slate-600 font-black uppercase tracking-tighter">Units</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-1">
                        <span className={`w-fit px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                            product.status === 'published' 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {product.status}
                        </span>
                        <span className={`w-fit px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                            isLinked 
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                                : 'bg-white/5 text-slate-500 border-white/5'
                        }`}>
                          {isLinked ? 'LINKED' : 'STAGED'}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button
                        onClick={() => handleForceSync(product.sku)}
                        disabled={syncingSkus.has(product.sku)}
                        className="glass-button-ghost text-[10px] uppercase font-black tracking-widest"
                      >
                        {syncingSkus.has(product.sku) ? '...' : 'Sync Now'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Action Tray / Pagination */}
        <div className="px-8 py-6 bg-white/[0.01] border-t border-white/5 flex items-center justify-between">
          <div className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">
            Catalog Index {page} <span className="text-slate-800">/</span> {totalPages}
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="glass-button-secondary py-1.5 px-4 text-[10px] uppercase tracking-widest disabled:opacity-30"
            >
              Back
            </button>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="glass-button-primary py-1.5 px-4 text-[10px] uppercase tracking-widest bg-blue-600/80 disabled:opacity-30"
            >
              Forward
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductMatrix;
