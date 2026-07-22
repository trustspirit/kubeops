const DNS_1123_SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const DNS_1123_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export function isSafeCliScalar(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 1024
    && !value.startsWith('-')
    && !CONTROL_CHARACTER.test(value);
}

export function isDns1123Subdomain(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 253 && DNS_1123_SUBDOMAIN.test(value);
}

export function isDns1123Label(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 63 && DNS_1123_LABEL.test(value);
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ExecTarget {
  clusterId: string;
  namespace: string;
  podName: string;
  container: string;
}

export interface ExecTargetInput {
  clusterId?: unknown;
  namespace?: unknown;
  podName?: unknown;
  container?: unknown;
}

export function validateExecTarget(input: ExecTargetInput): ValidationResult<ExecTarget> {
  if (!isSafeCliScalar(input.clusterId)) return { ok: false, error: 'Invalid cluster context' };
  if (!isDns1123Subdomain(input.namespace)) return { ok: false, error: 'Invalid namespace' };
  if (!isDns1123Subdomain(input.podName)) return { ok: false, error: 'Invalid pod name' };
  if (!isDns1123Label(input.container)) return { ok: false, error: 'Invalid container name' };
  return {
    ok: true,
    value: {
      clusterId: input.clusterId,
      namespace: input.namespace,
      podName: input.podName,
      container: input.container,
    },
  };
}

export function buildKubectlExecArgs(target: ExecTarget): string[] {
  return [
    'exec', '-i', '-t', '--context', target.clusterId, '-n', target.namespace,
    '-c', target.container, target.podName, '--', 'sh', '-c', 'clear; (bash || ash || sh)',
  ];
}
