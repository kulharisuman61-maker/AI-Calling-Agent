export function injectPromptVariables(promptTemplate, variables) {
  let injectedPrompt = promptTemplate;
  
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    injectedPrompt = injectedPrompt.replace(
      new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      value || ''
    );
  }
  
  return injectedPrompt;
}

export function getActivePromptVersion(db) {
  const stmt = db.prepare('SELECT * FROM prompt_versions WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1');
  return stmt.get();
}

export function updatePromptPerformance(db, versionId, metrics) {
  const stmt = db.prepare(`
    UPDATE prompt_versions 
    SET total_calls = total_calls + 1,
        successful_calls = successful_calls + ?,
        avg_time_to_transfer = ?,
        avg_call_duration = ?,
        transfer_rate = CAST(successful_calls AS REAL) / total_calls
    WHERE version_id = ?
  `);
  
  stmt.run(
    metrics.successful ? 1 : 0,
    metrics.timeToTransfer || null,
    metrics.callDuration || null,
    versionId
  );
}
