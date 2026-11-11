/**
 * Compact age in the style of `kubectl get`: precise while young, coarse once
 * old. "516d22h" carried an hour nobody needs; that is now "1y151d".
 */
export function formatAge(timestamp: string, now: number = Date.now()): string {
  const created = new Date(timestamp).getTime();
  if (!Number.isFinite(created)) return '-';
  const seconds = Math.max(0, Math.floor((now - created) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 365) {
    const years = Math.floor(days / 365);
    const rest = days % 365;
    return rest > 0 ? `${years}y${rest}d` : `${years}y`;
  }
  if (days >= 2) return `${days}d`;
  if (days === 1) return hours % 24 > 0 ? `1d${hours % 24}h` : '1d';
  if (hours > 0) return minutes % 60 > 0 ? `${hours}h${minutes % 60}m` : `${hours}h`;
  if (minutes > 0) return seconds % 60 > 0 ? `${minutes}m${seconds % 60}s` : `${minutes}m`;
  return `${seconds}s`;
}
