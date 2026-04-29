export class CallMetrics {
  constructor(callId) {
    this.callId = callId;
    this.timestamps = {};
    this.audioMetrics = {
      audioChunksSent: 0,
      audioChunksReceived: 0,
      firstChunkSize: 0,
      totalAudioDuration: 0,
      silenceDetected: 0
    };
    this.conversationMetrics = {
      messageCount: 0,
      averageResponseTime: 0,
      interruptionCount: 0,
      toolCallsMade: [],
      conversationSentiment: null
    };
    this.errors = [];
  }

  addTimestamp(event) {
    this.timestamps[event] = new Date().toISOString();
  }

  incrementAudioChunksSent() {
    this.audioMetrics.audioChunksSent++;
  }

  incrementAudioChunksReceived() {
    this.audioMetrics.audioChunksReceived++;
  }

  setFirstChunkSize(size) {
    if (this.audioMetrics.firstChunkSize === 0) {
      this.audioMetrics.firstChunkSize = size;
    }
  }

  addAudioDuration(seconds) {
    this.audioMetrics.totalAudioDuration += seconds;
  }

  incrementMessages() {
    this.conversationMetrics.messageCount++;
  }

  addInterruption() {
    this.conversationMetrics.interruptionCount++;
  }

  addToolCall(toolName, params) {
    this.conversationMetrics.toolCallsMade.push({
      tool: toolName,
      params,
      timestamp: new Date().toISOString()
    });
  }

  addError(source, message) {
    this.errors.push({
      source,
      message,
      timestamp: new Date().toISOString()
    });
  }

  getTimingMetrics() {
    return this.timestamps;
  }

  getAudioMetrics() {
    return this.audioMetrics;
  }

  getConversationMetrics() {
    return this.conversationMetrics;
  }

  getErrors() {
    return this.errors;
  }

  getAllMetrics() {
    return {
      timing: this.timestamps,
      audio: this.audioMetrics,
      conversation: this.conversationMetrics,
      errors: this.errors
    };
  }
}
