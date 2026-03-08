import { describe, expect, it } from 'vitest';
import { getApiBaseUrl } from './config';

describe('getApiBaseUrl', () => {
  it('defaults to localhost', () => {
    expect(getApiBaseUrl(undefined)).toBe('http://localhost:3001');
  });

  it('trims trailing slashes', () => {
    expect(getApiBaseUrl('http://x.test///')).toBe('http://x.test');
  });
});
