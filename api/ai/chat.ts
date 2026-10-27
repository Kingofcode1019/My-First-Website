import { GoogleGenAI } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminAuth } from '../../src/lib/firebase/admin';

interface ChatRequest {
  message?: unknown;
  history?: unknown;
  context?: unknown;
}

const requestCounts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 30;

function sendJson(response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function getClientKey(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for'];
  return typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : request.socket.remoteAddress || 'unknown';
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const current = requestCounts.get(key);
  if (!current || current.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS;
}

async function readBody(request: IncomingMessage): Promise<ChatRequest> {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk.toString();
    if (raw.length > 64 * 1024) throw new Error('Request too large');
  }
  return JSON.parse(raw || '{}') as ChatRequest;
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  if (isRateLimited(getClientKey(request))) {
    sendJson(response, 429, { error: 'Too many requests' });
    return;
  }

  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    sendJson(response, 401, { error: 'Unauthorized' });
    return;
  }

  try {
    await adminAuth.verifyIdToken(authorization.slice('Bearer '.length).trim(), true);
  } catch {
    sendJson(response, 401, { error: 'Unauthorized' });
    return;
  }

  try {
    const body = await readBody(request);
    if (typeof body.message !== 'string' || body.message.trim().length === 0 || body.message.length > 4000) {
      sendJson(response, 400, { error: 'Message is required' });
      return;
    }

    const history = Array.isArray(body.history)
      ? body.history
          .filter((item): item is { role: string; content: string } => {
            if (!item || typeof item !== 'object') return false;
            const value = item as Record<string, unknown>;
            return typeof value.role === 'string' && typeof value.content === 'string';
          })
          .slice(-6)
          .map((item) => ({ role: item.role, content: item.content.slice(0, 4000) }))
      : [];
    const context = body.context && typeof body.context === 'object' ? body.context as Record<string, unknown> : {};
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      sendJson(response, 503, { error: 'AI service is not configured' });
      return;
    }

    const aiClient = new GoogleGenAI({ apiKey });
    const systemPrompt = `You are Business Manager Operations AI for an inventory and business system. Use only the supplied context. Never invent numbers. Keep responses concise and professional. Context: ${JSON.stringify(context).slice(0, 12000)}`;
    const contents = [
      ...history.map((item) => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }],
      })),
      { role: 'user', parts: [{ text: body.message.trim() }] },
    ];
    const result = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: { systemInstruction: systemPrompt, temperature: 0.3 },
    });

    sendJson(response, 200, { reply: result.text || 'No response was returned.' });
  } catch (error) {
    console.error('AI request failed:', error);
    sendJson(response, 500, { error: 'Failed to communicate with AI Assistant' });
  }
}
