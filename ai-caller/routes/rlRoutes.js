import { 
  analyzeSuccessfulCalls, 
  generateOptimizedPrompt,
  activatePromptVersion,
  getPromptVersionPerformance
} from '../services/rlService.js';
import { getDatabase } from '../database/index.js';

export async function setupRLRoutes(fastify) {
  // Trigger RL analysis
  fastify.post('/api/rl/analyze', async (request, reply) => {
    try {
      const limit = parseInt(request.body.limit) || 20;
      
      console.log(`[RL] Starting analysis of ${limit} calls...`);
      
      const result = await analyzeSuccessfulCalls(limit);
      
      return reply.send({
        success: true,
        analysis: result.analysis,
        metrics: result.metrics
      });
    } catch (error) {
      console.error('[RL] Analysis error:', error);
      return reply.code(500).send({
        error: 'Analysis failed',
        message: error.message
      });
    }
  });
  
  // Generate optimized prompt
  fastify.post('/api/rl/generate-prompt', async (request, reply) => {
    try {
      console.log('[RL] Generating optimized prompt...');
      
      const analysisResult = await analyzeSuccessfulCalls(20);
      const newPrompt = await generateOptimizedPrompt(analysisResult);
      
      return reply.send({
        success: true,
        new_prompt: newPrompt,
        analysis: analysisResult.analysis
      });
    } catch (error) {
      console.error('[RL] Prompt generation error:', error);
      return reply.code(500).send({
        error: 'Prompt generation failed',
        message: error.message
      });
    }
  });
  
  // Get all prompt versions
  fastify.get('/api/prompts', async (request, reply) => {
    try {
      const db = getDatabase();
      const prompts = db.prepare(`
        SELECT * FROM prompt_versions
        ORDER BY version_number DESC
      `).all();
      
      // Get performance for each
      const promptsWithPerformance = prompts.map(prompt => ({
        ...prompt,
        performance: getPromptVersionPerformance(prompt.version_id)
      }));
      
      return reply.send({ prompts: promptsWithPerformance });
    } catch (error) {
      console.error('[RL] Error fetching prompts:', error);
      return reply.code(500).send({ error: 'Failed to fetch prompts' });
    }
  });
  
  // Activate a prompt version
  fastify.post('/api/prompts/activate', async (request, reply) => {
    try {
      const { version_id } = request.body;
      
      if (!version_id) {
        return reply.code(400).send({ error: 'version_id required' });
      }
      
      await activatePromptVersion(version_id);
      
      return reply.send({ success: true, message: `Prompt ${version_id} activated` });
    } catch (error) {
      console.error('[RL] Error activating prompt:', error);
      return reply.code(500).send({ error: 'Failed to activate prompt' });
    }
  });
  
  // Compare two prompt versions
  fastify.get('/api/prompts/compare', async (request, reply) => {
    try {
      const { v1, v2 } = request.query;
      
      if (!v1 || !v2) {
        return reply.code(400).send({ error: 'Both v1 and v2 required' });
      }
      
      const perf1 = getPromptVersionPerformance(v1);
      const perf2 = getPromptVersionPerformance(v2);
      
      const comparison = {
        version_1: { id: v1, ...perf1 },
        version_2: { id: v2, ...perf2 },
        improvement: {
          transfer_rate: ((perf2.transfer_rate - perf1.transfer_rate) * 100).toFixed(2) + '%',
          avg_duration: (perf2.avg_duration - perf1.avg_duration).toFixed(1) + 's',
          success_score: (perf2.avg_success_score - perf1.avg_success_score).toFixed(2)
        }
      };
      
      return reply.send(comparison);
    } catch (error) {
      console.error('[RL] Error comparing prompts:', error);
      return reply.code(500).send({ error: 'Failed to compare prompts' });
    }
  });
}
