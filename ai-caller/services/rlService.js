import OpenAI from 'openai';
import { getDatabase } from '../database/index.js';
import dotenv from 'dotenv';

dotenv.config();

let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not set in environment');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// Safety constraints that must always be present
const REQUIRED_CONSTRAINTS = [
  'disclose AI when asked',
  'respect customer\'s not interested',
  'cannot make guarantees',
  'collect Australian state before transfer',
  'transfer complex questions to human',
  'cannot process payments',
  'cannot make bookings'
];

export async function analyzeSuccessfulCalls(limit = 20) {
  const db = getDatabase();
  
  // Get approved successful calls
  const calls = db.prepare(`
    SELECT 
      c.call_id,
      c.conversation_metrics,
      c.timing_metrics,
      c.manual_review_notes,
      c.success_score,
      c.call_duration_seconds,
      c.transfer_successful,
      pv.prompt_text,
      pv.version_number
    FROM calls c
    JOIN prompt_versions pv ON c.prompt_version_id = pv.version_id
    WHERE c.manual_review_status = 'approved'
    AND c.success_score >= 0.7
    ORDER BY c.created_at DESC
    LIMIT ?
  `).all(limit);
  
  if (calls.length < 10) {
    throw new Error(`Not enough approved calls for analysis. Need at least 10, have ${calls.length}`);
  }
  
  // Get current active prompt
  const currentPrompt = db.prepare(
    'SELECT * FROM prompt_versions WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
  ).get();
  
  if (!currentPrompt) {
    throw new Error('No active prompt version found');
  }
  
  // Prepare data for LLM analysis
  const callData = calls.map(call => ({
    call_id: call.call_id,
    success_score: call.success_score,
    duration: call.call_duration_seconds,
    transferred: call.transfer_successful === 1,
    messages: JSON.parse(call.conversation_metrics || '{}').messageCount || 0,
    interruptions: JSON.parse(call.conversation_metrics || '{}').interruptionCount || 0,
    review_notes: call.manual_review_notes,
    timing: JSON.parse(call.timing_metrics || '{}')
  }));
  
  // Calculate metrics
  const avgTimeToTransfer = callData
    .filter(c => c.transferred)
    .reduce((sum, c) => {
      const initiated = new Date(c.timing.callInitiated || 0).getTime();
      const transferred = new Date(c.timing.transferInitiated || 0).getTime();
      return sum + (transferred - initiated) / 1000;
    }, 0) / callData.filter(c => c.transferred).length || 0;
  
  const transferRate = callData.filter(c => c.transferred).length / callData.length;
  const avgDuration = callData.reduce((sum, c) => sum + (c.duration || 0), 0) / callData.length;
  
  // Build analysis prompt for GPT
  const analysisPrompt = `You are an expert AI prompt engineer specializing in conversational AI for sales.

# Context
You're analyzing successful sales call data to optimize the system prompt for an AI caller.

# Current Prompt
${currentPrompt.prompt_text}

# Current Performance Metrics
- Average time to transfer: ${avgTimeToTransfer.toFixed(1)}s
- Transfer success rate: ${(transferRate * 100).toFixed(1)}%
- Average call duration: ${avgDuration.toFixed(1)}s
- Total successful calls analyzed: ${calls.length}

# Successful Call Data
${JSON.stringify(callData, null, 2)}

# Success Metrics to Optimize For
1. Time to transfer (target: < 90 seconds)
2. Transfer success rate (target: > 80%)
3. Natural conversation flow
4. Handling objections effectively
5. State collection accuracy

# Task
Analyze the successful calls and suggest improvements to the system prompt. Focus on:
- Patterns that led to successful transfers
- Conversation techniques that kept leads engaged
- Areas where the AI could be more efficient
- Phrases or approaches that worked well

# Safety Constraints (MUST ALWAYS BE PRESENT)
The prompt MUST include these safety rules:
- Must disclose AI nature when asked
- Must respect when customer says not interested
- Cannot make guarantees about products/services
- Must collect Australian state before transfer
- Must transfer complex questions to human
- Cannot process payments or make bookings

# Output Format
Provide your analysis as JSON:
{
  "analysis": "3-5 key insights from the data",
  "modifications": [
    {
      "section": "opening|middle|closing|rules",
      "current": "exact current text",
      "proposed": "improved text",
      "rationale": "why this change",
      "confidence": 0.0-1.0
    }
  ],
  "expected_improvements": {
    "time_to_transfer": "estimated change in seconds",
    "transfer_rate": "estimated percentage change"
  }
}`;
  
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an expert prompt engineer for conversational AI systems.' },
        { role: 'user', content: analysisPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7
    });
    
    const analysis = JSON.parse(response.choices[0].message.content);
    
    console.log('[RL] Analysis completed:', analysis);
    
    return {
      analysis,
      currentPrompt,
      metrics: {
        avgTimeToTransfer,
        transferRate,
        avgDuration,
        callsAnalyzed: calls.length
      }
    };
  } catch (error) {
    console.error('[RL] Error analyzing calls:', error);
    throw error;
  }
}

