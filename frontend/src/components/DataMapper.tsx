import { useState, useEffect } from 'react';
import { 
  fetchProducts, 
  fetchCategoryMappings, 
  saveCategoryMapping,
  fetchFieldMappings,
  saveFieldMapping
} from '../api/products';

interface Mapping {
  lsCategory?: string;
  lsField?: string;
  wooCategoryId?: number;
  wooField?: string;
}

export default function DataMapper() {
  const [catMappings, setCatMappings] = useState<Mapping[]>([]);
  const [fieldMappings, setFieldMappings] = useState<Mapping[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [activeTab, setActiveTab] = useState<'categories' | 'fields'>('categories');

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [cats, fields, productsResp] = await Promise.all([
          fetchCategoryMappings(),
          fetchFieldMappings(),
          fetchProducts(1)
        ]);
        
        setCatMappings(cats);
        setFieldMappings(fields);
        
        const uniqueCats = Array.from(new Set(productsResp.products.map(p => p.category).filter(Boolean))) as string[];
        setAvailableCategories(uniqueCats.sort());
      } catch (err: any) {
        setToast({ message: 'Failed to load mapping data: ' + err.message, type: 'error' });
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSaveCategory = async (lsCategory: string, wooId: string) => {
    const wooCategoryId = parseInt(wooId, 10);
    if (isNaN(wooCategoryId)) {
      setToast({ message: 'Please enter a valid numeric ID', type: 'error' });
      return;
    }

    try {
      setSaving(lsCategory);
      await saveCategoryMapping(lsCategory, wooCategoryId);
      setCatMappings(prev => {
        const existing = prev.find(m => m.lsCategory === lsCategory);
        if (existing) return prev.map(m => m.lsCategory === lsCategory ? { ...m, wooCategoryId } : m);
        return [...prev, { lsCategory, wooCategoryId }];
      });
      setToast({ message: `Mapped category "${lsCategory}" to #${wooCategoryId}`, type: 'success' });
    } catch (err: any) {
      setToast({ message: 'Save failed: ' + err.message, type: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const handleSaveField = async (lsField: string, wooField: string) => {
    if (!lsField || !wooField) return;
    try {
      setSaving(lsField);
      await saveFieldMapping(lsField, wooField);
      setFieldMappings(prev => {
        const existing = prev.find(m => m.lsField === lsField);
        if (existing) return prev.map(m => m.lsField === lsField ? { ...m, wooField } : m);
        return [...prev, { lsField, wooField }];
      });
      setToast({ message: `Mapped field "${lsField}" to "${wooField}"`, type: 'success' });
    } catch (err: any) {
      setToast({ message: 'Save failed: ' + err.message, type: 'error' });
    } finally {
      setSaving(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-400">
      <div className="w-8 h-8 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin mr-3" />
      Initializing Synapse...
    </div>
  );

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-700">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter italic uppercase">Synapse Mapper</h1>
          <p className="text-slate-400 font-medium mt-1">Configure logic gates between Lightspeed and WooCommerce.</p>
        </div>
        
        <div className="flex gap-1 p-1 bg-white/5 rounded-2xl border border-white/5">
            <button 
                onClick={() => setActiveTab('categories')}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'categories' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:text-slate-300'}`}
            >
                Categories
            </button>
            <button 
                onClick={() => setActiveTab('fields')}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'fields' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:text-slate-300'}`}
            >
                Fields
            </button>
        </div>
      </header>

      {toast && (
        <div onClick={() => setToast(null)} className={`fixed top-8 right-8 z-50 px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl cursor-pointer animate-in slide-in-from-top-4 duration-300 ${
          toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/20 border-rose-500/30 text-rose-400'
        }`}>
          <span className="font-black tracking-tight">{toast.message}</span>
        </div>
      )}

      <div className="grid gap-4">
        {activeTab === 'categories' ? (
          availableCategories.length === 0 ? (
            <div className="p-12 text-center bg-white/5 rounded-3xl border border-dashed border-white/10 text-slate-500">
              No categories found in staging database.
            </div>
          ) : (
            availableCategories.map(cat => (
              <MappingRow 
                key={cat} 
                label="ls category"
                source={cat} 
                target={catMappings.find(m => m.lsCategory === cat)?.wooCategoryId?.toString()}
                isSaving={saving === cat}
                onSave={handleSaveCategory}
                placeholder="Woo ID"
              />
            ))
          )
        ) : (
          <>
            <div className="p-6 glass-card border-dashed border-emerald-500/20 flex flex-col gap-4">
               <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest">Add New Field Mapping</h3>
               <NewFieldMappingForm onSave={handleSaveField} isSaving={!!saving} />
            </div>
            {fieldMappings.map(fm => (
              <MappingRow 
                key={fm.lsField} 
                label="ls field"
                source={fm.lsField!} 
                target={fm.wooField}
                isSaving={saving === fm.lsField}
                onSave={handleSaveField}
                placeholder="Woo Field Key"
              />
            ))}
          </>
        )}
      </div>

      <div className="p-6 bg-slate-900/50 rounded-3xl border border-white/5 space-y-3">
        <h3 className="text-sm font-black text-white uppercase tracking-wider">Router Intelligence</h3>
        <p className="text-xs text-slate-400 leading-relaxed max-w-2xl font-medium">
          {activeTab === 'categories' 
            ? "Syncing a product will automatically check these rules. If a match is found, the product is routed to the target WooCommerce category ID instead of the default."
            : "Generic field mapping allows you to mirror any Lightspeed property to a specific WooCommerce meta field or core attribute. Use cautiously to avoid overwriting production data."}
        </p>
      </div>
    </div>
  );
}

function MappingRow({ label, source, target, isSaving, onSave, placeholder }: { 
  label: string;
  source: string; 
  target?: string; 
  isSaving: boolean;
  onSave: (src: string, tgt: string) => void;
  placeholder: string;
}) {
  const [val, setVal] = useState(target || '');

  return (
    <div className="group flex items-center gap-6 p-1.5 pl-6 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all duration-300">
      <div className="flex-1">
        <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-0.5">{label}</div>
        <div className="text-white font-bold tracking-tight">{source}</div>
      </div>

      <div className="w-12 h-[1px] bg-white/10 group-hover:bg-emerald-500/30 transition-colors"></div>

      <div className="flex items-center gap-3 pr-2">
        <div className="flex flex-col">
          <input 
            type="text" 
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={placeholder}
            className="w-32 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 transition-all font-bold"
          />
        </div>
        <button 
          onClick={() => onSave(source, val)}
          disabled={isSaving || (target === val && val !== '')}
          className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            isSaving ? 'bg-white/10 text-slate-500 cursor-wait' :
            (target === val && val !== '') ? 'bg-transparent text-emerald-500 opacity-50 cursor-default' :
            'bg-emerald-500 text-black hover:scale-105 hover:shadow-xl hover:shadow-emerald-500/20 active:scale-95'
          }`}
        >
          {isSaving ? '...' : (target ? 'Update' : 'Link')}
        </button>
      </div>
    </div>
  );
}

function NewFieldMappingForm({ onSave, isSaving }: { onSave: (src: string, tgt: string) => void; isSaving: boolean }) {
  const [src, setSrc] = useState('');
  const [tgt, setTgt] = useState('');

  return (
    <div className="flex gap-3">
        <input 
            type="text" 
            placeholder="LS Source (e.g. tags)"
            value={src}
            onChange={e => setSrc(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/30 transition-all"
        />
        <input 
            type="text" 
            placeholder="Woo Target (e.g. meta_field_name)"
            value={tgt}
            onChange={e => setTgt(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/30 transition-all"
        />
        <button 
            onClick={() => {
                onSave(src, tgt);
                setSrc('');
                setTgt('');
            }}
            disabled={!src || !tgt || isSaving}
            className="px-6 bg-emerald-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-20 active:scale-95 transition-all"
        >
            Add Mapping
        </button>
    </div>
  );
}
