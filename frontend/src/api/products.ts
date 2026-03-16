export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  category?: string;
  brand?: string;
  imageUrl?: string;
  status: string;
  lastSynced: string;
  // Extended fields used by SpreadsheetView edits
  title?: string;
  description?: string;
  quantity?: number;
}

export interface ProductsResponse {
  products: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function fetchProducts(page: number = 1, search?: string): Promise<ProductsResponse> {
  const params = new URLSearchParams({ page: String(page), limit: '500' });
  if (search) params.set('search', search);

  const response = await fetch(`/admin/api/products?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch products');
  }
  return response.json();
}

export async function forceSyncProduct(sku: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`/admin/api/products/${encodeURIComponent(sku)}/force-sync`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to force sync product');
  }
  return response.json();
}

export async function batchUpdateProducts(
  updates: Array<Partial<Product> & { sku: string }>
): Promise<{ success: boolean; message: string; results: Array<{ sku: string; success: boolean; error?: string }> }> {
  const response = await fetch('/admin/api/products/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  if (!response.ok) {
    throw new Error('Failed to batch update products');
  }
  return response.json();
}
