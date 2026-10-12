/**
 * MCP server (Streamable HTTP, stateless): JSON-RPC over POST /mcp, answered as
 * JSON. Authenticated with an API token (`Authorization: Bearer pgt_…`).
 */
import { Hono } from 'hono';
import { APP_NAME } from '@app/shared';
import { bearerToken, validateApiToken } from '../api-tokens/service';
import type { AppEnv, Deps } from '../env';
import { log } from '../lib/log';
import { flushSearchQueue } from '../search/service';
import { APP_VERSION } from '../version';
import { callTool, toolList } from './tools';

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

interface Message {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const INSTRUCTIONS =
  'A personal relationship memory: people the user knows, facts about them, past conversations and follow-ups. Use search_people to find someone, then get_person_briefing before a call or to answer what the user knows about a person. Only spaces the user released for AI are visible.';

export function mcpRoutes({ db, config }: Deps) {
  const app = new Hono<AppEnv>();
  app.post('/', async (c) => {
    // Browsers may only call this from the app itself (DNS rebinding protection).
    const origin = c.req.header('origin');
    if (origin && origin !== config.publicUrl.origin) return c.json({ error: 'forbidden' }, 403);
    const token = bearerToken(c.req.header('authorization'));
    const row = token ? validateApiToken(db, token) : null;
    if (!row) {
      c.header('www-authenticate', 'Bearer realm="mcp"');
      return c.json({ error: 'unauthorized' }, 401);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
        400,
      );
    }
    const ctx = { db, write: row.scope === 'write', publicUrl: config.publicUrl };
    const handle = (msg: Message) => {
      const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id ?? null, result });
      const fail = (code: number, message: string) => ({
        jsonrpc: '2.0',
        id: msg.id ?? null,
        error: { code, message },
      });
      if (msg?.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
        return fail(-32600, 'Invalid request');
      }
      switch (msg.method) {
        case 'initialize': {
          const asked = String(msg.params?.protocolVersion ?? '');
          return reply({
            protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: APP_NAME, version: APP_VERSION },
            instructions: INSTRUCTIONS,
          });
        }
        case 'ping':
          return reply({});
        case 'tools/list':
          return reply({ tools: toolList(ctx.write) });
        case 'tools/call': {
          const result = callTool(ctx, String(msg.params?.name ?? ''), msg.params?.arguments);
          if (ctx.write) flushSearchQueue(db);
          return reply(result);
        }
        default:
          return fail(-32601, `Method not found: ${msg.method}`);
      }
    };
    const run = (msg: Message) => {
      // Notifications (no id) get no answer.
      if (msg && typeof msg === 'object' && msg.id === undefined) return null;
      try {
        return handle(msg);
      } catch (error) {
        log.error('MCP request failed', error);
        return {
          jsonrpc: '2.0',
          id: msg?.id ?? null,
          error: { code: -32603, message: 'Internal error' },
        };
      }
    };
    if (Array.isArray(body)) {
      const answers = body.map((m) => run(m as Message)).filter(Boolean);
      return answers.length ? c.json(answers) : c.body(null, 202);
    }
    const answer = run(body as Message);
    return answer ? c.json(answer) : c.body(null, 202);
  });
  // No server-initiated stream and no sessions.
  app.on(['GET', 'DELETE'], '/', (c) => c.body(null, 405, { allow: 'POST' }));
  return app;
}
