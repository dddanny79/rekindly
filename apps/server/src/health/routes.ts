import { Hono } from 'hono';
import { getHealth } from './service';

export const healthRoutes = new Hono().get('/', (c) => c.json(getHealth()));
