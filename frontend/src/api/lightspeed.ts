import type { ProductsResponse } from './products';

export interface FilterOptions {
  search?: string;
  brandId?: string;
  typeId?: string;
  active?: string;
  channel?: string;
  offset?: number;
}

export async function fetchBrands() {
  const response = await fetch('/admin/api/lightspeed/brands');
  if (!response.ok) throw new Error('Failed to fetch brands');
  return response.json();
}

export async function fetchTypes() {
  const response = await fetch('/admin/api/lightspeed/types');
  if (!response.ok) throw new Error('Failed to fetch types');
  return response.json();
}

export async function searchLightspeed(options: FilterOptions, limit: number = 50): Promise<ProductsResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (options.search) params.set('search', options.search);
  if (options.brandId) params.set('brandId', options.brandId);
  if (options.typeId) params.set('typeId', options.typeId);
  if (options.active) params.set('active', options.active);
  if (options.channel) params.set('channel', options.channel);
  if (options.offset !== undefined) params.set('offset', String(options.offset));

  const response = await fetch(`/admin/api/lightspeed/search?${params}`);
  if (!response.ok) {
    throw new Error('Failed to search Lightspeed catalog');
  }
  return response.json();
}

export async function importFromLightspeed(
  skus?: string[], 
  filter?: { 
    brandId?: string; 
    typeId?: string; 
    onlyOnline?: boolean;
    active?: string;
    channel?: string;
  },
  all?: boolean
): Promise<{ success: boolean; message: string; imported: number; errors: string[] }> {
  const response = await fetch('/admin/api/lightspeed/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skus, filter, all }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to import products from Lightspeed');
  }
  return response.json();
}
