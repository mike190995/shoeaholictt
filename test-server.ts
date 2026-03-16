import express from 'express';
import { resolve } from 'path';

const app = express();
const port = 8081;

app.get('/test', (req, res) => {
  const p = resolve(process.cwd(), 'frontend/dist/index.html');
  console.log('Sending file:', p);
  res.sendFile(p);
});

app.listen(port, () => {
  console.log(`Test server on ${port}`);
});
