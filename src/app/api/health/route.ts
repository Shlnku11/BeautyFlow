import { defineRoute } from '@/server/http/define-route';
import { connectToDatabase } from '@/server/db/connection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'SYS-01',
  method: 'GET',
  path: '/api/health',
  auth: 'none',
  contextSource: 'NONE',
  handler: async ({ requestId }) => {
    try {
      const mongoose = await connectToDatabase();
      if (mongoose.connection.readyState !== 1) throw new Error('MongoDB connection is not ready');
      return Response.json({ status: 'ok', db: 'up' }, { headers: { 'X-Request-Id': requestId } });
    } catch {
      return Response.json(
        { status: 'unavailable', db: 'down' },
        { status: 503, headers: { 'X-Request-Id': requestId } },
      );
    }
  },
});
