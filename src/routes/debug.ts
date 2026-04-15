import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const debugRouter = Router();

debugRouter.get('/api/debug-db', async (req, res) => {
  try {
    const cred = await prisma.credential.findFirst({ where: { platform: 'lightspeed' } });
    res.json({ status: 'ok', hasCred: !!cred });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message, stack: err.stack, name: err.name });
  }
});

debugRouter.get('/api/debug-brands', async (req, res) => {
  try {
    const { createLightspeedClient } = await import('../services/lightspeed.js');
    const lsClient = await createLightspeedClient();
    const response = await lsClient.get('/brands');
    res.json({ status: 'ok', count: response.data?.data?.length });
  } catch (err: any) {
    res.status(500).json({ 
      status: 'error', 
      error: err.message, 
      stack: err.stack, 
      name: err.name,
      response: err.response?.data
    });
  }
});

export { debugRouter };
