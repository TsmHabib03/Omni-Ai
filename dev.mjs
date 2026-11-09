import { startServer } from './server.mjs';
import { createServer } from 'vite';

const api = startServer();
api.on('error', error => { console.error(`Backend could not start: ${error.message}`); process.exit(1); });
try {
  const vite = await createServer();
  await vite.listen();
  vite.printUrls();
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await vite.close();
    api.close(() => process.exit(0));
    api.closeAllConnections();
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
} catch (error) { api.close(); console.error(error.message); process.exit(1); }
