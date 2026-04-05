import { useState, useEffect } from 'react';
import { fetchProducts, fetchCategoryMappings, saveCategoryMapping } from '../api/products';

interface Mapping {
  lsCategory: string;
  wooCategoryId: number;
}

export default function CategoryMapper() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // Fetch existing mappings
        const existingMappings = await fetchCategoryMappings();
        setMappings(existingMappings);

        // Fetch products to find unique categories not yet mapped
        const productsResp = await fetchProducts(1);
        const uniqueCats = Array.from(new Set(productsResp.products.map(p => p.category).filter(Boolean))) as string[];
        setAvailableCategories(uniqueCats.sort());
      } catch (err: any) {
        setToast({ message: 'Failed to load category data: ' + err.message, type: 'error' });
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSave = async (lsCategory: string, wooId: string) => {
    const wooCategoryId = parseInt(wooId, 10);
    if (isNaN(wooCategoryId)) {
      setToast({ message: 'Please enter a valid numeric ID', type: 'error' });
      return;
    }

    try {
      setSaving(lsCategory);
      await saveCategoryMapping(lsCategory, wooCategoryId);
      
      // Update local state
      setMappings(prev => {
        const existing = prev.find(m => m.lsCategory === lsCategory);
        if (existing) {
          return prev.map(m => m.lsCategory === lsCategory ? { ...m, wooCategoryId } : m);
        }
        return [...prev, { lsCategory, wooCategoryId }];
      });
      
      setToast({ message: `Mapped "${lsCategory}" to #${wooCategoryId}`, type: 'success' });
    } catch (err: any) {
      setToast({ message: 'Save failed: ' + err.message, type: 'error' });
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="animate-spin mr-3">🌀</div> Initializing Mapper...
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-700">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter">Category Mapper</h1>
          <p className="text-slate-400 font-medium mt-1">Cross-platform routing logic for your inventory.</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.2em] mb-1">Status</div>
          <div className="flex items-center gap-2 text-white font-bold text-sm bg-[#10b981]/10 px-3 py-1 rounded-full border border-[#10b981]/20">
            <span className="w-2 h-2 bg-[#10b981] rounded-full"></span> Active
          </div>
        </div>
      </header>

      {toast && (
        <div className={`fixed top-8 right-8 z-50 px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl animate-in slide-in-from-top-4 duration-300 ${
          toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 
          toast.type === 'error' ? 'bg-rose-500/20 border-rose-500/30 text-rose-400' : 
          'bg-blue-500/20 border-blue-500/30 text-blue-400'
        }`}>
          <span className="font-black tracking-tight">{toast.message}</span>
        </div>
      )}

      <div className="grid gap-4">
        {availableCategories.length === 0 ? (
          <div className="p-12 text-center bg-white/5 rounded-3xl border border-dashed border-white/10 text-slate-500">
            No categories found in imported products.
          </div>
        ) : (
          availableCategories.map(cat => {
            const currentMapping = mappings.find(m => m.lsCategory === cat);
            return (
              <CategoryRow 
                key={cat} 
                category={cat} 
                currentId={currentMapping?.wooCategoryId}
                isSaving={saving === cat}
                onSave={handleSave}
              />
            );
          })
        )}
      </div>

      <div className="p-6 bg-slate-900/50 rounded-3xl border border-white/5 space-y-3">
        <h3 className="text-sm font-black text-white uppercase tracking-wider">How it works</h3>
        <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
          When you push a product to WooCommerce, the middleware looks at the original Lightspeed category. 
          If a mapping exists here, the product will be placed in that specific WooCommerce Category ID. 
          If no mapping is found, it will land in the default store category.
        </p>
      </div>
    </div>
  );
}

function CategoryRow({ category, currentId, isSaving, onSave }: { 
  category: string; 
  currentId?: number; 
  isSaving: boolean;
  onSave: (cat: string, id: string) => void 
}) {
  const [val, setVal] = useState(currentId?.toString() || '');

  return (
    <div className="group flex items-center gap-6 p-1.5 pl-6 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all duration-300">
      <div className="flex-1">
        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Lightspeed Category</div>
        <div className="text-white font-bold tracking-tight">{category}</div>
      </div>

      <div className="w-12 h-[1px] bg-white/10 group-hover:bg-[#10b981]/30 transition-colors"></div>

      <div className="flex items-center gap-3 pr-2">
        <div className="flex flex-col">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Woo ID</label>
          <input 
            type="text" 
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="e.g. 42"
            className="w-24 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#10b981]/50 focus:ring-4 focus:ring-[#10b981]/10 transition-all"
          />
        </div>
        <button 
          onClick={() => onSave(category, val)}
          disabled={isSaving || (currentId?.toString() === val && val !== '')}
          className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            isSaving ? 'bg-white/10 text-slate-500 cursor-wait' :
            (currentId?.toString() === val && val !== '') ? 'bg-transparent text-[#10b981] opacity-50 cursor-default' :
            'bg-[#10b981] text-black hover:scale-105 hover:shadow-xl hover:shadow-[#10b981]/20 active:scale-95'
          }`}
        >
          {isSaving ? '...' : (currentId ? 'Update' : 'Link')}
        </button>
      </div>
    </div>
  );
}
