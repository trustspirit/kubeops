'use client';

import { Header } from './header';
import { Sidebar } from './sidebar';
import { Breadcrumbs } from './breadcrumbs';
import { CommandPalette } from './command-palette';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-auto">
            <Breadcrumbs />
            {children}
          </main>
          {/* The bottom panel lives in the /clusters layout so it survives cluster switches. */}
        </div>
      </div>
      <CommandPalette />
    </div>
  );
}
