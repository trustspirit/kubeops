function parseBody(body: unknown): unknown {
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return body; }
  }
  return body;
}

/**
 * Normalises errors from @kubernetes/client-node (1.x ApiException: HTTP
 * status in `.code`, body as a JSON string) and older/raw shapes
 * (`.statusCode`, `.response.statusCode`, parsed body) into status + message.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractK8sError(error: any): { status: number; message: string } {
  const raw = error?.statusCode || error?.response?.statusCode || error?.code;
  const status = (typeof raw === 'number' && raw >= 200 && raw <= 599) ? raw : 500;

  const body = parseBody(error?.body) as { message?: unknown } | string | undefined;
  const bodyMessage = body && typeof body === 'object' && typeof body.message === 'string' ? body.message : undefined;

  const message = bodyMessage || error?.message || 'Request failed';
  return { status, message };
}

/**
 * True when a 404 means "this named object does not exist" rather than "this
 * resource type / API path does not exist". Only the former makes a delete
 * idempotently successful.
 *
 * `body` is the API server's Status object (parsed or as a JSON string).
 */
export function isObjectNotFound(status: number, body: unknown, name: string | undefined): boolean {
  if (status !== 404 || !name) return false;
  const parsed = parseBody(body) as { reason?: string; details?: { name?: string } } | undefined;
  if (!parsed || typeof parsed !== 'object') return false;
  return parsed.reason === 'NotFound' && parsed.details?.name === name;
}
