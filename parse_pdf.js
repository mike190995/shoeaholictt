import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfModule = require('pdf-parse');
const pdfParser = typeof pdfModule === 'function' ? pdfModule : (pdfModule.default || pdfModule);

let dataBuffer = fs.readFileSync('Lightspeed Retail X API Integration Guide.pdf');

try {
  let result = pdfParser(dataBuffer);
  if (result && result.then) {
    result.then(data => console.log(data.text)).catch(e => console.error(e));
  } else {
    console.log("pdfParser did not return a promise, it is:", result);
  }
} catch(e) {
  console.error("Crash calling pdfParser:", e);
}
