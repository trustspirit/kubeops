import { NextResponse } from 'next/server';
import { isHelmAvailable, isValidHelmName } from './helm-runner';
import { classifyHelmError } from './errors';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const HELM_NOT_AVAILABLE_MSG = 'Helm CLI is not installed or not found in PATH.';

/** Returns a 503 NextResponse if helm is not available, otherwise null. */
export async function requireHelm(): Promise<NextResponse | null> {
  if (!(await isHelmAvailable())) {
    return NextResponse.json({ error: HELM_NOT_AVAILABLE_MSG }, { status: 503 });
  }
  return null;
}

/** Returns a 400 NextResponse if namespace param is missing, otherwise null. */
export function requireNamespaceParam(namespace: string | null): NextResponse | null {
  if (!namespace) {
    return NextResponse.json({ error: 'namespace query parameter is required' }, { status: 400 });
  }
  return null;
}

/** Returns a 400 NextResponse if the release name is not a valid helm name, otherwise null. */
export function requireReleaseName(releaseName: string): NextResponse | null {
  if (!isValidHelmName(releaseName)) {
    return NextResponse.json(
      { error: 'Invalid release name (alphanumeric, hyphens, dots, underscores; must not start with a symbol)' },
      { status: 400 },
    );
  }
  return null;
}

/** Error response for a failed helm command: mapped status, sanitized stderr. */
export function helmErrorResponse(result: { stderr: string; code: number }, fallback: string): NextResponse {
  const { status, message } = classifyHelmError(result.stderr, result.code, fallback);
  return NextResponse.json({ error: message }, { status });
}

/** Parse helm JSON stdout output. Returns null on failure. */
export function parseHelmJson<T = unknown>(stdout: string): T | null {
  try {
    const trimmed = stdout.trim();
    return trimmed ? JSON.parse(trimmed) : null;
  } catch {
    return null;
  }
}

/** Create a secure temp values file, run callback, then clean up. */
export async function withTempValuesFile<T>(
  values: string | undefined,
  callback: (tmpFilePath: string | null) => Promise<T>,
): Promise<T> {
  let tmpFile: string | null = null;

  try {
    if (values && typeof values === 'string' && values.trim()) {
      tmpFile = path.join(
        os.tmpdir(),
        `kubeops-helm-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`,
      );
      fs.writeFileSync(tmpFile, values, { encoding: 'utf-8', mode: 0o600 });
    }
    return await callback(tmpFile);
  } finally {
    if (tmpFile) {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }
}
