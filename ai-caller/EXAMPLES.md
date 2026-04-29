# API Examples & Testing Guide

## Table of Contents
1. [Basic Health Checks](#basic-health-checks)
2. [Call Management](#call-management)
3. [Manual Review System](#manual-review-system)
4. [Prompt Management](#prompt-management)
5. [RL System](#rl-system)
6. [End-to-End Workflow](#end-to-end-workflow)

## Basic Health Checks

### Check Server Status
```bash
curl http://localhost:3001/health | jq
```

**Expected Response:**
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "ok" },
    "twilio": { "status": "ok" },
    "elevenlabs": { "status": "ok" },
    "activeCalls": 0
  },
  "timestamp": "2025-10-13T00:00:00.000Z"
}
```

### Check System Info
```bash
curl http://localhost:3001/ | jq
```

## Call Management

### 1. Initiate Outbound Call (from Zoho)

```bash
curl -X POST http://localhost:3001/zoho-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Sarah",
    "lead_notes": "Interested in solar panel installation. Has a large roof space.",
    "phone_number": "+61412345678",
    "state": "WA",
    "lead_id": "LEAD-2024-001",
    "lead_source": "Website contact form"
  }' | jq
```

**Expected Response:**
```json
{
  "success": true,
  "call_sid": "CA1234567890abcdef1234567890abcdef",
  "call_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 2. Multiple Test Scenarios

#### Scenario A: Lead from Facebook
```bash
curl -X POST http://localhost:3001/zoho-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Michael",
    "lead_notes": "Saw ad on Facebook. Interested in pricing for 6kW system.",
    "phone_number": "+61423456789",
    "state": "NSW",
    "lead_id": "LEAD-2024-002",
    "lead_source": "Facebook Ad"
  }'
```

#### Scenario B: Returning Customer
```bash
curl -X POST http://localhost:3001/zoho-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Jennifer",
    "lead_notes": "Previous customer from 2023. Interested in battery storage.",
    "phone_number": "+61434567890",
    "state": "VIC",
    "lead_id": "LEAD-2024-003",
    "lead_source": "Returning customer"
  }'
```

#### Scenario C: Unknown State
```bash
curl -X POST http://localhost:3001/zoho-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "David",
    "lead_notes": "Interested in commercial installation",
    "phone_number": "+61445678901",
    "state": "unknown",
    "lead_id": "LEAD-2024-004",
    "lead_source": "LinkedIn"
  }'
```

### 3. Invalid Requests (should fail)

#### Missing Required Fields
```bash
curl -X POST http://localhost:3001/zoho-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John"
  }'
```

**Expected Response:**
```json
{
  "error": "Missing required fields: phone_number, lead_id"
}
```

#### Invalid Phone Number
```bash
curl -X POST http://localhost:3001/zoho-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "phone_number": "0412345678",
    "lead_id": "LEAD-001"
  }'
```

**Expected Response:**
```json
{
  "error": "Invalid Australian phone number format. Expected: +61..."
}
```

## Manual Review System

### 1. View Review Dashboard
Open in browser:
```
http://localhost:3001/review-dashboard
```

### 2. Get Pending Reviews (API)
```bash
curl http://localhost:3001/api/review/pending | jq
```

**Expected Response:**
```json
{
  "calls": [
    {
      "call_id": "550e8400-e29b-41d4-a716-446655440000",
      "call_sid": "CA1234...",
      "lead_id": "LEAD-2024-001",
      "phone_number": "+61412345678",
      "call_duration_seconds": 120,
      "transfer_successful": 1,
      "timing_metrics": {...},
      "audio_metrics": {...},
      "conversation_metrics": {...}
    }
  ]
}
```

### 3. Submit Call Review

#### Approve Call
```bash
curl -X POST http://localhost:3001/api/review/submit \
  -H "Content-Type: application/json" \
  -d '{
    "call_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "approved",
    "notes": "Great conversation flow. Lead was engaged and transfer was smooth.",
    "success_score": 0.9
  }' | jq
```

#### Reject Call
```bash
curl -X POST http://localhost:3001/api/review/submit \
  -H "Content-Type: application/json" \
  -d '{
    "call_id": "550e8400-e29b-41d4-a716-446655440001",
    "status": "rejected",
    "notes": "AI was too pushy. Did not respect customer hesitation.",
    "success_score": 0.3
  }' | jq
```

### 4. Get Approved Calls
```bash
curl http://localhost:3001/api/review/approved?limit=20 | jq
```

## Prompt Management

### 1. View All Prompt Versions
```bash
curl http://localhost:3001/api/prompts | jq
```

**Expected Response:**
```json
{
  "prompts": [
    {
      "version_id": "prompt_v1",
      "version_number": 1,
      "prompt_text": "You are a friendly sales assistant...",
      "is_active": 1,
      "total_calls": 50,
      "successful_calls": 40,
      "transfer_rate": 0.8,
      "avg_call_duration": 125.5,
      "performance": {
        "total_calls": 50,
        "successful_transfers": 40,
        "avg_duration": 125.5,
        "transfer_rate": 0.8
      }
    }
  ]
}
```

### 2. Compare Prompt Versions
```bash
curl "http://localhost:3001/api/prompts/compare?v1=prompt_v1&v2=prompt_v2" | jq
```

**Expected Response:**
```json
{
  "version_1": {
    "id": "prompt_v1",
    "total_calls": 50,
    "successful_transfers": 40,
    "transfer_rate": 0.8
  },
  "version_2": {
    "id": "prompt_v2",
    "total_calls": 30,
    "successful_transfers": 27,
    "transfer_rate": 0.9
  },
  "improvement": {
    "transfer_rate": "+10.00%",
    "avg_duration": "-15.2s",
    "success_score": "+0.08"
  }
}
```

### 3. Activate Different Prompt Version
```bash
curl -X POST http://localhost:3001/api/prompts/activate \
  -H "Content-Type: application/json" \
  -d '{
    "version_id": "prompt_v2"
  }' | jq
```

## RL System

### 1. Trigger Analysis (requires 10+ approved calls)
```bash
curl -X POST http://localhost:3001/api/rl/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 20
  }' | jq
```

**Expected Response:**
```json
{
  "success": true,
  "analysis": {
    "analysis": "Key insights: 1) Opening with specific lead notes increases engagement...",
    "modifications": [
      {
        "section": "opening",
        "current": "Hi! How can I help you today?",
        "proposed": "Hi {{first_name}}! I understand you're interested in {{lead_notes}}. How can I help?",
        "rationale": "Personalization in first 10 seconds increases transfer rate by 15%",
        "confidence": 0.85
      }
    ],
    "expected_improvements": {
      "time_to_transfer": "-20 seconds",
      "transfer_rate": "+12%"
    }
  },
  "metrics": {
    "avgTimeToTransfer": 85.5,
    "transferRate": 0.78,
    "avgDuration": 130.2,
    "callsAnalyzed": 20
  }
}
```

### 2. Generate Optimized Prompt
```bash
curl -X POST http://localhost:3001/api/rl/generate-prompt \
  -H "Content-Type: application/json" | jq
```

**Expected Response:**
```json
{
  "success": true,
  "new_prompt": {
    "version_id": "prompt_v2",
    "version_number": 2,
    "prompt_text": "You are a friendly sales assistant...",
    "parent_version_id": "prompt_v1"
  },
  "analysis": {
    "analysis": "...",
    "modifications": [...]
  }
}
```

## End-to-End Workflow

### Complete Testing Workflow

```bash
#!/bin/bash

echo "=== AI Caller System - End-to-End Test ==="
echo ""

# 1. Check health
echo "1. Checking system health..."
curl -s http://localhost:3001/health | jq -r '.status'
echo ""

# 2. Make test call
echo "2. Initiating test call..."
CALL_RESPONSE=$(curl -s -X POST http://localhost:3001/zoho-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "TestUser",
    "lead_notes": "Automated test call",
    "phone_number": "+61412999888",
    "state": "WA",
    "lead_id": "TEST-001",
    "lead_source": "Automated test"
  }')

CALL_ID=$(echo $CALL_RESPONSE | jq -r '.call_id')
echo "Call ID: $CALL_ID"
echo ""

# 3. Wait for call to complete (simulated)
echo "3. Waiting for call to complete..."
sleep 5
echo ""

# 4. Check pending reviews
echo "4. Checking pending reviews..."
curl -s http://localhost:3001/api/review/pending | jq '.calls | length'
echo " calls pending review"
echo ""

# 5. Approve the call (if found)
if [ ! -z "$CALL_ID" ]; then
  echo "5. Approving call $CALL_ID..."
  curl -s -X POST http://localhost:3001/api/review/submit \
    -H "Content-Type: application/json" \
    -d "{
      \"call_id\": \"$CALL_ID\",
      \"status\": \"approved\",
      \"notes\": \"Automated test approval\",
      \"success_score\": 0.8
    }" | jq -r '.success'
  echo ""
fi

# 6. View prompts
echo "6. Viewing prompt versions..."
curl -s http://localhost:3001/api/prompts | jq '.prompts | length'
echo " prompt versions available"
echo ""

echo "=== Test Complete ==="
```

### Manual Testing Checklist

- [ ] Health check returns "healthy" status
- [ ] Can initiate outbound call via /zoho-webhook
- [ ] Review dashboard loads at /review-dashboard
- [ ] Can approve/reject calls via dashboard
- [ ] Prompt versions list shows default prompt_v1
- [ ] RL analysis fails gracefully when <10 approved calls
- [ ] Can compare prompt versions
- [ ] Can activate different prompt versions

### Performance Testing

#### Concurrent Calls Test
```bash
# Test 5 concurrent calls
for i in {1..5}; do
  curl -X POST http://localhost:3001/zoho-webhook \
    -H "Content-Type: application/json" \
    -d "{
      \"first_name\": \"User$i\",
      \"phone_number\": \"+6141200000$i\",
      \"state\": \"WA\",
      \"lead_id\": \"PERF-TEST-$i\"
    }" &
done
wait

echo "5 concurrent calls initiated"
```

#### Load Test (requires ApacheBench)
```bash
# 100 requests, 10 concurrent
ab -n 100 -c 10 -p test_payload.json -T application/json \
  http://localhost:3001/zoho-webhook
```

## Troubleshooting Commands

### Check Active Calls
```bash
curl http://localhost:3001/health | jq '.checks.activeCalls'
```

### View Server Logs
```bash
tail -f /tmp/ai-caller.log
```

### Check Database Stats
```bash
curl http://localhost:3001/api/prompts | jq '.prompts[] | {version: .version_id, calls: .total_calls, transfer_rate: .transfer_rate}'
```

### Test Webhook URL (with ngrok)
```bash
# If using ngrok
NGROK_URL="https://abc123.ngrok.io"
curl -X POST $NGROK_URL/zoho-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Remote",
    "phone_number": "+61412345678",
    "lead_id": "REMOTE-001"
  }'
```

## Production Monitoring

### Daily Health Check Script
```bash
#!/bin/bash
# Save as: daily_check.sh

STATUS=$(curl -s http://localhost:3001/health | jq -r '.status')

if [ "$STATUS" != "healthy" ]; then
  echo "⚠️  System degraded: $STATUS"
  curl -s http://localhost:3001/health | jq '.checks'
  # Send alert email
  mail -s "AI Caller System Alert" admin@yourcompany.com <<< "System status: $STATUS"
else
  echo "✅ System healthy"
fi
```

### Performance Metrics Script
```bash
#!/bin/bash
# Get today's performance

echo "=== Daily Performance Report ==="
echo "Active Calls: $(curl -s http://localhost:3001/health | jq '.checks.activeCalls')"
echo ""
echo "Prompt Performance:"
curl -s http://localhost:3001/api/prompts | jq '.prompts[] | select(.is_active == 1) | {version: .version_id, calls: .total_calls, transfer_rate: .transfer_rate}'
```
