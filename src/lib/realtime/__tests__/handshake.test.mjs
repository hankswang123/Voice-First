// Tier-1 test: confirm the patched api.js opens a GA-compatible WebSocket.
// Run from repo root: node src/lib/realtime/__tests__/handshake.test.mjs
//
// Requires OPENAI_API_KEY in .env at the repo root.
// Exits 0 on server.session.created, exits 1 on any close-with-error or timeout.

import 'dotenv/config';
import { RealtimeClient } from '../client.js';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('FAIL: OPENAI_API_KEY missing from .env');
  process.exit(1);
}

const client = new RealtimeClient({ apiKey });

const timeout = setTimeout(() => {
  console.error('FAIL: timed out waiting for server.session.created (10s)');
  process.exit(1);
}, 10_000);

client.realtime.on('server.session.created', (event) => {
  clearTimeout(timeout);
  console.log('PASS: server.session.created received, session id =', event.session?.id);
  process.exit(0);
});

client.realtime.on('close', ({ error }) => {
  if (error) {
    clearTimeout(timeout);
    console.error('FAIL: WebSocket closed with error before session.created');
    process.exit(1);
  }
});

try {
  await client.connect();
} catch (e) {
  clearTimeout(timeout);
  console.error('FAIL: connect() threw:', e.message);
  process.exit(1);
}
