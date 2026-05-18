import { getDatabase } from '../database/index.js';

function parseJsonField(value, fallback = {}) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseLimit(value, defaultValue = 20, maxValue = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
}

export async function setupReviewRoutes(fastify) {
  // Get pending calls for review
  fastify.get('/api/review/pending', async (request, reply) => {
    try {
      const db = getDatabase();
      const calls = db.prepare(`
        SELECT 
          call_id,
          call_sid,
          lead_id,
          phone_number,
          initiated_at,
          ended_at,
          call_duration_seconds,
          timing_metrics,
          audio_metrics,
          conversation_metrics,
          transfer_successful,
          call_status
        FROM calls
        WHERE manual_review_status = 'pending'
        ORDER BY created_at DESC
        LIMIT 50
      `).all();
      
      // Parse JSON fields
      const parsedCalls = calls.map(call => ({
        ...call,
        timing_metrics: parseJsonField(call.timing_metrics),
        audio_metrics: parseJsonField(call.audio_metrics),
        conversation_metrics: parseJsonField(call.conversation_metrics)
      }));
      
      return reply.send({ calls: parsedCalls });
    } catch (error) {
      console.error('[REVIEW] Error fetching pending calls:', error);
      return reply.code(500).send({ error: 'Failed to fetch pending calls' });
    }
  });
  
  // Submit call review
  fastify.post('/api/review/submit', async (request, reply) => {
    try {
      const { call_id, status, notes, success_score } = request.body;
      
      if (!call_id || !status) {
        return reply.code(400).send({ error: 'Missing required fields' });
      }
      
      if (!['approved', 'rejected'].includes(status)) {
        return reply.code(400).send({ error: 'Invalid status' });
      }

      const parsedScore = success_score === undefined || success_score === null || success_score === ''
        ? null
        : Number(success_score);

      if (parsedScore !== null && (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 1)) {
        return reply.code(400).send({ error: 'success_score must be between 0 and 1' });
      }
      
      const db = getDatabase();
      db.prepare(`
        UPDATE calls
        SET manual_review_status = ?,
            manual_review_notes = ?,
            success_score = ?
        WHERE call_id = ?
      `).run(status, notes || null, parsedScore, call_id);
      
      console.log(`[REVIEW] Call ${call_id} reviewed: ${status}`);
      
      return reply.send({ success: true });
    } catch (error) {
      console.error('[REVIEW] Error submitting review:', error);
      return reply.code(500).send({ error: 'Failed to submit review' });
    }
  });
  
  // Get approved calls for RL training
  fastify.get('/api/review/approved', async (request, reply) => {
    try {
      const limit = parseLimit(request.query.limit);
      
      const db = getDatabase();
      const calls = db.prepare(`
        SELECT 
          c.call_id,
          c.conversation_metrics,
          c.timing_metrics,
          c.manual_review_notes,
          c.success_score,
          pv.prompt_text,
          pv.version_number
        FROM calls c
        JOIN prompt_versions pv ON c.prompt_version_id = pv.version_id
        WHERE c.manual_review_status = 'approved'
        AND c.success_score >= 0.7
        ORDER BY c.created_at DESC
        LIMIT ?
      `).all(limit);
      
      const parsedCalls = calls.map(call => ({
        ...call,
        conversation_metrics: parseJsonField(call.conversation_metrics),
        timing_metrics: parseJsonField(call.timing_metrics)
      }));
      
      return reply.send({ calls: parsedCalls });
    } catch (error) {
      console.error('[REVIEW] Error fetching approved calls:', error);
      return reply.code(500).send({ error: 'Failed to fetch approved calls' });
    }
  });
  
  // Simple review dashboard HTML
  fastify.get('/review-dashboard', async (request, reply) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Call Review Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f5f5;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #333; margin-bottom: 30px; }
    .call-card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .call-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 15px;
    }
    .call-id { font-weight: bold; color: #0066cc; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 15px 0;
    }
    .metric {
      padding: 10px;
      background: #f9f9f9;
      border-radius: 4px;
    }
    .metric-label { font-size: 12px; color: #666; }
    .metric-value { font-size: 18px; font-weight: bold; color: #333; }
    .review-form { margin-top: 20px; border-top: 2px solid #eee; padding-top: 20px; }
    textarea {
      width: 100%;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin: 10px 0;
      font-family: inherit;
    }
    .score-input {
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      width: 100px;
    }
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin-right: 10px;
    }
    .btn-approve { background: #28a745; color: white; }
    .btn-reject { background: #dc3545; color: white; }
    .btn-approve:hover { background: #218838; }
    .btn-reject:hover { background: #c82333; }
    .loading { text-align: center; padding: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📞 Call Review Dashboard</h1>
    <div id="calls-container" class="loading">Loading calls...</div>
  </div>

  <script>
    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[char]));
    }

    async function loadCalls() {
      try {
        const response = await fetch('/api/review/pending');
        const data = await response.json();
        
        const container = document.getElementById('calls-container');
        
        if (data.calls.length === 0) {
          container.innerHTML = '<p>No pending calls to review.</p>';
          return;
        }
        
        container.innerHTML = data.calls.map(call => {
          const duration = call.call_duration_seconds || 0;
          const transferred = call.transfer_successful ? '✅ Yes' : '❌ No';
          const callId = escapeHtml(call.call_id);
          const leadId = escapeHtml(call.lead_id || 'unknown');
          const phone = escapeHtml(call.phone_number || 'unknown');
          const status = escapeHtml(call.call_status || 'unknown');
          
          return \`
            <div class="call-card" id="call-\${callId}">
              <div class="call-header">
                <div>
                  <div class="call-id">Call ID: \${callId}</div>
                  <div>Lead: \${leadId}</div>
                  <div>Phone: \${phone}</div>
                </div>
                <div>
                  <div>Status: \${status}</div>
                  <div>Duration: \${duration}s</div>
                </div>
              </div>
              
              <div class="metrics">
                <div class="metric">
                  <div class="metric-label">Messages</div>
                  <div class="metric-value">\${call.conversation_metrics.messageCount || 0}</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Transferred</div>
                  <div class="metric-value">\${transferred}</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Audio Chunks Sent</div>
                  <div class="metric-value">\${call.audio_metrics.audioChunksSent || 0}</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Interruptions</div>
                  <div class="metric-value">\${call.conversation_metrics.interruptionCount || 0}</div>
                </div>
              </div>
              
              <div class="review-form">
                <label>Success Score (0.0 - 1.0):</label>
                <input type="number" class="score-input" id="score-\${callId}" 
                       min="0" max="1" step="0.1" value="0.5" />
                <br><br>
                <label>Review Notes:</label>
                <textarea id="notes-\${callId}" rows="3" 
                          placeholder="Add any observations about this call..."></textarea>
                <button class="btn-approve" onclick="submitReview('\${callId}', 'approved')">✅ Approve</button>
                <button class="btn-reject" onclick="submitReview('\${callId}', 'rejected')">❌ Reject</button>
              </div>
            </div>
          \`;
        }).join('');
      } catch (error) {
        console.error('Error loading calls:', error);
        document.getElementById('calls-container').innerHTML = '<p>Error loading calls.</p>';
      }
    }
    
    async function submitReview(callId, status) {
      const notes = document.getElementById(\`notes-\${callId}\`).value;
      const score = parseFloat(document.getElementById(\`score-\${callId}\`).value);
      
      try {
        const response = await fetch('/api/review/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ call_id: callId, status, notes, success_score: score })
        });
        
        if (response.ok) {
          document.getElementById(\`call-\${callId}\`).remove();
          alert(\`Call \${status}!\`);
          
          // Reload if no more calls
          if (document.querySelectorAll('.call-card').length === 0) {
            loadCalls();
          }
        } else {
          alert('Failed to submit review');
        }
      } catch (error) {
        console.error('Error submitting review:', error);
        alert('Error submitting review');
      }
    }
    
    // Load calls on page load
    loadCalls();
  </script>
</body>
</html>
    `;
    
    return reply.type('text/html').send(html);
  });
}
