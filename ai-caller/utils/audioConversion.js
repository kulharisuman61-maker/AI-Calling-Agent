// Convert mulaw (8kHz) to PCM16 (16kHz)
export function mulawToPcm16(mulawBuffer) {
  const pcm8k = new Int16Array(mulawBuffer.length);
  
  // mulaw decode table
  const MULAW_TABLE = generateMuLawTable();
  
  for (let i = 0; i < mulawBuffer.length; i++) {
    pcm8k[i] = MULAW_TABLE[mulawBuffer[i]];
  }
  
  // Upsample from 8kHz to 16kHz
  return simpleResample(pcm8k, 8000, 16000);
}

// Convert PCM16 (16kHz) to mulaw (8kHz)
export function pcm16ToMulaw(pcm16Buffer) {
  // Downsample from 16kHz to 8kHz
  const pcm8k = simpleResample(pcm16Buffer, 16000, 8000);
  
  // Encode to mulaw
  const mulawBuffer = Buffer.alloc(pcm8k.length);
  for (let i = 0; i < pcm8k.length; i++) {
    mulawBuffer[i] = linearToMulaw(pcm8k[i]);
  }
  
  return mulawBuffer;
}

// Simple resampling function
export function simpleResample(buffer, fromRate, toRate) {
  if (fromRate === toRate) return buffer;
  
  const ratio = fromRate / toRate;
  const newLength = Math.floor(buffer.length / ratio);
  const result = new Int16Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    result[i] = buffer[Math.floor(i * ratio)];
  }
  
  return result;
}

// Generate mulaw decode table
function generateMuLawTable() {
  const table = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    let mulaw = ~i;
    let sign = (mulaw & 0x80);
    let exponent = (mulaw >> 4) & 0x07;
    let mantissa = mulaw & 0x0F;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    if (sign !== 0) sample = -sample;
    table[i] = sample;
  }
  return table;
}

// Linear to mulaw encoding
function linearToMulaw(sample) {
  const MULAW_MAX = 0x1FFF;
  const MULAW_BIAS = 33;
  
  let sign = (sample < 0) ? 0x80 : 0x00;
  if (sign) sample = -sample;
  if (sample > MULAW_MAX) sample = MULAW_MAX;
  
  sample += MULAW_BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1);
  
  let mantissa = (sample >> (exponent + 3)) & 0x0F;
  let mulaw = ~(sign | (exponent << 4) | mantissa);
  
  return mulaw & 0xFF;
}
