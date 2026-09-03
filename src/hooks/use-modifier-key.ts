'use client';

import { useSyncExternalStore } from 'react';
import { isMacPlatform, modifierKeyLabel } from '@/lib/platform';

const subscribe = () => () => {};

/**
 * The label for the primary shortcut modifier on this machine.
 * Server-renders as the Mac glyph and corrects on hydration, so the markup
 * never mismatches.
 */
export function useModifierKeyLabel(): string {
  return useSyncExternalStore(
    subscribe,
    () => modifierKeyLabel(isMacPlatform(navigator.userAgent, navigator.platform)),
    () => modifierKeyLabel(true),
  );
}
