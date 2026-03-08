/**
 * WooCommerce REST API Client
 *
 * Uses WooCommerce REST API v3 with consumer key/secret authentication.
 */

import axios, { AxiosInstance } from 'axios';
import { config } from '../config/env.js';

/**
 * Creates an authenticated Axios instance for WooCommerce REST API.
 * WooCommerce uses HTTP Basic Auth with consumer key/secret.
 */
export function createWooCommerceClient(): AxiosInstance {
  const client = axios.create({
    baseURL: `${config.wooBaseUrl}/wp-json/wc/v3`,
    auth: {
      username: config.wooConsumerKey,
      password: config.wooConsumerSecret,
    },
    headers: {
      'Content-Type': 'application/json',
    },
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
 * Top-level Orchestration Wrapper
 * Finds product ID by SKU, then updates its stock.
 */
export async function updateWooCommerceStock(sku: string, quantity: number): Promise<void> {
  const client = createWooCommerceClient();
  const product = await getWooProductBySku(client, sku);
  
  if (!product || !product.id) {
    throw new Error(`WooCommerce product not found for SKU: ${sku}`);
  }
  
  await updateWooStock(client, Number(product.id), quantity);
}
