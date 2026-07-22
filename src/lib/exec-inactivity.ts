export interface InactiveExecDeadlineInput {
  active: boolean;
  now: number;
  currentDeadline: number | null;
  timeoutMs: number;
}

export function getInactiveExecDeadline(input: InactiveExecDeadlineInput): number | null {
  if (input.active) return null;
  return input.currentDeadline ?? input.now + input.timeoutMs;
}

export interface InactiveExecExpirationInput {
  active: boolean;
  now: number;
  deadline: number | null;
}

export function isInactiveExecExpired(input: InactiveExecExpirationInput): boolean {
  return !input.active && input.deadline !== null && input.now >= input.deadline;
}

export interface InactiveExecActivationInput {
  now: number;
  inactiveDeadline: number | null;
  idleClosed: boolean;
  normalExit: boolean;
}

export function shouldReconnectInactiveExecOnActivation(input: InactiveExecActivationInput): boolean {
  if (input.normalExit) return false;
  return input.idleClosed
    || (input.inactiveDeadline !== null && input.now >= input.inactiveDeadline);
}
