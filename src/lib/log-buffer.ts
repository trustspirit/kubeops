export interface LogSegment {
  raw: string;
  html: string;
}

export interface LogBufferOptions {
  /** Soft cap on retained raw characters. Oldest segments are dropped first. */
  maxChars: number;
  /**
   * ANSI → HTML conversion. Must produce a self-contained, balanced fragment
   * per call (ansi-to-html closes its open tags on every `toHtml`), which is
   * what makes dropping whole segments from the front safe.
   */
  convert: (raw: string) => string;
}

/**
 * Incremental log buffer for the viewer.
 *
 * The previous implementation re-ran the ANSI parser over the entire retained
 * buffer on every animation frame, so a chatty pod pinned a CPU core. Here each
 * chunk is converted exactly once and the rendered HTML is accumulated, so the
 * per-frame cost is proportional to the *new* output rather than the whole
 * buffer.
 */
export class LogBuffer {
  private segments: LogSegment[] = [];
  private pending = '';
  private rawLength = 0;
  private htmlCache = '';
  private textCache = '';
  private textDirty = false;
  private truncatedFlag = false;

  constructor(private readonly options: LogBufferOptions) {}

  /**
   * Append raw output. Only whole lines are converted; a trailing partial line
   * is held back so ANSI sequences are never split across segments.
   */
  append(chunk: string): void {
    if (!chunk) return;
    this.pending += chunk;

    const lastNewline = this.pending.lastIndexOf('\n');
    if (lastNewline === -1) return;

    const complete = this.pending.slice(0, lastNewline + 1);
    this.pending = this.pending.slice(lastNewline + 1);
    this.pushSegment(complete);
  }

  /** Convert whatever is buffered, including an unterminated final line. */
  flushPending(): void {
    if (!this.pending) return;
    const rest = this.pending;
    this.pending = '';
    this.pushSegment(rest);
  }

  private pushSegment(raw: string): void {
    const html = this.options.convert(raw);
    this.segments.push({ raw, html });
    this.rawLength += raw.length;
    this.htmlCache += html;
    this.textDirty = true;
    this.trim();
  }

  private trim(): void {
    let droppedHtml = 0;
    while (this.segments.length > 1 && this.rawLength > this.options.maxChars) {
      const dropped = this.segments.shift()!;
      this.rawLength -= dropped.raw.length;
      droppedHtml += dropped.html.length;
      this.truncatedFlag = true;
    }
    if (droppedHtml > 0) {
      this.htmlCache = this.htmlCache.slice(droppedHtml);
      this.textDirty = true;
    }
  }

  /** Rendered HTML for everything currently retained. */
  get html(): string {
    return this.htmlCache;
  }

  /** Plain text for everything currently retained (download, search). */
  get text(): string {
    if (this.textDirty) {
      this.textCache = this.segments.map((s) => s.raw).join('');
      this.textDirty = false;
    }
    return this.textCache;
  }

  /** True once output has been dropped from the front. */
  get truncated(): boolean {
    return this.truncatedFlag;
  }

  get length(): number {
    return this.rawLength;
  }

  clear(): void {
    this.segments = [];
    this.pending = '';
    this.rawLength = 0;
    this.htmlCache = '';
    this.textCache = '';
    this.textDirty = false;
    this.truncatedFlag = false;
  }
}
