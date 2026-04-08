
import { UniversalProduct } from '../src/mappers/universal.js';

const mockLightspeedProduct = {
  id: 'lp_123',
  sku: 'TIFFANY-JL-11-36',
  name: '(TIFFANY) JL-11 / Black / 36',
  retail_price: '150.00',
  inventory: [
    { outlet_id: 'outlet_1', count: '2' },
    { outlet_id: 'outlet_2', count: '5' },
    { outlet_id: 'outlet_3', count: '5' },
    { outlet_id: 'outlet_4', count: '10' }
  ],
  image_url: 'https://example.com/image.jpg'
};

console.log('--- Testing fromLightspeed ---');
const universal = UniversalProduct.fromLightspeed(mockLightspeedProduct);
console.log('Universal Data:', JSON.stringify(universal.data, null, 2));

if (universal.data.price === 150) {
  console.log('✅ Price mapped correctly: 150');
} else {
  console.log('❌ Price mapping failed:', universal.data.price);
}

if (universal.data.quantity === 22) {
  console.log('✅ Quantity summed correctly: 22');
} else {
  console.log('❌ Quantity summing failed:', universal.data.quantity);
}

console.log('\n--- Testing toWoo ---');
const wooPayload = universal.toWoo();
console.log('Woo Payload:', JSON.stringify(wooPayload, null, 2));

if (Array.isArray(wooPayload.images) && wooPayload.images.length > 0 && wooPayload.images[0].src === 'https://example.com/image.jpg') {
  console.log('✅ Image mapped correctly to Woo payload');
} else {
  console.log('❌ Image mapping to Woo failed');
}
