# AI Caller System - MVP

Low-latency AI calling system integrating Twilio and ElevenLabs Conversational AI with reinforcement learning-based prompt optimization.

## Features

### Core Functionality (MVP)
- ✅ Outbound call initiation via Zoho webhook
- ✅ Inbound call handling
- ✅ Real-time audio streaming (Twilio ↔ ElevenLabs)
- ✅ Audio format conversion (mulaw 8kHz ↔ PCM16 16kHz)
- ✅ Call transfer to sales team
- ✅ Dynamic prompt injection with variables
- ✅ Comprehensive metrics tracking (timing, audio, conversation)
- ✅ SQLite database for persistent storage
- ✅ Manual call review dashboard
- ✅ OpenAI GPT-powered prompt optimization (RL)
- ✅ Prompt versioning and A/B testing framework

## Quick Start

### 1. Install Dependencies
```bash
cd /app/ai-caller
yarn install
```

### 2. Configure Environment
Edit `.env` file with your credentials:
```env
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+61xxxxxxxxx

# ElevenLabs
ELEVENLABS_API_KEY=your_api_key
ELEVENLABS_AGENT_ID=your_agent_id

# OpenAI (for RL)
OPENAI_API_KEY=sk-xxxxx

# Sales Team
SALES_TEAM_NUMBER=+61xxxxxxxxx
```

### 3. Initialize Database
Database is automatically initialized on first run.

### 4. Start Server
```bash
node server.js
```

Server will start on `http://localhost:3000`

## Architecture

```
Zoho CRM Webhook
      ↓
  Fastify Server
      ↓
  Twilio Voice API (Sydney Region)
      ↓
  WebSocket Media Stream
      ↓
  Audio Conversion (mulaw ↔ PCM16)
      ↓
  ElevenLabs Conversational AI
      ↓
  Call Metrics & Database
      ↓
  Manual Review → RL Analysis → Prompt Optimization
```

## API Endpoints

### Call Management

#### POST /zoho-webhook
Initiate outbound call from Zoho CRM.

**Request Body:**
```json
{
  "first_name": "John",
  "lead_notes": "Interested in solar panels",
  "phone_number": "+61412345678",
  "state": "WA",
  "lead_id": "LEAD-123",
  "lead_source": "Website"
}
```

**Response:**
```json
{
  "success": true,
  "call_sid": "CAxxxxx",
  "call_id": "uuid"
}
```

#### POST /inbound-call
Twilio webhook for incoming calls.

#### POST /call-status
Twilio status callback for call events.

#### POST /transfer-status
Handles transfer success/failure and implements fallback logic.

### Review & RL System

#### GET /review-dashboard
Web interface for manual call review.

#### GET /api/review/pending
Fetch calls pending manual review.

#### POST /api/review/submit
Submit review for a call.

**Request Body:**
```json
{
  "call_id": "uuid",
  "status": "approved",
  "notes": "Great conversation flow",
  "success_score": 0.85
}
```

#### POST /api/rl/analyze
Trigger RL analysis on approved calls (requires 10+ approved calls).

#### POST /api/rl/generate-prompt
Generate optimized prompt based on successful calls.

#### GET /api/prompts
List all prompt versions with performance metrics.

#### POST /api/prompts/activate
Activate a specific prompt version.

**Request Body:**
```json
{
  "version_id": "prompt_v2"
}
```

#### GET /api/prompts/compare?v1=prompt_v1&v2=prompt_v2
Compare performance of two prompt versions.

### System

#### GET /health
Health check with system status.