export function applyModifications(currentPrompt, modifications) {
  let newPrompt = currentPrompt;
  
  for (const mod of modifications) {
    if (mod.confidence >= 0.7) {
      newPrompt = newPrompt.replace(mod.current, mod.proposed);
    }
  }
  
  return newPrompt;
}

export function validatePromptSafety(promptText) {
  const missing = [];
  
  // Check for safety constraints (basic keyword matching)
  const lowerPrompt = promptText.toLowerCase();
  
  if (!lowerPrompt.includes('ai') && !lowerPrompt.includes('honest')) {
    missing.push('AI disclosure');
  }
  
  if (!lowerPrompt.includes('not interested') && !lowerPrompt.includes('respect')) {
    missing.push('respect customer rejection');
  }
  
  if (!lowerPrompt.includes('state') && !lowerPrompt.includes('location')) {
    missing.push('state collection');
  }
  
  if (!lowerPrompt.includes('never') || !lowerPrompt.includes('cannot')) {
    missing.push('restriction statements');
  }
  
  if (missing.length > 0) {
    throw new Error(`Prompt missing safety constraints: ${missing.join(', ')}`);
  }
  
  return true;
}

export async function generateOptimizedPrompt(analysisResult) {
  const db = getDatabase();
  const { analysis, currentPrompt } = analysisResult;
  
  // Apply modifications
  let newPromptText = applyModifications(
    currentPrompt.prompt_text,
    analysis.modifications || []
  );
  
  // Validate safety
  try {
    validatePromptSafety(newPromptText);
  } catch (error) {
    console.error('[RL] Safety validation failed:', error);
    throw error;
  }
  
  // Create new prompt version
  const versionId = `prompt_v${currentPrompt.version_number + 1}`;
  const versionNumber = currentPrompt.version_number + 1;
  
  db.prepare(`
    INSERT INTO prompt_versions (
      version_id, version_number, prompt_text, created_by, parent_version_id, is_active
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    versionId,
    versionNumber,
    newPromptText,
    'rl_system',
    currentPrompt.version_id,
    0 // Not active yet - will be activated after A/B testing
  );
  
  console.log(`[RL] Created new prompt version: ${versionId}`);
  
  return {
    version_id: versionId,
    version_number: versionNumber,
    prompt_text: newPromptText,
    parent_version_id: currentPrompt.version_id
  };
}

export async function activatePromptVersion(versionId) {
  const db = getDatabase();
  
  // Deactivate all other versions
  db.prepare('UPDATE prompt_versions SET is_active = 0').run();
  
  // Activate the new version
  db.prepare('UPDATE prompt_versions SET is_active = 1 WHERE version_id = ?').run(versionId);
  
  console.log(`[RL] Activated prompt version: ${versionId}`);
}

export function getPromptVersionPerformance(versionId) {
  const db = getDatabase();
  
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_calls,
      SUM(CASE WHEN transfer_successful = 1 THEN 1 ELSE 0 END) as successful_transfers,
      AVG(call_duration_seconds) as avg_duration,
      AVG(success_score) as avg_success_score
    FROM calls
    WHERE prompt_version_id = ?
  `).get(versionId);
  
  return {
    ...stats,
    transfer_rate: stats.total_calls > 0 ? stats.successful_transfers / stats.total_calls : 0
  };
}
