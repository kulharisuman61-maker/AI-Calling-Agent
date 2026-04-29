import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

let cachedSignedUrl = null;
let cacheExpiry = null;

export async function getSignedUrl() {
  const now = Date.now();
  
  // Return cached URL if still valid (45 second cache)
  if (cachedSignedUrl && cacheExpiry && now < cacheExpiry) {
    console.log('[ELEVENLABS] Using cached signed URL');
    return cachedSignedUrl;
  }
  
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  
  if (!apiKey || !agentId) {
    throw new Error('ElevenLabs credentials missing from environment');
  }
  
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    cachedSignedUrl = data.signed_url;
    cacheExpiry = now + 40000; // Cache for 40 seconds (5 second buffer)
    
    console.log('[ELEVENLABS] Signed URL fetched and cached');
    return cachedSignedUrl;
  } catch (error) {
    console.error('[ELEVENLABS] Error fetching signed URL:', error);
    throw error;
  }
}

export function createElevenLabsConnection(signedUrl) {
  return new WebSocket(signedUrl);
}

export function buildConversationConfig(injectedPrompt) {
  return {
    type: 'conversation_initiation_client_data',
    conversation_config_override: {
      agent: {
        prompt: {
          prompt: injectedPrompt
        },
        first_message: "Hi! How can I help you today?",
        language: "en"
      },
      tts: {
        model_id: "eleven_turbo_v2_5",
        voice_id: "pNInz6obpgDQGcFmaJgB", // Adam voice - change as needed
        optimization_mode: "latency",
        stability: 0.3,
        similarity_boost: 0.4,
        use_speaker_boost: false,
        output_format: "pcm_16000",
        stream_chunk_size: 128,
        enable_ssml_parsing: false
      },
      asr: {
        quality: "high",
        provider: "elevenlabs"
      }
    }
  };
}

// Pre-warm connections on startup
export async function prewarmElevenLabs() {
  try {
    await getSignedUrl();
    console.log('[ELEVENLABS] Prewarmed connection');
  } catch (error) {
    console.error('[ELEVENLABS] Prewarm failed:', error);
  }
}
