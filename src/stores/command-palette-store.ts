import { create } from 'zustand';

interface CommandPaletteState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

/**
 * Shared open state for the command palette.
 *
 * The header used to fake a Cmd+K keypress with a synthetic KeyboardEvent to
 * open it, which only worked because the listener happened to accept metaKey on
 * every platform.
 */
export const useCommandPaletteStore = create<CommandPaletteState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
