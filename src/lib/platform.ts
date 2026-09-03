/**
 * Platform detection for keyboard-shortcut labels.
 *
 * The command palette accepts Cmd *or* Ctrl, but the hint next to the search
 * box was hardcoded to the Mac glyph, so Windows and Linux users were told to
 * press a key their keyboard does not have.
 */
export function isMacPlatform(userAgent: string | undefined, platform?: string): boolean {
  const haystack = `${platform ?? ''} ${userAgent ?? ''}`;
  return /mac|iphone|ipad|ipod/i.test(haystack);
}

/** "⌘" on Apple platforms, "Ctrl" elsewhere. */
export function modifierKeyLabel(isMac: boolean): string {
  return isMac ? '⌘' : 'Ctrl';
}
