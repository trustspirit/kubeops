const BASE_RECONNECT_MS = 500;
const MAX_RECONNECT_MS = 10_000;

export function getReconnectDelay(attempt: number, random = Math.random()): number {
  const base = Math.min(BASE_RECONNECT_MS * 2 ** Math.max(0, attempt), MAX_RECONNECT_MS);
  const jitter = 0.8 + Math.min(1, Math.max(0, random)) * 0.4;
  return Math.round(base * jitter);
}

export interface RetryDecisionInput {
  intentional: boolean;
  normalExit: boolean;
  attempt: number;
  maxAttempts: number;
}

export function canRetryStream(input: RetryDecisionInput): boolean {
  return !input.intentional && !input.normalExit && input.attempt < input.maxAttempts;
}

export interface ScrollPosition {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export function isNearScrollBottom(position: ScrollPosition, threshold = 24): boolean {
  return position.scrollHeight - position.clientHeight - position.scrollTop <= threshold;
}
