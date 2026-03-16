import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PDFParser = require("pdf2json");

const pdfParser = new PDFParser(this, 1);

pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError));
pdfParser.on("pdfParser_dataReady", pdfData => {
    fs.writeFileSync("pdf_extracted.txt", pdfParser.getRawTextContent());
    console.log("SUCCESS");
});

pdfParser.loadPDF("Lightspeed Retail X API Integration Guide.pdf");
