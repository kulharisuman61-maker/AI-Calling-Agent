import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import dotenv from 'dotenv';
import { initDatabase } from './database/index.js';
import { initTwilioClient } from './services/twilioService.js';
import { prewarmElevenLabs } from './services/elevenLabsService.js';
import { setupCallRoutes } from './routes/callRoutes.js';
import { handleMediaStream, getActiveStreams } from './handlers/mediaStreamHandler.js';
import { setupReviewRoutes } from './routes/reviewRoutes.js';
import { setupRLRoutes } from './routes/rlRoutes.js';

dotenv.config();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Initialize Fastify
const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  }
});

// Register plugins
await fastify.register(cors, {
  origin: true
});

await fastify.register(websocket, {
  options: {
    maxPayload: 1048576 // 1MB
  }
});

// Initialize database
try {
  const dbPath = process.env.DATABASE_PATH || './database/ai_caller.db';
  initDatabase(dbPath);
  console.log('[SERVER] Database initialized');
} catch (error) {
  console.error('[SERVER] Database initialization failed:', error);
  process.exit(1);
}

// Initialize Twilio
try {
  initTwilioClient();
  console.log('[SERVER] Twilio client initialized');
} catch (error) {
  console.error('[SERVER] Twilio initialization failed:', error);
  console.log('[SERVER] Will continue but calls will fail without valid Twilio credentials');
}

// Prewarm ElevenLabs connection
prewarmElevenLabs();
setInterval(prewarmElevenLabs, 30000); // Every 30 seconds

// Routes
fastify.get('/', async (request, reply) => {
  return { 
    message: 'AI Caller System',
    status: 'operational',
    version: '1.0.0'
  };
});

// Health check
fastify.get('/health', async (request, reply) => {
  const { getDatabase } = await import('./database/index.js');
  
  const checks = {
    database: { status: 'ok' },
    twilio: { status: 'ok' },
    elevenlabs: { status: 'ok' },
    activeCalls: getActiveStreams().size
  };
  
  // Test database
  try {
    const db = getDatabase();
    db.prepare('SELECT 1').get();
  } catch (error) {
    checks.database = { status: 'error', message: error.message };
  }
  
  // Check Twilio
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    if (!accountSid) {
      checks.twilio = { status: 'warning', message: 'Credentials not configured' };
    }
  } catch (error) {
    checks.twilio = { status: 'error', message: error.message };
  }
  
  // Check ElevenLabs
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      checks.elevenlabs = { status: 'warning', message: 'API key not configured' };
    }
  } catch (error) {
    checks.elevenlabs = { status: 'error', message: error.message };
  }
  
  const healthy = Object.values(checks).every(c => c.status === 'ok' || c.status === 'warning');
  
  return reply.code(healthy ? 200 : 503).send({
    status: healthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString()
  });
});

// Setup routes
await setupCallRoutes(fastify);
await setupReviewRoutes(fastify);
await setupRLRoutes(fastify);

// WebSocket route for Twilio media streams
fastify.register(async function (fastify) {
  fastify.get('/outbound-media-stream', { websocket: true }, (connection, request) => {
    handleMediaStream(connection, request);
  });
});

// Start server
try {
  await fastify.listen({ port: PORT, host: HOST });
  console.log(`[SERVER] AI Caller System running on http://${HOST}:${PORT}`);
  console.log('[SERVER] Endpoints:');
  console.log('  POST /zoho-webhook - Initiate outbound call');
  console.log('  POST /inbound-call - Handle inbound calls');
  console.log('  GET  /review-dashboard - Manual review interface');
  console.log('  POST /api/rl/analyze - Trigger RL analysis');
  console.log('  POST /api/rl/generate-prompt - Generate optimized prompt');
  console.log('  GET  /api/prompts - View all prompt versions');
  console.log('  GET  /health - Health check');
} catch (error) {
  console.error('[SERVER] Failed to start:', error);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[SERVER] Shutting down gracefully...');
  await fastify.close();
  
  const { closeDatabase } = await import('./database/index.js');
  closeDatabase();
  
  process.exit(0);
});
