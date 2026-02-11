'use client';

import { Header } from './header';
import { Sidebar } from './sidebar';
import { Breadcrumbs } from './breadcrumbs';
import { CommandPalette } from './command-palette';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Breadcrumbs />
          {children}
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
