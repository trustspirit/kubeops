// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractK8sError(error: any): { status: number; message: string } {
  const raw = error?.statusCode || error?.response?.statusCode || error?.code;
  const status = (typeof raw === 'number' && raw >= 200 && raw <= 599) ? raw : 500;

  let body = error?.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { /* keep as string */ }
  }

  const message = body?.message || error?.message || 'Request failed';
  return { status, message };
}
