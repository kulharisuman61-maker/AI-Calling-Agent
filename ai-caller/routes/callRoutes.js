import { v4 as uuidv4 } from 'uuid';
import { initiateCall, validateAustralianPhoneNumber } from '../services/twilioService.js';
import { getSignedUrl } from '../services/elevenLabsService.js';
import { injectPromptVariables, getActivePromptVersion } from '../utils/promptInjection.js';
import { getDatabase } from '../database/index.js';
import { getActiveStreams } from '../handlers/mediaStreamHandler.js';
import {
  createStreamSession,
  deletePendingCallContext,
  getPendingCallContext,
  savePendingCallContext
} from '../services/streamSessionStore.js';

function parseJsonField(value, fallback = {}) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseLimit(value, defaultValue = 25, maxValue = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
}

async function createOutboundCall(request, reply) {
  try {
    const {
      first_name,
      lead_notes,
      phone_number,
      state,
      agent_id,
      lead_id,
      lead_source,
      ...additionalFields
    } = request.body;

    if (!phone_number || !lead_id) {
      return reply.code(400).send({
        error: 'Missing required fields: phone_number, lead_id'
      });
    }

    if (!validateAustralianPhoneNumber(phone_number)) {
      return reply.code(400).send({
        error: 'Invalid Australian phone number format. Expected: +61...'
      });
    }

    const callId = uuidv4();
    const db = getDatabase();
    const promptVersion = getActivePromptVersion(db);

    if (!promptVersion) {
      return reply.code(500).send({ error: 'No active prompt version found' });
    }

    const variables = {
      first_name: first_name || 'there',
      lead_notes: lead_notes || 'No additional notes',
      state: state || 'unknown',
      lead_source: lead_source || 'unknown'
    };

    const injectedPrompt = injectPromptVariables(promptVersion.prompt_text, variables);

    db.prepare(`
      INSERT INTO calls (
        call_id, lead_id, call_type, phone_number, prompt_version_id,
        initiated_at, additional_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      callId,
      lead_id,
      'outbound',
      phone_number,
      promptVersion.version_id,
      new Date().toISOString(),
      JSON.stringify({ agent_id, first_name, state, lead_source, lead_notes, ...additionalFields })
    );

    savePendingCallContext(callId, {
      callId,
      promptVersionId: promptVersion.version_id,
      leadId: lead_id,
      injectedPrompt
    });

    const baseUrl = `${request.protocol}://${request.hostname}`;
    const webhookUrl = `${baseUrl}/outbound-call-twiml?callId=${encodeURIComponent(callId)}`;
    let call;

    try {
      call = await initiateCall(phone_number, webhookUrl, callId, promptVersion.version_id, lead_id);
    } catch (error) {
      deletePendingCallContext(callId);
      db.prepare('UPDATE calls SET call_status = ? WHERE call_id = ?').run('failed', callId);
      throw error;
    }

    db.prepare('UPDATE calls SET call_sid = ?, call_status = ? WHERE call_id = ?').run(
      call.sid,
      call.status || 'initiated',
      callId
    );

    console.log(`[OUTBOUND CALL] Initiated for ${phone_number}, callId: ${callId}`);

    return reply.send({
      success: true,
      call_sid: call.sid,
      call_id: callId,
      status: call.status || 'initiated'
    });
  } catch (error) {
    console.error('[OUTBOUND CALL] Error:', error);
    return reply.code(500).send({
      error: 'Failed to initiate call',
      message: error.message
    });
  }
}

export async function setupCallRoutes(fastify) {
  fastify.get('/api/calls', async (request, reply) => {
    try {
      const db = getDatabase();
      const limit = parseLimit(request.query.limit);
      const calls = db.prepare(`
        SELECT
          call_id,
          call_sid,
          lead_id,
          call_type,
          phone_number,
          initiated_at,
          answered_at,
          ended_at,
          call_status,
          transfer_successful,
          call_duration_seconds,
          manual_review_status,
          success_score,
          additional_data
        FROM calls
        ORDER BY COALESCE(initiated_at, created_at) DESC
        LIMIT ?
      `).all(limit);

      return reply.send({
        calls: calls.map(call => ({
          ...call,
          additional_data: parseJsonField(call.additional_data)
        }))
      });
    } catch (error) {
      console.error('[CALLS] Error fetching calls:', error);
      return reply.code(500).send({ error: 'Failed to fetch calls' });
    }
  });

  fastify.get('/api/dashboard/summary', async (request, reply) => {
    try {
      const db = getDatabase();
      const totals = db.prepare(`
        SELECT
          COUNT(*) as total_calls,
          SUM(CASE WHEN call_type = 'outbound' THEN 1 ELSE 0 END) as outbound_calls,
          SUM(CASE WHEN call_type = 'inbound' THEN 1 ELSE 0 END) as inbound_calls,
          SUM(CASE WHEN transfer_successful = 1 THEN 1 ELSE 0 END) as transfers,
          AVG(call_duration_seconds) as avg_duration,
          SUM(CASE WHEN manual_review_status = 'pending' THEN 1 ELSE 0 END) as pending_reviews
        FROM calls
      `).get();
      const activePrompt = getActivePromptVersion(db);

      return reply.send({
        ...totals,
        transfer_rate: totals.total_calls > 0 ? totals.transfers / totals.total_calls : 0,
        active_calls: getActiveStreams().size,
        active_prompt: activePrompt
          ? {
              version_id: activePrompt.version_id,
              version_number: activePrompt.version_number
            }
          : null
      });
    } catch (error) {
      console.error('[DASHBOARD] Error fetching summary:', error);
      return reply.code(500).send({ error: 'Failed to fetch dashboard summary' });
    }
  });

  fastify.post('/api/calls/outbound', createOutboundCall);

  // Zoho webhook - Initiate outbound call
  fastify.post('/zoho-webhook', createOutboundCall);
  
  // TwiML endpoint for outbound calls
  fastify.get('/outbound-call-twiml', async (request, reply) => {
    try {
      const { callId } = request.query;
      
      if (!callId) {
        return reply.code(400).send({ error: 'Missing callId' });
      }

      const pendingContext = getPendingCallContext(callId);
      if (!pendingContext) {
        return reply.code(404).send({ error: 'Call context expired or not found' });
      }
      
      // Update database
      const db = getDatabase();
      db.prepare(`
        UPDATE calls 
        SET answered_at = ? 
        WHERE call_id = ?
      `).run(new Date().toISOString(), callId);
      
      const elevenLabsUrl = await getSignedUrl();
      const sessionId = createStreamSession({
        ...pendingContext,
        elevenLabsUrl,
        callSid: request.query.CallSid || 'unknown'
      });
      deletePendingCallContext(callId);

      // Generate TwiML with Stream. Keep sensitive prompt and signed URLs out of query strings.
      const streamUrl = `wss://${request.hostname}/outbound-media-stream?sessionId=${encodeURIComponent(sessionId)}`;
      
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;
      
      reply.type('text/xml').send(twiml);
      
    } catch (error) {
      console.error('[TWIML] Error:', error);
      return reply.code(500).send({ error: 'Failed to generate TwiML' });
    }
  });
  
  // Inbound call handler
  fastify.post('/inbound-call', async (request, reply) => {
    try {
      const { From, CallSid } = request.body;
      
      const callId = uuidv4();
      const db = getDatabase();
      
      // Use inbound-specific prompt or default
      const promptVersion = getActivePromptVersion(db);
      if (!promptVersion) {
        return reply.code(500).send({ error: 'No active prompt version' });
      }
      
      const injectedPrompt = injectPromptVariables(promptVersion.prompt_text, {
        first_name: 'there',
        lead_notes: 'Inbound call',
        state: 'unknown',
        lead_source: 'inbound'
      });
      
      // Store call
      db.prepare(`
        INSERT INTO calls (
          call_id, call_sid, call_type, phone_number, prompt_version_id, initiated_at, answered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        callId,
        CallSid,
        'inbound',
        From,
        promptVersion.version_id,
        new Date().toISOString(),
        new Date().toISOString()
      );
      
      // Get ElevenLabs URL
      const elevenLabsUrl = await getSignedUrl();
      const sessionId = createStreamSession({
        callId,
        promptVersionId: promptVersion.version_id,
        leadId: 'inbound',
        injectedPrompt,
        elevenLabsUrl,
        callSid: CallSid
      });
      
      // Generate TwiML
      const streamUrl = `wss://${request.hostname}/outbound-media-stream?sessionId=${encodeURIComponent(sessionId)}`;
      
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;
      
      reply.type('text/xml').send(twiml);
      
    } catch (error) {
      console.error('[INBOUND CALL] Error:', error);
      return reply.code(500).send({ error: 'Failed to handle inbound call' });
    }
  });
  
  // Call status callback
  fastify.post('/call-status', async (request, reply) => {
    try {
      const { CallSid, CallStatus, CallDuration } = request.body;
      
      const db = getDatabase();
      
      // Update call status
      db.prepare(`
        UPDATE calls 
        SET call_status = ?,
            call_duration_seconds = ?
        WHERE call_sid = ?
      `).run(CallStatus, CallDuration || null, CallSid);
      
      console.log(`[CALL STATUS] ${CallSid}: ${CallStatus} (${CallDuration}s)`);
      
      return reply.send({ received: true });
    } catch (error) {
      console.error('[CALL STATUS] Error:', error);
      return reply.code(500).send({ error: 'Failed to update call status' });
    }
  });
  
  // Transfer status callback
  fastify.post('/transfer-status', async (request, reply) => {
    try {
      const { DialCallStatus } = request.body;
      const { callId } = request.query;
      
      console.log(`[TRANSFER STATUS] ${callId}: ${DialCallStatus}`);
      
      if (DialCallStatus === 'no-answer' || DialCallStatus === 'busy' || DialCallStatus === 'failed') {
        // Transfer failed - offer callback
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>I'm sorry, our sales specialist isn't available right now. Would you like to leave a callback number?</Say>
  <Record maxLength="30" playBeep="true" />
  <Say>Thank you. We'll call you back as soon as possible.</Say>
  <Hangup />
</Response>`;
        
        return reply.type('text/xml').send(twiml);
      }
      
      // Transfer successful
      return reply.send({ received: true });
      
    } catch (error) {
      console.error('[TRANSFER STATUS] Error:', error);
      return reply.code(500).send({ error: 'Failed to handle transfer status' });
    }
  });
}
