const DEFAULT_TAIL_LINES = 100;
const MAX_TAIL_LINES = 10_000;

export function normalizeLogTailLines(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return DEFAULT_TAIL_LINES;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_TAIL_LINES;
  return Math.min(parsed, MAX_TAIL_LINES);
}
