const axios = require('axios');

async function testWoo() {
  const url = 'https://shoeaholictt.com/wp-json/wc/v3/products';
  // Try sending credentials in query params instead of Basic Auth headers
  const params = {
    consumer_key: 'ck_184919e83c7e4f07e734491c3d0614e48ffa9f46',
    consumer_secret: 'cs_1badea137bb91ea499d84c81048ae379a2ebc9e7'
  };

  try {
    // Attempt a dummy POST
    console.log('Sending dummy POST request...');
    const res = await axios.post(url, {
      name: 'Test Product API',
      type: 'simple',
      regular_price: '10.00'
    }, { params });
    console.log('Success!', res.data.id);
  } catch (err) {
    if (err.response) {
      console.log('Error Data:', err.response.data);
      console.log('Error Status:', err.response.status);
    } else {
      console.log('Error:', err.message);
    }
  }
}

testWoo();
