/**
 * Dismiss guards for dialogs that run a request.
 *
 * Closing a dialog mid-request leaves the request running with nothing on
 * screen to report its outcome, and reopening it used to reset the pending
 * flag so the same action could be fired twice. While `busy`, Escape and
 * outside clicks are swallowed and programmatic close requests are ignored.
 */

interface PreventableEvent {
  preventDefault(): void;
}

/** Wraps a Radix dismiss handler (`onEscapeKeyDown`, `onInteractOutside`, ...). */
export function preventWhileBusy<E extends PreventableEvent>(
  busy: boolean | undefined,
  handler?: (event: E) => void,
): (event: E) => void {
  return (event: E) => {
    if (busy) event.preventDefault();
    handler?.(event);
  };
}

/** Wraps `onOpenChange` so a close request is dropped while busy. Opening always passes. */
export function guardOpenChange(
  busy: boolean | undefined,
  onOpenChange: (open: boolean) => void,
): (open: boolean) => void {
  return (open: boolean) => {
    if (!open && busy) return;
    onOpenChange(open);
  };
}
