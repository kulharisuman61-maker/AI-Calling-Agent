# Setup Guide - AI Caller System

## Prerequisites

1. **Node.js** v18 or higher
2. **Yarn** package manager
3. **Active Accounts**:
   - Twilio (with Voice API enabled)
   - ElevenLabs (with Conversational AI agent)
   - OpenAI (for prompt optimization)

## Step-by-Step Setup

### 1. Twilio Setup

#### a. Create Twilio Account
1. Go to https://www.twilio.com/
2. Sign up for an account
3. Verify your account

#### b. Get Credentials
1. Go to Console Dashboard
2. Copy **Account SID** and **Auth Token**
3. Note these down for `.env` configuration

#### c. Purchase Australian Phone Number
1. Go to Phone Numbers → Buy a number
2. **Important**: Select **Australia** as country
3. Choose a number with **Voice** capability
4. Purchase the number
5. Copy the phone number (format: +61...)

#### d. Configure Voice Webhooks
1. Go to Phone Numbers → Manage → Active Numbers
2. Click on your purchased number
3. Under **Voice Configuration**:
   - **A Call Comes In**: `HTTP POST` to `https://your-domain.com/inbound-call`
   - **Call Status Changes**: `HTTP POST` to `https://your-domain.com/call-status`
4. Save configuration

#### e. Regional Configuration
1. Go to Account → Advanced Settings
2. Set **Edge Location**: Sydney (for Perth/Australia optimization)

### 2. ElevenLabs Setup

#### a. Create ElevenLabs Account
1. Go to https://elevenlabs.io/
2. Sign up for an account
3. Choose a plan (Conversational AI requires paid plan)

#### b. Get API Key
1. Go to Profile → API Keys
2. Click **Create new key**
3. Copy the API key
4. Store securely for `.env`

#### c. Create Conversational AI Agent
1. Go to Conversational AI section
2. Click **Create New Agent**
3. Configure agent:
   - **Name**: Sales Assistant (or your choice)
   - **Voice**: Choose a friendly professional voice (e.g., Adam, Rachel)
   - **Language**: English (Australian if available)
   - **First Message**: Keep short (e.g., "Hi, how can I help you today?")

#### d. Enable Override Capabilities
1. In agent settings, find **Advanced Settings**
2. Enable **Override Capabilities** (critical!)
3. This allows dynamic prompt injection

#### e. Configure Custom Tools
1. In agent settings, go to **Tools**
2. Add new tool: `transfer_to_sales`
3. Configuration:
   ```json
   {
     "name": "transfer_to_sales",
     "description": "Transfer the call to Sean (sales specialist) when lead shows genuine interest and you have their Australian state",
     "parameters": {
       "type": "object",
       "properties": {
         "reason": {
           "type": "string",
           "description": "Brief reason for transfer"
         },
         "lead_state": {
           "type": "string",
           "description": "Australian state: NSW, VIC, QLD, WA, SA, TAS, ACT, or NT",
           "enum": ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]
         }
       },
       "required": ["lead_state", "reason"]
     }
   }
   ```
4. Save tool configuration

#### f. Copy Agent ID
1. In agent settings, find **Agent ID**
2. Copy this ID for `.env` configuration

### 3. OpenAI Setup

#### a. Create OpenAI Account
1. Go to https://platform.openai.com/
2. Sign up or log in
3. Add payment method (required for API access)

