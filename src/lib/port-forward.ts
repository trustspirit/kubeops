import { createServer } from 'node:net';
import {
  isDns1123Subdomain,
  isSafeCliScalar,
  type ValidationResult,
} from './exec-validation';

export interface ValidatedPortForwardRequest {
  clusterId: string;
  namespace: string;
  resourceType: 'pod' | 'service';
  resourceName: string;
  containerPort: number;
  localPort: number;
}

function isPort(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 1
    && value <= 65535;
}

function normalizeResourceType(value: unknown): 'pod' | 'service' | null {
  if (value === undefined || value === 'pod' || value === 'pods') return 'pod';
  if (value === 'svc' || value === 'service' || value === 'services') return 'service';
  return null;
}

export function validatePortForwardRequest(body: unknown): ValidationResult<ValidatedPortForwardRequest> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request body' };
  }

  const input = body as Record<string, unknown>;
  if (!isSafeCliScalar(input.clusterId)) return { ok: false, error: 'Invalid cluster context' };
  if (!isDns1123Subdomain(input.namespace)) return { ok: false, error: 'Invalid namespace' };
  if (!isDns1123Subdomain(input.resourceName)) return { ok: false, error: 'Invalid resource name' };

  const resourceType = normalizeResourceType(input.resourceType);
  if (!resourceType) return { ok: false, error: 'Invalid resource type' };
  if (!isPort(input.containerPort)) return { ok: false, error: 'Invalid container port' };

  const localPort = input.localPort === undefined ? input.containerPort : input.localPort;
  if (!isPort(localPort)) return { ok: false, error: 'Invalid local port' };

  return {
    ok: true,
    value: {
      clusterId: input.clusterId,
      namespace: input.namespace,
      resourceType,
      resourceName: input.resourceName,
      containerPort: input.containerPort,
      localPort,
    },
  };
}

export function createPortForwardId(value: ValidatedPortForwardRequest): string {
  return `${value.clusterId}/${value.namespace}/${value.resourceType}/${value.resourceName}:${value.containerPort}`;
}

function isLoopbackPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port }, () => {
      server.close(error => error ? reject(error) : resolve(true));
    });
  });
}

export async function findAvailableLoopbackPort(preferred: number, reserved: Set<number>): Promise<number> {
  for (let offset = 0; offset < 100; offset += 1) {
    const candidate = ((preferred - 1 + offset) % 65535) + 1;
    if (!reserved.has(candidate) && await isLoopbackPortAvailable(candidate)) return candidate;
  }

  throw new Error('No available local port found');
}
