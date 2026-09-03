const BASE_URL = '';

/**
 * Requests to a cluster whose API server is unreachable (VPN down, laptop
 * asleep) otherwise hang forever: the spinner never resolves and the user has
 * no way to cancel.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Helm installs, multi-cluster applies and ArgoCD syncs shell out to CLIs with
 * their own multi-minute budgets; the client must not give up first.
 */
export const LONG_RUNNING_TIMEOUT_MS = 180_000;

export interface RequestOptions extends Omit<RequestInit, 'signal'> {
  /** Override the default timeout. Pass 0 to disable it (streaming endpoints). */
  timeoutMs?: number;
  signal?: AbortSignal | null;
}

export class RequestTimeoutError extends Error {
  readonly status = 408;
  constructor(timeoutMs: number) {
    super(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    this.name = 'RequestTimeoutError';
  }
}

/** Combines a caller's signal with the timeout signal. */
function buildSignal(timeoutMs: number, external?: AbortSignal | null) {
  const controller = new AbortController();
  const timer = timeoutMs > 0
    ? setTimeout(() => controller.abort(new RequestTimeoutError(timeoutMs)), timeoutMs)
    : undefined;

  const onExternalAbort = () => controller.abort(external?.reason);
  if (external) {
    if (external.aborted) controller.abort(external.reason);
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
  };
}

async function request<T>(url: string, options?: RequestOptions): Promise<T> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal: externalSignal, headers, ...rest } = options ?? {};
  const { signal, cleanup } = buildSignal(timeoutMs, externalSignal);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${url}`, {
      ...rest,
      headers: { 'Content-Type': 'application/json', ...headers },
      signal,
    });
  } catch (error) {
    if (signal.aborted && signal.reason instanceof RequestTimeoutError) {
      throw signal.reason;
    }
    throw error;
  } finally {
    cleanup();
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    const err = new Error(error.error || 'Request failed') as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export const apiClient = {
  get: <T>(url: string, options?: RequestOptions) => request<T>(url, options),
  put: <T>(url: string, data: unknown, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'PUT', body: JSON.stringify(data) }),
  patch: <T>(url: string, data: unknown, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(url: string, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'DELETE' }),
  post: <T>(url: string, data: unknown, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'POST', body: JSON.stringify(data) }),
};

export function fetcher<T>(url: string): Promise<T> {
  return apiClient.get<T>(url);
}
