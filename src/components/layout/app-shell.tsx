'use client';

import { Header } from './header';
import { Sidebar } from './sidebar';
import { Breadcrumbs } from './breadcrumbs';
import { CommandPalette } from './command-palette';
import { BottomPanel } from '@/components/panel/bottom-panel';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-auto">
            <Breadcrumbs />
            {children}
          </main>
          <BottomPanel />
        </div>
      </div>
      <CommandPalette />
    </div>
  );
}
