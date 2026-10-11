import type { HealthResponse } from '@app/shared';
import { APP_VERSION } from '../version';

export function getHealth(): HealthResponse {
  return { status: 'ok', version: APP_VERSION };
}
