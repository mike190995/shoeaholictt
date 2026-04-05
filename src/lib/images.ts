import axios from 'axios';
import sharp from 'sharp';
import { Storage } from '@google-cloud/storage';
import { config } from '../config/env.js';
import { log } from './logger.js';

const storage = new Storage({ projectId: config.gcpProjectId });
const bucket = storage.bucket(config.gcsBucket);

/**
 * Image Optimization Utility
 * 
 * Takes an original image URL, fetches it, optimizes it with Sharp,
 * uploads it to GCS, and returns the new public URL.
 */
export async function optimizeAndUploadImage(imageUrl: string, sku: string): Promise<string | null> {
  try {
    log.info({ imageUrl, sku }, '[Images] Starting optimization');

    // 1. Fetch image data
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    // 2. Optimize with Sharp
    // - Resize to 1200px (max width), maintain aspect ratio
    // - Convert to WebP for best compression
    // - Strip metadata for privacy and size
    const optimized = await sharp(buffer)
      .resize(1200, null, { withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    // 3. Define GCS path
    const fileName = `products/${sku}_${Date.now()}.webp`;
    const file = bucket.file(fileName);

    // 4. Upload to GCS
    await file.save(optimized, {
      contentType: 'image/webp',
      public: true,
      metadata: { cacheControl: 'public, max-age=31536000' },
    });

    const publicUrl = `https://storage.googleapis.com/${config.gcsBucket}/${fileName}`;
    log.info({ publicUrl }, '[Images] Upload complete');

    return publicUrl;
  } catch (err: any) {
    log.error({ error: err.message, imageUrl, sku }, '[Images] Optimization failed');
    // Don't crash the whole push process — return null and the original URL fallback can be used
    return null;
  }
}
