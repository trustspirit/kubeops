'use client';

import { useEffect } from 'react';

export function ElectronClass() {
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronUpdater) {
      document.documentElement.classList.add('electron');
    }
  }, []);
  return null;
}
