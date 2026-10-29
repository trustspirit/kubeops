import { sanitizeServerError } from '../server-error';

/** Exit code runHelm reports when it stopped waiting for helm (as `timeout(1)` does). */
export const HELM_TIMEOUT_EXIT_CODE = 124;

/**
 * Maps a failed helm invocation to an HTTP status and a client-safe message.
 * All helm stderr goes through sanitizeServerError: it routinely contains
 * local paths (values temp files, cache dirs) and sometimes credentials.
 */
export function classifyHelmError(
  stderr: string,
  code: number,
  fallback: string,
): { status: number; message: string } {
  const message = sanitizeServerError(stderr.replace(/^Error:\s*/i, '').trim(), fallback);
  const text = stderr.toLowerCase();

  if (code === HELM_TIMEOUT_EXIT_CODE) return { status: 504, message };
  if (/another operation \([^)]*\) is in progress/.test(text) || text.includes('another operation is in progress')) {
    return { status: 409, message };
  }
  if (text.includes('cannot re-use a name that is still in use')) return { status: 409, message };
  if (text.includes('has no deployed releases')) return { status: 409, message };
  if (text.includes('kubernetes cluster unreachable')) return { status: 502, message };
  if (/\bnot found\b/.test(text)) return { status: 404, message };
  return { status: 500, message };
}

/** True when helm reports the release itself does not exist. */
export function isReleaseNotFound(stderr: string): boolean {
  return /release:?\s*not found/i.test(stderr);
}

/** Escapes a release name for helm's `--filter` (a Go regexp), anchored to match exactly. */
export function exactReleaseFilter(releaseName: string): string {
  return `^${releaseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
}
