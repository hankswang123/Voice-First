import { RealtimeRelay } from './lib/relay.js';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const PROVIDER = (process.env.REALTIME_PROVIDER || 'openai').toLowerCase();
const API_KEY = PROVIDER === 'boson'
  ? process.env.BOSON_API_KEY
  : process.env.OPENAI_API_KEY;

if (!API_KEY) {
  const envVar = PROVIDER === 'boson' ? 'BOSON_API_KEY' : 'OPENAI_API_KEY';
  console.error(
    `Environment variable "${envVar}" is required for provider "${PROVIDER}".\n` +
      `Please set it in your .env file.`
  );
  process.exit(1);
}

const PORT = parseInt(process.env.PORT) || 8081;

const relay = new RealtimeRelay(API_KEY, { provider: PROVIDER });
console.log(`[RealtimeRelay] Provider: ${PROVIDER}`);
relay.listen(PORT);
