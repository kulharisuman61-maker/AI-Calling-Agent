import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

let twilioClient = null;

export function initTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const region = process.env.TWILIO_API_REGION || 'sydney.au1';
  
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials missing from environment');
  }
  
  twilioClient = twilio(accountSid, authToken, {
    region,
    edge: 'sydney',
    httpClient: {
      timeout: 5000,
      keepAlive: true,
      keepAliveMsecs: 1000
    }
  });
  
  console.log(`[TWILIO] Client initialized for region: ${region}`);
  return twilioClient;
}

export function getTwilioClient() {
  if (!twilioClient) {
    return initTwilioClient();
  }
  return twilioClient;
}

export async function initiateCall(to, webhookUrl, callId, promptVersionId, leadId) {
  const client = getTwilioClient();
  const from = process.env.TWILIO_PHONE_NUMBER;
  
  if (!from) {
    throw new Error('TWILIO_PHONE_NUMBER not set');
  }
  
  try {
    const call = await client.calls.create({
      to,
      from,
      url: webhookUrl,
      statusCallback: `${webhookUrl.split('/outbound-call-twiml')[0]}/call-status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      timeout: 30,
      record: false // ElevenLabs handles recording
    });
    
    console.log(`[TWILIO] Call initiated: ${call.sid} to ${to}`);
    return call;
  } catch (error) {
    console.error('[TWILIO] Error initiating call:', error);
    throw error;
  }
}

export async function transferCall(callSid, transferNumber, transferUrl) {
  const client = getTwilioClient();
  
  try {
    const call = await client.calls(callSid).update({
      twiml: `<Response>
        <Say>Transferring you to our sales specialist now.</Say>
        <Dial timeout="30" action="${transferUrl}">
          <Number>${transferNumber}</Number>
        </Dial>
      </Response>`
    });
    
    console.log(`[TWILIO] Call ${callSid} transferred to ${transferNumber}`);
    return call;
  } catch (error) {
    console.error('[TWILIO] Error transferring call:', error);
    throw error;
  }
}

export async function hangupCall(callSid) {
  const client = getTwilioClient();
  
  try {
    await client.calls(callSid).update({ status: 'completed' });
    console.log(`[TWILIO] Call ${callSid} hung up`);
  } catch (error) {
    console.error('[TWILIO] Error hanging up call:', error);
    throw error;
  }
}

export function validateAustralianPhoneNumber(phoneNumber) {
  // Basic Australian phone number validation
  const cleaned = phoneNumber.replace(/\s+/g, '');
  const australianRegex = /^\+61[2-478]\d{8}$/;
  return australianRegex.test(cleaned);
}