#### b. Get API Key
1. Go to API Keys section
2. Click **Create new secret key**
3. Name it (e.g., "AI Caller RL System")
4. Copy the key immediately (won't be shown again)
5. Store securely for `.env`

### 4. Application Configuration

#### a. Clone/Navigate to Project
```bash
cd /app/ai-caller
```

#### b. Install Dependencies
```bash
yarn install
```

#### c. Configure Environment Variables
Edit `.env` file:

```bash
vim .env
```

Fill in all values:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+61412345678
TWILIO_API_REGION=sydney.au1

# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_AGENT_ID=your_agent_id

# OpenAI Configuration (for RL analysis)
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx

# Sales Team
SALES_TEAM_NUMBER=+61412999888  # Sean's number
SALES_FALLBACK_NUMBER=+61412999777  # Backup number

# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Database
DATABASE_PATH=./database/ai_caller.db

# Monitoring (optional)
ALERT_EMAIL=admin@yourcompany.com
ALERT_PHONE=+61412888999
```

### 5. Make Server Publicly Accessible

Twilio needs to reach your webhooks. Choose one option:

#### Option A: ngrok (for development/testing)
```bash
# Install ngrok
brew install ngrok  # macOS
# or download from https://ngrok.com/

# Start ngrok
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Use this as your base URL for Twilio webhooks
```

#### Option B: Deploy to Cloud (production)
See README.md "Production Deployment" section.

### 6. Update Twilio Webhooks with Public URL

1. Go back to Twilio Console
2. Phone Numbers → Your number
3. Update webhooks:
   - **Incoming**: `https://your-domain.com/inbound-call`
   - **Status**: `https://your-domain.com/call-status`

### 7. Start the Application

```bash
node server.js
```

You should see:
```
[DATABASE] Initialized successfully
[TWILIO] Client initialized for region: sydney.au1
[ELEVENLABS] Prewarmed connection
[SERVER] AI Caller System running on http://0.0.0.0:3000
```

### 8. Test the System

#### Test 1: Health Check
```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "ok" },
    "twilio": { "status": "ok" },
    "elevenlabs": { "status": "ok" },
    "activeCalls": 0
  }
}
```

#### Test 2: Initiate Test Call
```bash
curl -X POST http://localhost:3000/zoho-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Test",
    "lead_notes": "First test call",
    "phone_number": "+61YOUR_TEST_NUMBER",
    "state": "WA",
    "lead_id": "TEST-001",
    "lead_source": "Manual"
  }'
```

Replace `+61YOUR_TEST_NUMBER` with your actual phone number.

You should:
1. Receive a call within 5-10 seconds
2. Hear the AI assistant speak
3. Be able to have a conversation

#### Test 3: Check Database
```bash
sqlite3 database/ai_caller.db "SELECT call_id, phone_number, call_status FROM calls;"
```

### 9. Configure Zoho Webhook (if using Zoho CRM)

1. Go to Zoho CRM → Settings
2. Automation → Workflows
3. Create new workflow:
   - **Module**: Leads
   - **Trigger**: When lead is created or updated
4. Add **Webhook** action:
   - **URL**: `https://your-domain.com/zoho-webhook`
   - **Method**: POST
   - **Body**: Map fields to required format

## Verification Checklist

- [ ] Twilio account created and verified
- [ ] Australian phone number purchased
- [ ] Twilio webhooks configured
- [ ] ElevenLabs account created
- [ ] Conversational AI agent created
- [ ] Override capabilities enabled
- [ ] `transfer_to_sales` tool configured
- [ ] OpenAI API key obtained
- [ ] `.env` file configured with all credentials
- [ ] Server publicly accessible (ngrok or cloud)
- [ ] Application starts without errors
- [ ] Health check returns "healthy"
- [ ] Test call successfully completed
- [ ] Database populated with call data

## Common Issues

### Issue: "Twilio credentials missing"
**Solution**: Verify `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` in `.env`

### Issue: "ElevenLabs signed URL fetch failed"
**Solution**: Check `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID`

### Issue: Call connects but no audio
**Solution**: 
1. Verify ElevenLabs agent has override capabilities enabled
2. Check server logs for audio conversion errors
3. Ensure public URL is accessible via HTTPS (not HTTP)

### Issue: Transfer tool not working
**Solution**: 
1. Verify tool is configured in ElevenLabs agent
2. Check `SALES_TEAM_NUMBER` is set and valid
3. Review server logs for transfer errors

### Issue: Can't access webhooks
**Solution**: 
1. Ensure server is publicly accessible
2. Use HTTPS (Twilio requires HTTPS)
3. Check firewall rules

## Next Steps

Once setup is complete:

1. **Run Test Calls**: Make 5-10 test calls to verify everything works
2. **Manual Review**: Review calls at `/review-dashboard`
3. **Approve Successful Calls**: Rate calls and add notes
4. **Trigger RL Analysis**: Once you have 10+ approved calls
5. **Optimize Prompt**: Generate and test improved prompts

## Support

If you encounter issues:
1. Check server logs for errors
2. Review Twilio console for call logs
3. Check ElevenLabs dashboard for conversation logs
4. Verify all API keys are valid and have sufficient quota

## Security Reminder

- **Never** commit `.env` file to version control
- **Never** share API keys publicly
- Rotate API keys regularly
- Use environment variables in production
- Enable IP whitelisting where possible