**Response:**
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "ok" },
    "twilio": { "status": "ok" },
    "elevenlabs": { "status": "ok" },
    "activeCalls": 2
  }
}
```

## Database Schema

### calls
Stores all call data with comprehensive metrics.

**Key Fields:**
- `call_id` (primary key)
- `call_sid` (Twilio call SID)
- `lead_id` (Zoho lead ID)
- `call_type` (outbound/inbound)
- `prompt_version_id` (which prompt was used)
- `timing_metrics` (JSON: all timestamps)
- `audio_metrics` (JSON: chunks, duration)
- `conversation_metrics` (JSON: messages, interruptions, tool calls)
- `manual_review_status` (pending/approved/rejected)
- `success_score` (0.0 - 1.0)

### prompt_versions
Tracks prompt evolution and performance.

**Key Fields:**
- `version_id` (e.g., prompt_v1)
- `version_number` (incremental)
- `prompt_text` (full prompt template)
- `total_calls`, `successful_calls`, `transfer_rate`
- `created_by` (manual/rl_system)
- `is_active` (boolean)

## Prompt System

### Variable Injection
Prompts use `{{variable_name}}` syntax for dynamic content.

**Available Variables:**
- `{{first_name}}` - Lead's first name
- `{{lead_notes}}` - Notes about the lead
- `{{state}}` - Australian state
- `{{lead_source}}` - Where lead came from

**Example Prompt:**
```
You are a friendly sales assistant calling {{first_name}} in {{state}}, Australia.
{{lead_notes}}

Your goal is to understand their needs and transfer interested leads to our sales specialist.

IMPORTANT RULES:
- Be honest if asked if you're an AI
- Respect if customer says not interested
- Collect the Australian state before transfer
- Never make guarantees or process payments
```

### Prompt Optimization Workflow

1. **Manual Review** (10-20 calls)
   - Listen to calls via review dashboard
   - Rate success (0.0 - 1.0)
   - Add notes on what worked/didn't work

2. **RL Analysis** (trigger when ready)
   - POST to `/api/rl/analyze`
   - GPT analyzes approved calls with score ≥ 0.7
   - Identifies patterns and suggests improvements

3. **Generate New Prompt**
   - POST to `/api/rl/generate-prompt`
   - System creates new prompt version
   - Safety constraints validated

4. **A/B Testing** (manual for MVP)
   - Activate new prompt: POST `/api/prompts/activate`
   - Run 20-50 calls
   - Compare metrics: GET `/api/prompts/compare?v1=prompt_v1&v2=prompt_v2`

5. **Deploy Best Performer**
   - If new version outperforms by >10%, keep it
   - Otherwise, rollback to previous version

## Metrics Tracked

### Timing Metrics
- `callInitiated` - When Zoho webhook received
- `websocketConnected` - Twilio WS connected
- `streamStarted` - Stream event received
- `elevenLabsConnected` - EL WS opened
- `configSent` - Config sent to ElevenLabs
- `firstAudioGenerated` - First audio from EL
- `firstAudioSentToTwilio` - First audio to caller
- `transferInitiated` - Transfer tool called
- `transferCompleted` - Transfer succeeded
- `callEnded` - Call disconnected

### Audio Metrics
- `audioChunksSent` - Chunks sent to Twilio
- `audioChunksReceived` - Chunks from Twilio
- `firstChunkSize` - Size of first audio chunk
- `totalAudioDuration` - Total audio seconds

### Conversation Metrics
- `messageCount` - AI responses
- `interruptionCount` - User interruptions
- `toolCallsMade` - Array of tool calls

## Performance Targets

### MVP Success Criteria
- ✅ Time to first audio: < 4 seconds
- 🎯 Transfer success rate: > 75%
- 🎯 Call completion rate: > 90%
- 🎯 System uptime: > 99%

### Production Ready
- Time to first audio: < 2.5 seconds
- Transfer success rate: > 80%
- Zero data loss over 1000 calls
- 99.5% uptime over 1 month

## Latency Optimization

### Implemented
1. **Sydney Region** - Twilio configured for sydney.au1
2. **Connection Pre-warming** - ElevenLabs URLs cached (45s)
3. **Latency-optimized TTS**:
   - `eleven_turbo_v2_5` model
   - Stability: 0.3, Similarity: 0.4
   - Stream chunk size: 128
   - SSML parsing disabled
4. **Efficient Audio Conversion** - Simple resampling algorithm

### Future Optimizations
- Redis caching for common responses
- Predictive caching based on call flow
- WebSocket connection pooling

## ElevenLabs Agent Configuration

Your ElevenLabs agent MUST have these tools configured:

### transfer_to_sales Tool
```json
{
  "name": "transfer_to_sales",
  "description": "Transfer the call to Sean (sales specialist) when lead shows interest",
  "parameters": {
    "type": "object",
    "properties": {
      "reason": {
        "type": "string",
        "description": "Why transfer is happening"
      },
      "lead_state": {
        "type": "string",
        "description": "Australian state (NSW/VIC/QLD/WA/SA/TAS/ACT/NT)"
      }
    },
    "required": ["lead_state"]
  }
}
```

## Testing

### Test Outbound Call
```bash
curl -X POST http://localhost:3000/zoho-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "lead_notes": "Test call",
    "phone_number": "+61412345678",
    "state": "WA",
    "lead_id": "TEST-001",
    "lead_source": "Manual test"
  }'
