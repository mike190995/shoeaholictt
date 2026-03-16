import type { ProductsResponse } from './products';

export async function searchLightspeed(search?: string, limit: number = 50): Promise<ProductsResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (search) params.set('search', search);

  const response = await fetch(`/admin/api/lightspeed/search?${params}`);
  if (!response.ok) {
    throw new Error('Failed to search Lightspeed catalog');
  }
  return response.json();
}

export async function importFromLightspeed(skus: string[]): Promise<{ success: boolean; message: string; imported: number; errors: string[] }> {
  const response = await fetch('/admin/api/lightspeed/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skus }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to import products from Lightspeed');
  }
  return response.json();
}
