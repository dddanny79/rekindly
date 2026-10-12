import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

const problems = (env: NodeJS.ProcessEnv) => {
  try {
    loadConfig(env);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).problems;
  }
};

describe('loadConfig', () => {
  it('has development defaults', () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.publicUrl.origin).toBe('http://localhost:3000');
    expect(config.dataDir).toMatch(/apps\/server\/data$/);
    expect(config.trustProxy).toBe(false);
    expect(config.logLevel).toBe('info');
  });

  it('requires PUBLIC_URL in production and uses /data', () => {
    expect(problems({ NODE_ENV: 'production' })).toEqual([
      expect.stringContaining('PUBLIC_URL is required'),
    ]);
    const config = loadConfig({
      NODE_ENV: 'production',
      PUBLIC_URL: 'https://people.example.com',
      TRUST_PROXY: 'true',
      LOG_LEVEL: 'DEBUG',
      TZ: 'Europe/Berlin',
    });
    expect(config.dataDir).toBe('/data');
    expect(config.publicUrl.origin).toBe('https://people.example.com');
    expect(config.trustProxy).toBe(true);
    expect(config.logLevel).toBe('debug');
  });

  it('lists every invalid value at once', () => {
    const list = problems({
      PORT: 'abc',
      PUBLIC_URL: 'ftp://example.com',
      TRUST_PROXY: 'yes',
      LOG_LEVEL: 'verbose',
      TZ: 'Mars/Olympus',
    });
    expect(list).toHaveLength(5);
    expect(list.join('\n')).toMatch(/PORT.*PUBLIC_URL.*TRUST_PROXY.*LOG_LEVEL.*TZ/s);
    expect(new ConfigError(list).message).toContain('  - PORT must be a number');
  });
});
