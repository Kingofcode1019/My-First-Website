import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import path from 'path';

dotenv.config();

const app = express();
const REQUESTED_PORT = Number(process.env.PORT) || 3000;
const aiRequestCounts = new Map<string, { count: number; resetAt: number }>();
const AI_RATE_WINDOW_MS = 15 * 60 * 1000;
const AI_RATE_LIMIT = 30;

function isAiRateLimited(request: Request): boolean {
  const forwarded = request.headers['x-forwarded-for'];
  const key = (typeof forwarded === 'string' ? forwarded.split(',')[0] : request.ip) || 'unknown';
  const now = Date.now();
  const current = aiRequestCounts.get(key);
  if (!current || current.resetAt <= now) {
    aiRequestCounts.set(key, { count: 1, resetAt: now + AI_RATE_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > AI_RATE_LIMIT;
}

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '64kb' }));

app.get('/api/protected-route', async (req: Request, res: Response): Promise<void> => {
  try {
    const { handleProtectedRoute } = await import('./src/lib/firebase/protectedRoute');
    await handleProtectedRoute(req, res);
  } catch (error) {
    console.error('Protected Firebase route failed:', error);
    res.status(500).json({ error: 'Protected route is not configured' });
  }
});

app.get('/api/google-sheets/oauth/callback', async (req: Request, res: Response): Promise<void> => {
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const adminUrl = redirectUri
    ? new URL('/admin', redirectUri)
    : new URL('/admin', `${req.protocol}://${req.get('host')}`);
  try {
    if (typeof req.query.error === 'string') throw new Error('Google authorization was cancelled.');
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const { completeGoogleSheetOAuth } = await import('./api/admin/googleSheets');
    await completeGoogleSheetOAuth(code, state);
    adminUrl.searchParams.set('googleSheets', 'connected');
    res.redirect(adminUrl.toString());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Sheets connection failed.';
    console.error('Google Sheets OAuth callback failed:', message);
    adminUrl.searchParams.set('googleSheetsError', message);
    res.redirect(adminUrl.toString());
  }
});

app.all('/api/admin', async (req: Request, res: Response): Promise<void> => {
  try {
    const { default: handleAdmin } = await import('./api/admin/index');
    await handleAdmin(req, res);
  } catch (error) {
    console.error('Admin API failed:', error);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Firebase Admin requires')) {
      res.status(503).json({ error: 'Admin service is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and PLATFORM_OWNER_UID on the server.' });
      return;
    }
    res.status(500).json({ error: 'Admin service is temporarily unavailable' });
  }
});

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;
if (apiKey) {
  aiClient = new GoogleGenAI({ apiKey });
}

// AI Assistant Endpoint
app.post('/api/ai/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    if (isAiRateLimited(req)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }

    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { adminAuth } = await import('./src/lib/firebase/admin');
    try {
      await adminAuth.verifyIdToken(authorization.slice('Bearer '.length).trim(), true);
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { message, history = [], context = {} } = req.body;

    if (!message || typeof message !== 'string' || message.length > 4000) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const safeHistory = Array.isArray(history)
      ? history
          .filter((item) => item && typeof item.content === 'string' && typeof item.role === 'string')
          .slice(-6)
          .map((item) => ({ role: item.role, content: item.content.slice(0, 4000) }))
      : [];

    if (!aiClient) {
      res.status(500).json({
        reply:
          'Gemini API key is not configured in environment variables. Please check GEMINI_API_KEY.',
      });
      return;
    }

    const systemPrompt = `You are "ApexAI", the expert Operations & Business Intelligence Assistant for an e-commerce store operating on the E-Commerce Inventory & Business OS.
You have direct, real-time context about the merchant's business:
Current Context:
- Total Products: ${context.totalProducts || 0}
- Low Stock Products: ${JSON.stringify(context.lowStockProducts || [])}
- Recent Orders: ${JSON.stringify(context.recentOrders || [])}
- Wallets/Accounts: ${JSON.stringify(context.accounts || [])}
- Financial Overview: Revenue: ${context.totalRevenue || 0}, Gross Profit: ${context.totalProfit || 0}, Total Expenses: ${context.totalExpenses || 0}
- Currency: ${context.currency || 'BDT (৳)'}

Capabilities:
1. Answer questions about revenue, profit, low stock items, top selling products, customer order status, and account balances.
2. If the user asks you to perform an action (e.g. "Add an expense of 500 for packing", "Add 20 units of Product X", "Update order status", "Create product"), describe the exact parameters and propose the action in a clear structured JSON tag:
\`\`\`action
{
  "actionType": "createExpense" | "addInventory" | "createProduct" | "updateOrderStatus" | "createIncome",
  "data": { ... }
}
\`\`\`
Guidelines:
- Never invent numbers or give arbitrary guesses. Base answers strictly on the business data provided.
- Keep answers professional, concise, and formatted with markdown bullet points and clear numbers.
- Revenue ≠ Profit, Transfers ≠ Expenses. Always respect proper e-commerce accounting terms.`;

    const contents = [
      ...safeHistory.map((h: { role: string; content: string }) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      })),
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ];

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
      },
    });

    const reply = response.text || 'I processed your request, but received an empty response.';
    res.json({ reply });
  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({
      error: 'Failed to communicate with AI Assistant',
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, port: REQUESTED_PORT, host: '0.0.0.0' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve('dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const listen = (port: number): void => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`Server running on port ${port} (${isDev ? 'development' : 'production'})`);
    });
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.warn(`Port ${port} is already in use; trying ${port + 1}.`);
        listen(port + 1);
        return;
      }
      throw error;
    });
  };

  listen(REQUESTED_PORT);
}

startServer();
