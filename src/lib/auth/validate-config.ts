/**
 * Validate and sanitize auth provider config from untrusted input.
 * Ensures all values are strings with reasonable length limits.
 */
export function validateConfig(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Config must be a plain object');
  }
  const config: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string' || key.length > 64) continue;
    if (typeof value !== 'string') continue;
    if (value.length > 1024) {
      throw new Error(`Config value for "${key}" exceeds max length (1024)`);
    }
    config[key] = value;
  }
  return config;
}