```

### Check Health
```bash
curl http://localhost:3000/health
```

### View Pending Reviews
```bash
open http://localhost:3000/review-dashboard
```

### Trigger RL Analysis
```bash
curl -X POST http://localhost:3000/api/rl/analyze \
  -H "Content-Type: application/json" \
  -d '{"limit": 20}'
```

## Troubleshooting

### Calls Not Connecting
1. Check Twilio credentials in `.env`
2. Verify phone numbers are in E.164 format (+61...)
3. Check Twilio console for error logs
4. Verify webhook URLs are publicly accessible

### No Audio / Poor Quality
1. Check ElevenLabs API key and agent ID
2. Verify agent has override capabilities enabled
3. Check network latency to ElevenLabs
4. Review audio conversion logs

### Transfers Failing
1. Verify `SALES_TEAM_NUMBER` is set
2. Check transfer number is valid and reachable
3. Review `/transfer-status` logs
4. Ensure ElevenLabs agent has `transfer_to_sales` tool

### RL System Not Working
1. Verify `OPENAI_API_KEY` is set
2. Ensure at least 10 approved calls with score ≥ 0.7
3. Check OpenAI API quota/limits
4. Review console logs for errors

## Development Roadmap

### Phase 1: MVP (✅ Complete)
- Basic outbound/inbound calls
- Twilio + ElevenLabs integration
- Audio conversion
- Call metrics
- Database storage
- Manual review interface
- RL prompt optimization

### Phase 2: Optimization (Next)
- Implement A/B testing automation
- Add Redis caching
- Improve latency monitoring
- Add more detailed analytics

### Phase 3: Scale (Future)
- Multi-region deployment
- Load balancing for concurrent calls
- Advanced transfer routing
- Real-time analytics dashboard
- Webhook retry logic
- Call recording storage

### Phase 4: Advanced Features (Future)
- Sentiment analysis
- Predictive lead scoring
- Multi-language support
- Voice cloning
- Integration with more CRMs

## Production Deployment

### Recommended: AWS Sydney (ap-southeast-2)

1. **EC2 Instance**: t3.medium (2 vCPU, 4GB RAM)
2. **Load Balancer**: For webhook reliability
3. **RDS**: For production database (optional - SQLite works for MVP)
4. **CloudWatch**: Monitoring and alerts

### Deployment Steps
```bash
# On EC2 instance
git clone <repo>
cd ai-caller
yarn install

# Configure production .env
vim .env

# Use PM2 for process management
npm install -g pm2
pm2 start server.js --name ai-caller
pm2 save
pm2 startup
```

### Environment Variables for Production
```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
```

## Security Considerations

1. **API Keys**: Never commit `.env` file
2. **Webhook Validation**: Verify Twilio requests (future)
3. **Rate Limiting**: Implement for public endpoints
4. **Database**: Use proper access controls
5. **Logging**: Sanitize sensitive data in logs

## Support & Monitoring

### Key Metrics to Monitor
- Active call count
- Average time to first audio
- Transfer success rate
- Error rates by type
- Database size growth

### Alerts to Configure
- Server CPU > 80%
- 3+ failed calls in 5 minutes
- Database connection failures
- ElevenLabs API rate limits
- No calls in 30 minutes (during business hours)

## License

View-only proprietary license. This repository is provided for viewing only.
Downloading, copying, installing, running, using, modifying, distributing, or
creating derivative works is not permitted without prior written permission.

## Contact

For issues or questions, contact the development team.
