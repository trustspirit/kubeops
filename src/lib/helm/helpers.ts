import { NextResponse } from 'next/server';
import { isHelmAvailable } from './helm-runner';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const HELM_NOT_AVAILABLE_MSG = 'Helm CLI is not installed or not found in PATH.';

/** Returns a 503 NextResponse if helm is not available, otherwise null. */
export function requireHelm(): NextResponse | null {
  if (!isHelmAvailable()) {
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
