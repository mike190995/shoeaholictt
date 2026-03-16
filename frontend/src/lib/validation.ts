import { z } from 'zod';

/**
 * Shared Zod schema for a product cell update in the spreadsheet.
 * Used by both the frontend for real-time cell validation
 * and the backend batch endpoint for server-side validation.
 */
export const ProductCellSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().optional(),
  price: z.number().nonnegative('Price cannot be negative').optional(),
  quantity: z.number().int().nonnegative('Quantity cannot be negative').optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  imageUrl: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
});

export type ProductCellUpdate = z.infer<typeof ProductCellSchema>;

export const BatchUpdateSchema = z.object({
  updates: z.array(ProductCellSchema).min(1, 'At least one update is required'),
});

export type BatchUpdatePayload = z.infer<typeof BatchUpdateSchema>;
