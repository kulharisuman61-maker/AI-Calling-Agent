import { CallMetrics } from '../utils/callMetrics.js';
import { mulawToPcm16, pcm16ToMulaw } from '../utils/audioConversion.js';
import { createElevenLabsConnection, buildConversationConfig } from '../services/elevenLabsService.js';
import { transferCall, hangupCall } from '../services/twilioService.js';
import { getDatabase } from '../database/index.js';

const activeStreams = new Map();

export function handleMediaStream(connection, request) {
  const { callId, promptVersionId, leadId, injectedPrompt, callSid } = request.query;
  
  if (!callId || !promptVersionId || !injectedPrompt) {
    console.error('[MEDIA STREAM] Missing required parameters');
    connection.close();
    return;
  }
  
  const metrics = new CallMetrics(callId);
  metrics.addTimestamp('websocketConnected');
  
  let streamSid = null;
  let elevenLabsWs = null;
  let elevenLabsReady = false;
  let audioBuffer = [];
  let reconnectAttempts = 0;
  
  console.log(`[MEDIA STREAM] Started for call ${callId}`);
  
  // Store active stream
  activeStreams.set(callId, { connection, metrics, callSid });
  
  // Handle Twilio WebSocket messages
  connection.on('message', async (message) => {
    try {
      const msg = JSON.parse(message);
      
      switch (msg.event) {
        case 'start':
          metrics.addTimestamp('streamStarted');
          streamSid = msg.streamSid;
          console.log(`[MEDIA STREAM] Stream started: ${streamSid}`);
          
          // Connect to ElevenLabs
          await connectToElevenLabs(injectedPrompt);
          break;
          
        case 'media':
          if (msg.media && msg.media.payload) {
            metrics.incrementAudioChunksReceived();
            
            // Decode from base64 and convert mulaw to PCM16
            const mulawData = Buffer.from(msg.media.payload, 'base64');
            const pcm16Data = mulawToPcm16(mulawData);
            
            // Send to ElevenLabs if ready
            if (elevenLabsWs && elevenLabsReady) {
              const base64Audio = Buffer.from(pcm16Data.buffer).toString('base64');
              elevenLabsWs.send(JSON.stringify({
                user_audio_chunk: base64Audio
              }));
            }
          }
          break;
          
        case 'stop':
          metrics.addTimestamp('callEnded');
          console.log(`[MEDIA STREAM] Stream stopped: ${streamSid}`);
          cleanup();
          break;
      }
    } catch (error) {
      console.error('[MEDIA STREAM] Error processing message:', error);
      metrics.addError('twilio_message', error.message);
    }
  });
  
  async function connectToElevenLabs(prompt) {
    try {
      const signedUrl = request.query.elevenLabsUrl; // Passed from route
      elevenLabsWs = createElevenLabsConnection(signedUrl);
      metrics.addTimestamp('elevenLabsConnected');
      
      elevenLabsWs.on('open', () => {
        console.log('[ELEVENLABS] WebSocket connected');
        
        // Send conversation config
        const config = buildConversationConfig(prompt);
        elevenLabsWs.send(JSON.stringify(config));
        metrics.addTimestamp('configSent');
      });
      
      elevenLabsWs.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          
          switch (message.type) {
            case 'conversation_initiation_metadata':
              elevenLabsReady = true;
              console.log('[ELEVENLABS] Conversation ready');
              
              // Flush buffered audio
              if (audioBuffer.length > 0) {
                audioBuffer.forEach(chunk => {
                  elevenLabsWs.send(JSON.stringify({ user_audio_chunk: chunk }));
                });
                audioBuffer = [];
              }
              break;
              
            case 'audio':
              if (message.audio_event && message.audio_event.audio_base_64) {
                if (metrics.timestamps.firstAudioGenerated === undefined) {
                  metrics.addTimestamp('firstAudioGenerated');
                }
                
                // Convert PCM16 to mulaw for Twilio
                const pcm16Buffer = Buffer.from(message.audio_event.audio_base_64, 'base64');
                const pcm16Array = new Int16Array(pcm16Buffer.buffer, pcm16Buffer.byteOffset, pcm16Buffer.length / 2);
                const mulawBuffer = pcm16ToMulaw(pcm16Array);
                const base64Mulaw = mulawBuffer.toString('base64');
                
                // Send to Twilio
                connection.send(JSON.stringify({
                  event: 'media',
                  streamSid,
                  media: {
                    payload: base64Mulaw
                  }
                }));
                
                if (metrics.timestamps.firstAudioSentToTwilio === undefined) {
                  metrics.addTimestamp('firstAudioSentToTwilio');
                }
                
                metrics.incrementAudioChunksSent();
                metrics.setFirstChunkSize(mulawBuffer.length);
              }
              break;
              
            case 'interruption':
              metrics.addInterruption();
              // Clear Twilio's audio buffer
              connection.send(JSON.stringify({
                event: 'clear',
                streamSid
              }));
              break;
              
            case 'agent_response':
              metrics.incrementMessages();
              break;
              
            case 'tool_call':
              handleToolCall(message);
              break;
              
            case 'ping':
              elevenLabsWs.send(JSON.stringify({ type: 'pong' }));
              break;
          }
        } catch (error) {
          console.error('[ELEVENLABS] Error processing message:', error);
          metrics.addError('elevenlabs_message', error.message);
        }
      });
      
      elevenLabsWs.on('error', (error) => {
        console.error('[ELEVENLABS] WebSocket error:', error);
        metrics.addError('elevenlabs_websocket', error.message);
        
        // Fallback: send error message via Twilio TTS
        if (reconnectAttempts < 3) {
          setTimeout(() => {
            reconnectAttempts++;
            connectToElevenLabs(prompt);
          }, 1000 * reconnectAttempts);
        }
      });
      
      elevenLabsWs.on('close', () => {
        console.log('[ELEVENLABS] WebSocket closed');
        elevenLabsReady = false;
      });
      
    } catch (error) {
      console.error('[ELEVENLABS] Connection error:', error);
      metrics.addError('elevenlabs_connection', error.message);
    }
  }
  
  function handleToolCall(message) {
    if (!message.tool_call) return;
    
    const { tool_name, parameters } = message.tool_call;
    console.log(`[TOOL CALL] ${tool_name}:`, parameters);
    
    metrics.addToolCall(tool_name, parameters);
    
    if (tool_name === 'transfer_to_sales') {
      metrics.addTimestamp('transferInitiated');
      const state = parameters.lead_state || parameters.state;
      const reason = parameters.reason || 'Lead interested';
      
      // Validate state
      const validStates = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
      if (!state || !validStates.includes(state.toUpperCase())) {
        console.error('[TOOL CALL] Invalid or missing state:', state);
        // ElevenLabs should handle this, but log for metrics
      }
      
      // Initiate transfer
      const transferNumber = process.env.SALES_TEAM_NUMBER;
      const baseUrl = `${request.headers['x-forwarded-proto'] || 'http'}://${request.headers.host}`;
      const transferUrl = `${baseUrl}/transfer-status?callId=${callId}`;
      
      transferCall(callSid, transferNumber, transferUrl)
        .then(() => {
          metrics.addTimestamp('transferCompleted');
          console.log(`[TOOL CALL] Transfer successful for ${callId}`);
          
          // Update database
          const db = getDatabase();
          db.prepare('UPDATE calls SET transfer_successful = 1 WHERE call_id = ?').run(callId);
        })
        .catch((error) => {
          console.error('[TOOL CALL] Transfer failed:', error);
          metrics.addError('transfer', error.message);
        });
    } else if (tool_name === 'end_call' || tool_name === 'hangup') {
      hangupCall(callSid).catch(err => console.error('[TOOL CALL] Hangup error:', err));
    }
  }
  
  function cleanup() {
    if (elevenLabsWs) {
      elevenLabsWs.close();
    }
    
    // Save metrics to database
    try {
      const db = getDatabase();
      const allMetrics = metrics.getAllMetrics();
      
      db.prepare(`
        UPDATE calls 
        SET timing_metrics = ?,
            audio_metrics = ?,
            conversation_metrics = ?,
            ended_at = ?
        WHERE call_id = ?
      `).run(
        JSON.stringify(allMetrics.timing),
        JSON.stringify(allMetrics.audio),
        JSON.stringify(allMetrics.conversation),
        new Date().toISOString(),
        callId
      );
      
      console.log(`[MEDIA STREAM] Metrics saved for ${callId}`);
    } catch (error) {
      console.error('[MEDIA STREAM] Error saving metrics:', error);
    }
    
    activeStreams.delete(callId);
  }
  
  connection.on('close', cleanup);
  connection.on('error', (error) => {
    console.error('[MEDIA STREAM] Connection error:', error);
    metrics.addError('twilio_connection', error.message);
    cleanup();
  });
}

export function getActiveStreams() {
  return activeStreams;
}
