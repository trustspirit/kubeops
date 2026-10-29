const DEFAULT_TAIL_LINES = 100;
const MAX_TAIL_LINES = 10_000;

export function normalizeLogTailLines(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return DEFAULT_TAIL_LINES;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_TAIL_LINES;
  return Math.min(parsed, MAX_TAIL_LINES);
}

/** Lines replayed on reconnect so the gap can be stitched back together. */
export const RESUME_TAIL_LINES = 1_000;
/** Lines shown when a stream starts from scratch (new pod or container). */
export const INITIAL_TAIL_LINES = 500;

export interface LogStreamTarget {
  clusterId: string;
  namespace: string;
  podName: string;
  container: string;
  tailLines: number;
}

/**
 * Path of the follow-mode log WebSocket. Timestamps are always requested: they
 * are what lets a reconnect drop the lines it has already shown.
 *
 * The server does not accept `sinceTime`, so a reconnect replays the last
 * {@link RESUME_TAIL_LINES} lines and {@link LogResumeFilter} removes the overlap.
 */
export function buildLogStreamPath(target: LogStreamTarget): string {
  const query = new URLSearchParams({
    container: target.container,
    follow: 'true',
    timestamps: 'true',
    tailLines: String(target.tailLines),
  });
  return `/ws/logs/${encodeURIComponent(target.clusterId)}/${encodeURIComponent(target.namespace)}/${encodeURIComponent(target.podName)}?${query.toString()}`;
}

const TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})\s/;

/**
 * A sortable key for the RFC3339Nano timestamp the kubelet prefixes to each
 * line. RFC3339Nano trims trailing zeros (`.1Z` vs `.12Z`), so the raw strings
 * do not sort lexically; the fraction is padded to nanoseconds.
 */
export function parseLogTimestampKey(line: string): string | null {
  const match = TIMESTAMP_PATTERN.exec(line);
  if (!match) return null;
  const [, seconds, fraction = '', zone] = match;
  if (zone !== 'Z') {
    const ms = Date.parse(`${seconds}${zone}`);
    if (Number.isNaN(ms)) return null;
    return `${new Date(ms).toISOString().slice(0, 19)}.${fraction.padEnd(9, '0')}`;
  }
  return `${seconds}.${fraction.padEnd(9, '0')}`;
}

export const LOG_GAP_MARKER = '--- reconnected; some lines may be missing ---\n';

/**
 * Stitches a resumed log stream onto what is already on screen.
 *
 * Feed every chunk through {@link process}; it returns only complete lines
 * (a trailing partial line is held until its newline arrives, or until
 * {@link flush}). After {@link beginResume}, replayed lines at or before the
 * last one shown are dropped. If the replay does not reach back that far, a
 * gap marker is inserted so the user knows lines were lost.
 */
export class LogResumeFilter {
  private carry = '';
  private lastKey: string | null = null;
  private linesAtLastKey = new Set<string>();
  private resuming = false;
  private overlapFound = false;

  /** Start fresh (new pod or container): nothing on screen to stitch onto. */
  reset(): void {
    this.carry = '';
    this.lastKey = null;
    this.linesAtLastKey = new Set();
    this.resuming = false;
    this.overlapFound = false;
  }

  /** The next stream replays history that may overlap with what was shown. */
  beginResume(): void {
    this.carry = '';
    this.resuming = this.lastKey !== null;
    this.overlapFound = false;
  }

  get hasHistory(): boolean {
    return this.lastKey !== null;
  }

  process(chunk: string): string {
    if (!chunk) return '';
    const text = this.carry + chunk;
    const lastNewline = text.lastIndexOf('\n');
    if (lastNewline === -1) {
      this.carry = text;
      return '';
    }
    this.carry = text.slice(lastNewline + 1);
    const complete = text.slice(0, lastNewline + 1);
    let out = '';
    for (const line of complete.split(/(?<=\n)/)) {
      out += this.accept(line);
    }
    return out;
  }

  /** Releases a held partial line (idle flush or stream end). */
  flush(): string {
    if (!this.carry) return '';
    const rest = this.carry;
    this.carry = '';
    return this.accept(rest);
  }

  private accept(line: string): string {
    const key = parseLogTimestampKey(line);
    const content = line.endsWith('\n') ? line.slice(0, -1) : line;
    let prefix = '';

    if (this.resuming) {
      if (key !== null && this.lastKey !== null) {
        if (key < this.lastKey || (key === this.lastKey && this.linesAtLastKey.has(content))) {
          this.overlapFound = true;
          return '';
        }
      }
      this.resuming = false;
      if (!this.overlapFound) prefix = LOG_GAP_MARKER;
    }

    if (key !== null) {
      if (this.lastKey === null || key > this.lastKey) {
        this.lastKey = key;
        this.linesAtLastKey = new Set([content]);
      } else if (key === this.lastKey) {
        this.linesAtLastKey.add(content);
      }
    }
    return prefix + line;
  }
}
