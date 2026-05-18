import { v4 as uuidv4 } from 'uuid';

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const pendingCallContexts = new Map();
const streamSessions = new Map();

function expiresAt(ttlMs = DEFAULT_TTL_MS) {
  return Date.now() + ttlMs;
}

function pruneExpired(store) {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (value.expiresAt <= now) {
      store.delete(key);
    }
  }
}

export function savePendingCallContext(callId, context, ttlMs = DEFAULT_TTL_MS) {
  pruneExpired(pendingCallContexts);
  pendingCallContexts.set(callId, {
    ...context,
    expiresAt: expiresAt(ttlMs)
  });
}

export function getPendingCallContext(callId) {
  pruneExpired(pendingCallContexts);
  return pendingCallContexts.get(callId) || null;
}

export function deletePendingCallContext(callId) {
  pendingCallContexts.delete(callId);
}

export function createStreamSession(context, ttlMs = DEFAULT_TTL_MS) {
  pruneExpired(streamSessions);
  const sessionId = uuidv4();
  streamSessions.set(sessionId, {
    ...context,
    expiresAt: expiresAt(ttlMs)
  });
  return sessionId;
}

export function getStreamSession(sessionId) {
  pruneExpired(streamSessions);
  return streamSessions.get(sessionId) || null;
}

export function deleteStreamSession(sessionId) {
  streamSessions.delete(sessionId);
}
