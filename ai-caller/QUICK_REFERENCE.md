# AI Caller System - Quick Reference

## 🚀 Quick Start

```bash
cd /app/ai-caller
./start.sh
# Server runs on http://localhost:3001
```

## 🔑 Environment Setup

Edit `.env` with your credentials:
```env
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+61xxxxx
ELEVENLABS_API_KEY=xxxxx
ELEVENLABS_AGENT_ID=xxxxx
OPENAI_API_KEY=sk-xxxxx
SALES_TEAM_NUMBER=+61xxxxx
```

## 📡 Essential Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Check system status |
| `/zoho-webhook` | POST | Initiate call |
| `/review-dashboard` | GET | Review calls (browser) |
| `/api/prompts` | GET | List prompts |
| `/api/rl/analyze` | POST | Run RL analysis |

## 🧪 Quick Tests

### Health Check
```bash
curl http://localhost:3001/health | jq
```

### Test Call
```bash
curl -X POST http://localhost:3001/zoho-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Test",
    "phone_number": "+61412345678",
    "state": "WA",
    "lead_id": "TEST-001"
  }'
```

### View Prompts
```bash
curl http://localhost:3001/api/prompts | jq '.prompts[] | {version_id, is_active, total_calls}'
```

## 📊 Key Metrics

- **Time to first audio**: Target < 4s (MVP), < 2.5s (production)
- **Transfer rate**: Target > 75% (MVP), > 80% (production)
- **Call duration**: Average 90-120 seconds ideal

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Address in use" error | Change PORT in .env or kill process: `lsof -ti:3001 \| xargs kill` |
| No audio in calls | Check ElevenLabs override capabilities enabled |
| Twilio error | Verify credentials start with `AC` (SID) |
| Transfer fails | Check SALES_TEAM_NUMBER is valid +61 format |
| RL analysis fails | Need 10+ approved calls with score ≥ 0.7 |

## 📁 File Locations

- **Database**: `./database/ai_caller.db`
- **Logs**: Console output (redirect with `> server.log 2>&1`)
- **Config**: `.env`
- **Schema**: `./database/schema.sql`

## 🎯 Workflow

1. **Setup** → Configure .env
2. **Start** → `./start.sh`
3. **Test** → Make 5-10 test calls
4. **Review** → Open `/review-dashboard`
5. **Approve** → Rate successful calls
6. **Analyze** → POST `/api/rl/analyze` (after 10+ approvals)
7. **Optimize** → POST `/api/rl/generate-prompt`
8. **Test** → Compare new vs old prompt
9. **Deploy** → POST `/api/prompts/activate`

## 🔐 Required Accounts

- [Twilio](https://twilio.com) - Voice API
- [ElevenLabs](https://elevenlabs.io) - Conversational AI
- [OpenAI](https://platform.openai.com) - GPT for RL

## 📞 Call Flow

```
Zoho → /zoho-webhook → Twilio → WebSocket → 
Audio Conversion → ElevenLabs → AI Response → 
Transfer Tool → Sales Team → Metrics → Database
```

## 🎨 Prompt Variables

Use in prompt templates:
- `{{first_name}}` - Lead's name
- `{{lead_notes}}` - Notes from CRM
- `{{state}}` - Australian state
- `{{lead_source}}` - Lead origin

Example:
```
Hi {{first_name}}! I see you're in {{state}} and interested in {{lead_notes}}.
```

## ⚡ Performance Tips

1. **Pre-warm connections** (automatic every 30s)
2. **Use Sydney region** for Twilio
3. **Keep first message short** (< 10 words)
4. **Cache ElevenLabs URLs** (automatic 45s)
5. **Monitor active calls** via `/health`

## 🛡️ Safety Rules (Always Required in Prompt)

- Disclose AI when asked
- Respect "not interested"
- No guarantees/promises
- Collect state before transfer
- Transfer complex questions
- No payments/bookings

## 📈 Success Metrics

Track via `/api/prompts`:
- `total_calls` - Total calls made
- `successful_calls` - Transfers completed
- `transfer_rate` - Success percentage
- `avg_call_duration` - Average length
- `avg_time_to_transfer` - Speed to transfer

## 🚨 Critical Alerts

Monitor for:
- CPU > 80%
- 3+ failed calls in 5 min
- Database errors
- ElevenLabs rate limits
- No calls in 30 min (business hours)

## 💻 Commands Cheat Sheet

```bash
# Start server
./start.sh

# Start in background
node server.js > server.log 2>&1 &

# Check if running
curl localhost:3001/health

# View logs
tail -f server.log

# Stop server
pkill -f "node server.js"

# Check database
node -e "const db=require('better-sqlite3')('./database/ai_caller.db');console.log(db.prepare('SELECT COUNT(*) as count FROM calls').get())"
```

## 📱 ElevenLabs Agent Setup

**Required tool configuration:**
```json
{
  "name": "transfer_to_sales",
  "description": "Transfer to sales when interested",
  "parameters": {
    "reason": "string",
    "lead_state": "string (NSW/VIC/QLD/WA/SA/TAS/ACT/NT)"
  }
}
```

**Enable**: Override capabilities in agent settings

## 🌐 Making Server Public

### Development (ngrok)
```bash
ngrok http 3001
# Use HTTPS URL for Twilio webhooks
```

### Production (AWS Sydney)
```bash
# Deploy to ap-southeast-2 region
# Use EC2 t3.medium
# Configure security groups for port 3001
# Use ALB for HTTPS
```

## 📚 Documentation Files

- `README.md` - Full documentation
- `SETUP_GUIDE.md` - Step-by-step setup
- `EXAMPLES.md` - API examples
- `PROJECT_SUMMARY.md` - Project overview
- `QUICK_REFERENCE.md` - This file

## ⏰ Typical Call Timeline

```
0s    - Call initiated (Zoho webhook)
1-2s  - Twilio connects
2-3s  - WebSocket established
3-4s  - First audio to caller ⭐ TARGET
5s+   - Conversation begins
30-90s - Transfer decision
120s  - Average call completion
```

## 🔍 Debug Checklist

1. [ ] Server running? `curl localhost:3001`
2. [ ] Credentials valid? Check .env
3. [ ] Phone format correct? Must be +61
4. [ ] Twilio webhooks set? Check console
5. [ ] ElevenLabs agent ready? Check dashboard
6. [ ] Override capabilities on? Check agent settings
7. [ ] Transfer tool configured? Check agent tools
8. [ ] Database initialized? Check ./database/

## 🎯 MVP Success = 10 Calls

1. Make 10 test calls
2. Review all 10
3. Approve 8+ (with score > 0.7)
4. Run RL analysis
5. Generate new prompt
6. Make 10 more calls with new prompt
7. Compare results
8. Deploy winner

## 💡 Pro Tips

- **Start with known contacts** for testing
- **Monitor first 5 calls closely** via logs
- **Review calls immediately** after testing
- **A/B test everything** before full deployment
- **Track latency obsessively** in first week
- **Document what works** in review notes
- **Iterate prompts quickly** (RL is continuous)

---

**Need Help?**
1. Check logs
2. Review Twilio console
3. Check ElevenLabs dashboard
4. Verify API keys valid
5. See SETUP_GUIDE.md for details
