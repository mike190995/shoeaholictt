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
  woocommerceId?: number | null;
  lastSynced: string;
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

export interface CategoryMapping {
  lsCategory: string;
  wooCategoryId: number;
}

class MiddlewareClient {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown API error' }));
      throw new Error(error.error || `HTTP Error ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // ─── Products ─────────────────────────────────

  async fetchProducts(pageNo: number = 1, search?: string): Promise<ProductsResponse> {
    const params = new URLSearchParams({ page: String(pageNo), limit: '500' });
    if (search) params.set('search', search);
    return this.request<ProductsResponse>(`/admin/api/products?${params}`);
  }

  async forceSyncProduct(sku: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      `/admin/api/products/${encodeURIComponent(sku)}/force-sync`,
      { method: 'POST' }
    );
  }

  async batchUpdateProducts(updates: Array<Partial<Product> & { sku: string }>): Promise<{ 
    success: boolean; 
    message: string; 
    results: Array<{ sku: string; success: boolean; error?: string }> 
  }> {
    return this.request('/admin/api/products/batch', {
      method: 'POST',
      body: JSON.stringify({ updates }),
    });
  }

  // ─── WooCommerce Sync ──────────────────────────

  async pushProductToWoo(sku: string): Promise<{ success: boolean; message: string; woocommerceId?: number }> {
    return this.request(`/admin/api/products/${encodeURIComponent(sku)}/push-to-woo`, {
      method: 'POST',
    });
  }

  async unlinkProduct(sku: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/admin/api/products/${encodeURIComponent(sku)}/unlink`, {
      method: 'POST',
    });
  }

  async deleteProductFromWoo(sku: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/admin/api/products/${encodeURIComponent(sku)}/woo`, {
      method: 'DELETE',
    });
  }

  // ─── Category Mappings ─────────────────────────

  async fetchCategoryMappings(): Promise<CategoryMapping[]> {
    return this.request<CategoryMapping[]>('/admin/api/categories/mapping');
  }

  async saveCategoryMapping(lsCategory: string, wooCategoryId: number): Promise<{ success: boolean }> {
    return this.request('/admin/api/categories/mapping', {
      method: 'POST',
      body: JSON.stringify({ lsCategory, wooCategoryId }),
    });
  }
}

export const api = new MiddlewareClient();

// Backwards compatibility exports to prevent immediate breakages
export const fetchProducts = api.fetchProducts.bind(api);
export const forceSyncProduct = api.forceSyncProduct.bind(api);
export const batchUpdateProducts = api.batchUpdateProducts.bind(api);
export const pushProductToWoo = api.pushProductToWoo.bind(api);
export const unlinkProduct = api.unlinkProduct.bind(api);
export const deleteProductFromWoo = api.deleteProductFromWoo.bind(api);
export const fetchCategoryMappings = api.fetchCategoryMappings.bind(api);
export const saveCategoryMapping = api.saveCategoryMapping.bind(api);
