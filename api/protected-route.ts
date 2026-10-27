import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleProtectedRoute } from '../src/lib/firebase/protectedRoute';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleProtectedRoute(req, res);
}