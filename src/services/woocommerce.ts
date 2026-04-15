/**
 * WooCommerce REST API Client
 *
 * Uses WooCommerce REST API v3 with consumer key/secret authentication.
 */

import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { secrets } from '../config/env.js';
import { log } from '../lib/logger.js';

/**
 * Creates an authenticated Axios instance for WooCommerce REST API.
 * WooCommerce uses HTTP Basic Auth with consumer key/secret.
 */
export function createWooCommerceClient(): AxiosInstance {
  const client = axios.create({
    baseURL: `${secrets.wooBaseUrl}/wp-json/wc/v3`,
    auth: {
      username: secrets.wooConsumerKey,
      password: secrets.wooConsumerSecret,
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Add retry logic for 5xx errors and network timeouts
  axiosRetry(client, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
      // Retry on network errors or 5xx warnings
      return axiosRetry.isNetworkOrIdempotentRequestError(error) || (error.response?.status ? error.response.status >= 500 : false);
    },
    onRetry: (retryCount, error) => {
      log.warn({ retryCount, error: error.message }, '[WooCommerce API] Retrying request');
    }
  });

  return client;
}

/**
 * Update a WooCommerce product's stock quantity.
 */
export async function updateWooStock(
  client: AxiosInstance,
  wooProductId: number,
  quantity: number
): Promise<void> {
  await client.put(`/products/${wooProductId}`, {
    stock_quantity: quantity,
    manage_stock: true,
  });
}

/**
 * Create a new WooCommerce product.
 */
export async function createWooProduct(
  client: AxiosInstance,
  data: Record<string, any>
): Promise<number> {
  const response = await client.post('/products', data);
  const product = response.data as Record<string, any>;
  if (!product.id) {
    throw new Error('WooCommerce API did not return a product ID after creation');
  }
  return Number(product.id);
}

/**
 * Permanently delete a WooCommerce product.
 */
export async function deleteWooProduct(
  client: AxiosInstance,
  wooId: number
): Promise<void> {
  await client.delete(`/products/${wooId}`, {
    params: { force: true },
  });
}

/**
 * Fetch a WooCommerce product by SKU.
 */
export async function getWooProductBySku(
  client: AxiosInstance,
  sku: string
): Promise<Record<string, unknown> | null> {
  const response = await client.get('/products', {
    params: { sku, per_page: 1 },
  });

  const products = response.data as unknown[];
  return products.length > 0 ? (products[0] as Record<string, unknown>) : null;
}

/**
 * Update a WooCommerce product's full data.
 */
export async function updateWooProduct(
  client: AxiosInstance,
  wooProductId: number,
  data: Record<string, any>
): Promise<void> {
  await client.put(`/products/${wooProductId}`, data);
}

/**
 * Fetch a WooCommerce variation by SKU.
 */
export async function getWooVariationBySku(
  client: AxiosInstance,
  parentId: number,
  sku: string
): Promise<Record<string, unknown> | null> {
  const response = await client.get(`/products/${parentId}/variations`, {
    params: { sku, per_page: 1 },
  });

  const variations = response.data as unknown[];
  return variations.length > 0 ? (variations[0] as Record<string, unknown>) : null;
}

/**
 * Create a new WooCommerce variation for a parent product.
 */
export async function createWooVariation(
  client: AxiosInstance,
  parentId: number,
  data: Record<string, any>
): Promise<number> {
  const response = await client.post(`/products/${parentId}/variations`, data);
  const variation = response.data as Record<string, any>;
  if (!variation.id) {
    throw new Error(`WooCommerce API did not return a variation ID for parent ${parentId}`);
  }
  return Number(variation.id);
}

/**
 * Update a WooCommerce variation.
 */
export async function updateWooVariation(
  client: AxiosInstance,
  parentId: number,
  variationId: number,
  data: Record<string, any>
): Promise<void> {
  await client.put(`/products/${parentId}/variations/${variationId}`, data);
}

/**
 * Top-level Orchestration Wrapper
 * Finds product ID by SKU, then updates its content and stock.
 * Handles both Simple Products and Variations.
 */
export async function updateWooCommerceStock(
  sku: string, 
  quantity: number, 
  fullData?: Record<string, any>,
  parentId?: number // If provided, treat as a variation update
): Promise<void> {
  const client = createWooCommerceClient();
  
  if (parentId) {
    // VARIATION logic
    console.log(`[WooService] Routing to VARIATION update for SKU: ${sku} (Parent: ${parentId})`);
    const variation = await getWooVariationBySku(client, parentId, sku);
    
    if (!variation || !variation.id) {
      throw new Error(`WooCommerce variation not found for SKU: ${sku} under Parent: ${parentId}`);
    }

    await updateWooVariation(client, parentId, Number(variation.id), {
      ...(fullData || {}),
      stock_quantity: quantity,
      manage_stock: true,
    });
  } else {
    // SIMPLE PRODUCT logic
    const product = await getWooProductBySku(client, sku);
    
    if (!product || !product.id) {
      throw new Error(`WooCommerce product not found for SKU: ${sku}`);
    }
    
    if (fullData) {
      console.log(`[WooService] Performing full update for SIMPLE product SKU: ${sku}`);
      await updateWooProduct(client, Number(product.id), {
        ...fullData,
        stock_quantity: quantity,
        manage_stock: true,
      });
    } else {
      await updateWooStock(client, Number(product.id), quantity);
    }
  }
}
