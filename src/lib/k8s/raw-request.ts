import * as http from 'http';
import * as https from 'https';
import type { KubeConfig } from '@kubernetes/client-node';

export const DEFAULT_RAW_REQUEST_TIMEOUT_MS = 30_000;

export interface RawRequestOptions {
  body?: unknown;
  /** Defaults to application/json. Use a patch media type for PATCH. */
  contentType?: string;
  timeoutMs?: number;
}

export interface RawResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

/** Error shaped so `extractK8sError` maps it to the right HTTP status. */
export class RawRequestError extends Error {
  constructor(message: string, public code: number, public body?: unknown) {
    super(message);
    this.name = 'RawRequestError';
  }
}

/** Patch media types the API server accepts for built-in resources. */
export const PATCH_CONTENT_TYPES = [
  'application/strategic-merge-patch+json',
  'application/merge-patch+json',
  'application/json-patch+json',
] as const;

export type PatchContentType = (typeof PATCH_CONTENT_TYPES)[number];

/**
 * Picks the patch media type from a request's Content-Type header.
 * Plain `application/json` (what `fetch` sends by default) and anything
 * unrecognised fall back to `fallback`.
 */
export function resolvePatchContentType(header: string | null | undefined, fallback: PatchContentType): PatchContentType {
  const value = (header || '').split(';')[0].trim().toLowerCase();
  return (PATCH_CONTENT_TYPES as readonly string[]).includes(value) ? (value as PatchContentType) : fallback;
}

/**
 * Pulls a human-readable message out of an API server error body, which is
 * usually a `Status` object but may arrive as a raw JSON string or plain text.
 */
export function messageFromStatusBody(data: unknown, fallback: string): string {
  let parsed = data;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) return fallback;
    try { parsed = JSON.parse(trimmed); } catch { return trimmed.slice(0, 2000); }
  }
  if (parsed && typeof parsed === 'object') {
    const message = (parsed as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

/**
 * Sends one request to the cluster's API server using the context's TLS and
 * auth settings. Used where the typed client cannot express the call (custom
 * resources, patch media types). Never hangs past `timeoutMs`.
 */
export async function k8sRawRequest(
  kc: KubeConfig,
  method: string,
  apiPath: string,
  options: RawRequestOptions = {},
): Promise<RawResponse> {
  const cluster = kc.getCurrentCluster();
  if (!cluster) throw new RawRequestError('Cluster not found in kubeconfig', 404);

  const opts: https.RequestOptions = {};
  await kc.applyToHTTPSOptions(opts);

  // String concatenation keeps any path prefix in the server URL (e.g. Rancher's /k8s/clusters/<id>).
  const urlObj = new URL(`${cluster.server.replace(/\/+$/, '')}${apiPath}`);
  const isHttp = urlObj.protocol === 'http:';
  const reqData = options.body === undefined ? undefined : JSON.stringify(options.body);
  const timeoutMs = options.timeoutMs ?? DEFAULT_RAW_REQUEST_TIMEOUT_MS;

  const headers: Record<string, string | number> = {
    'Content-Type': options.contentType || 'application/json',
    Accept: 'application/json',
    ...(reqData !== undefined ? { 'Content-Length': Buffer.byteLength(reqData) } : {}),
    // Auth headers (bearer token from exec plugins, etc.)
    ...((opts.headers || {}) as Record<string, string>),
  };

  const reqOpts: https.RequestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttp ? 80 : 443),
    path: urlObj.pathname + urlObj.search,
    method,
    headers,
    ca: opts.ca,
    cert: opts.cert,
    key: opts.key,
    auth: opts.auth,
    rejectUnauthorized: !cluster.skipTLSVerify,
    timeout: timeoutMs,
  };

  const transport = isHttp ? http : https;

  return new Promise<RawResponse>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      fn();
    };

    const request = transport.request(reqOpts, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { responseBody += chunk; });
      res.on('end', () => {
        let data: unknown = responseBody;
        try { data = JSON.parse(responseBody); } catch { /* keep raw text */ }
        finish(() => resolve({ status: res.statusCode || 500, data }));
      });
      res.on('error', (err) => finish(() => reject(err)));
    });

    const onTimeout = () => {
      request.destroy();
      finish(() => reject(new RawRequestError(`Kubernetes API request timed out after ${Math.round(timeoutMs / 1000)}s`, 504)));
    };
    // `timeout` on the request only fires on socket inactivity; the hard timer
    // also covers a server that trickles bytes forever.
    request.on('timeout', onTimeout);
    const hardTimer = setTimeout(onTimeout, timeoutMs);

    request.on('error', (err) => finish(() => reject(err)));
    if (reqData !== undefined) request.write(reqData);
    request.end();
  });
}
