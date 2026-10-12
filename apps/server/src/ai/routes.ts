import { Hono } from 'hono';
import { aiAskRequestSchema, aiSettingsInputSchema } from '@app/shared';
import type { AppEnv, Deps } from '../env';
import { validate } from '../lib/validate';
import { aiConfig, aiSettings, saveAiSettings } from './config';
import { complete } from './provider';
import { ask, suggestFacts, summarizePerson, type AiContext } from './service';

export function aiRoutes({ db, config, secretKey }: Deps) {
  const ctx = (): AiContext => ({ db, publicUrl: config.publicUrl, key: secretKey() });
  return (
    new Hono<AppEnv>()
      .get('/', (c) => c.json(aiSettings(db)))
      .put('/', validate('json', aiSettingsInputSchema), (c) =>
        c.json(saveAiSettings(db, secretKey(), c.req.valid('json'))),
      )
      // Sends no personal data: only a fixed test prompt.
      .post('/test', async (c) => {
        const reply = await complete(aiConfig(db, secretKey()), {
          system: 'You are a connection test.',
          user: 'Reply with the single word OK.',
          maxTokens: 20,
        });
        return c.json({ reply });
      })
      .post('/people/:id/summary', async (c) =>
        c.json({ text: await summarizePerson(ctx(), c.req.param('id')) }),
      )
      .post('/entries/:id/facts', async (c) =>
        c.json({ suggestions: await suggestFacts(ctx(), c.req.param('id')) }),
      )
      .post('/ask', validate('json', aiAskRequestSchema), async (c) =>
        c.json(await ask(ctx(), c.req.valid('json').question)),
      )
  );
}
