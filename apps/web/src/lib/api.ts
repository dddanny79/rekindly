import { healthResponseSchema, type HealthResponse } from '@app/shared';

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return healthResponseSchema.parse(await res.json());
}
