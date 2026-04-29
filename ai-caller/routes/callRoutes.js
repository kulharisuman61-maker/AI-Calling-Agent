import { v4 as uuidv4 } from 'uuid';
import { initiateCall, validateAustralianPhoneNumber } from '../services/twilioService.js';
import { getSignedUrl } from '../services/elevenLabsService.js';
import { injectPromptVariables, getActivePromptVersion } from '../utils/promptInjection.js';
import { getDatabase } from '../database/index.js';

export async function setupCallRoutes(fastify) {
  // Zoho webhook - Initiate outbound call
  fastify.post('/zoho-webhook', async (request, reply) => {
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
      
      // Validation
      if (!phone_number || !lead_id) {
        return reply.code(400).send({ 
          error: 'Missing required fields: phone_number, lead_id' 
        });
      }
      
      // Validate Australian phone number
      if (!validateAustralianPhoneNumber(phone_number)) {
        return reply.code(400).send({ 
          error: 'Invalid Australian phone number format. Expected: +61...' 
        });
      }
      
      // Generate call ID
      const callId = uuidv4();
      
      // Get active prompt version
      const db = getDatabase();
      const promptVersion = getActivePromptVersion(db);
      
      if (!promptVersion) {
        return reply.code(500).send({ error: 'No active prompt version found' });
      }
      
      // Inject variables into prompt
      const variables = {
        first_name: first_name || 'there',
        lead_notes: lead_notes || 'No additional notes',
        state: state || 'unknown',
        lead_source: lead_source || 'unknown'
      };
      
      const injectedPrompt = injectPromptVariables(promptVersion.prompt_text, variables);
      
      // Store call in database
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
        JSON.stringify(additionalFields)
      );
      
      // Get ElevenLabs signed URL
      const elevenLabsUrl = await getSignedUrl();
      
      // Construct webhook URL
      const baseUrl = `${request.protocol}://${request.hostname}`;
      const webhookUrl = `${baseUrl}/outbound-call-twiml?callId=${callId}&promptVersionId=${promptVersion.version_id}&leadId=${lead_id}&injectedPrompt=${encodeURIComponent(injectedPrompt)}&elevenLabsUrl=${encodeURIComponent(elevenLabsUrl)}`;
      
      // Initiate Twilio call
      const call = await initiateCall(phone_number, webhookUrl, callId, promptVersion.version_id, lead_id);
      
      // Update with call_sid
      db.prepare('UPDATE calls SET call_sid = ? WHERE call_id = ?').run(call.sid, callId);
      
      console.log(`[OUTBOUND CALL] Initiated for ${phone_number}, callId: ${callId}`);
      
      return reply.send({
        success: true,
        call_sid: call.sid,
        call_id: callId
      });
      
    } catch (error) {
      console.error('[OUTBOUND CALL] Error:', error);
      return reply.code(500).send({ 
        error: 'Failed to initiate call',
        message: error.message 
      });
    }
  });
  
  // TwiML endpoint for outbound calls
  fastify.get('/outbound-call-twiml', async (request, reply) => {
    try {
      const { callId, promptVersionId, leadId, injectedPrompt, elevenLabsUrl } = request.query;
      
      if (!callId) {
        return reply.code(400).send({ error: 'Missing callId' });
      }
      
      // Update database
      const db = getDatabase();
      db.prepare(`
        UPDATE calls 
        SET answered_at = ? 
        WHERE call_id = ?
      `).run(new Date().toISOString(), callId);
      
      // Generate TwiML with Stream
      const baseUrl = `${request.protocol}://${request.hostname}`;
      const streamUrl = `wss://${request.hostname}/outbound-media-stream?callId=${callId}&promptVersionId=${promptVersionId}&leadId=${leadId}&injectedPrompt=${encodeURIComponent(injectedPrompt)}&elevenLabsUrl=${encodeURIComponent(elevenLabsUrl)}&callSid=${request.query.CallSid || 'unknown'}`;
      
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
      
      // Generate TwiML
      const baseUrl = `${request.protocol}://${request.hostname}`;
      const streamUrl = `wss://${request.hostname}/outbound-media-stream?callId=${callId}&promptVersionId=${promptVersion.version_id}&leadId=inbound&injectedPrompt=${encodeURIComponent(injectedPrompt)}&elevenLabsUrl=${encodeURIComponent(elevenLabsUrl)}&callSid=${CallSid}`;
      
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
