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
    console.log('Sending dummy POST request (in query param)...');
    const res = await axios.post(url, {
      name: 'Test Product API',
      type: 'simple',
      regular_price: '10.00'
    }, { params });
    console.log('Success!', res.data.id);
  } catch (err) {
    if (err.response) {
      console.log('Query Params Auth Error Data:', err.response.data);
      console.log('Query Params Auth Error Status:', err.response.status);
    } else {
      console.log('Query Params Auth Error:', err.message);
    }
  }

  // Also try using standard Basic Auth as Axios does by default
  try {
    console.log('Sending dummy POST request (in Basic Auth Headers)...');
    const res2 = await axios.post(url, {
      name: 'Test Product API 2',
      type: 'simple',
      regular_price: '10.00'
    }, { 
      auth: {
        username: 'ck_184919e83c7e4f07e734491c3d0614e48ffa9f46',
        password: 'cs_1badea137bb91ea499d84c81048ae379a2ebc9e7'
      }
    });
    console.log('Success (Basic Auth)!', res2.data.id);
  } catch (err) {
    if (err.response) {
      console.log('Basic Auth Error Data:', err.response.data);
      console.log('Basic Auth Error Status:', err.response.status);
    } else {
      console.log('Basic Auth Error:', err.message);
    }
  }
}

testWoo();
