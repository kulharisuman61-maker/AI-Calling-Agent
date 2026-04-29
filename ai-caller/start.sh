#!/bin/bash
# AI Caller System - Start Script

echo "🚀 Starting AI Caller System..."
echo ""

# Check if .env is configured
if ! grep -q "^TWILIO_ACCOUNT_SID=AC" .env 2>/dev/null; then
    echo "⚠️  WARNING: Twilio credentials not configured in .env"
    echo "   Edit .env and add your Twilio Account SID and Auth Token"
    echo ""
fi

if ! grep -q "^ELEVENLABS_API_KEY=sk" .env 2>/dev/null; then
    echo "⚠️  WARNING: ElevenLabs API key not configured in .env"
    echo "   Edit .env and add your ElevenLabs API key and Agent ID"
    echo ""
fi

if ! grep -q "^OPENAI_API_KEY=sk" .env 2>/dev/null; then
    echo "⚠️  WARNING: OpenAI API key not configured in .env"
    echo "   Edit .env and add your OpenAI API key for RL system"
    echo ""
fi

# Start the server
echo "📞 Starting server on port ${PORT:-3001}..."
node server.js
