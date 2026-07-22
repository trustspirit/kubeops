const MAX_ERROR_LENGTH = 2000;

function toMessage(value: unknown): string {
  try {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message;
    if (value === null || value === undefined) return '';
    return String(value);
  } catch {
    return '';
  }
}

function redact(message: string): string {
  try {
    return message
      .replace(/"(?:~|\/(?:Users|home|root|tmp|private\/tmp|private\/var\/folders|var\/folders)|[a-z]:\\)[^"]*"|'(?:~|\/(?:Users|home|root|tmp|private\/tmp|private\/var\/folders|var\/folders)|[a-z]:\\)[^']*'/gi, '[redacted-path]')
      .replace(/(?:~|\/(?:Users|home|root|tmp|private\/tmp|private\/var\/folders|var\/folders))\/[^\s:'",;)}\]]+/gi, '[redacted-path]')
      .replace(/[a-z]:\\[^\s:'",;)}\]]+/gi, '[redacted-path]')
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
      .replace(/\b(token|access[_-]?token|id[_-]?token|auth[_-]?token|password|passwd|secret|api[_-]?key|credentials?)\s*([:=])\s*(?:"[^"]*"|'[^']*'|[^\s,;)}\]]+)/gi, '$1$2[redacted]')
      .trim()
      .slice(0, MAX_ERROR_LENGTH);
  } catch {
    return '';
  }
}

/** Removes local-only details from errors before they cross a client boundary. */
export function sanitizeServerError(message: unknown, fallback: string): string {
  try {
    return redact(toMessage(message)) || redact(toMessage(fallback)) || 'Request failed';
  } catch {
    return 'Request failed';
  }
}
