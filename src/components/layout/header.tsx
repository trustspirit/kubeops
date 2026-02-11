'use client';

import { useState } from 'react';
import { ThemeToggle } from './theme-toggle';
import { ClusterSelector } from '@/components/clusters/cluster-selector';
import { NamespaceSelector } from '@/components/namespaces/namespace-selector';
import { Button } from '@/components/ui/button';
import { Search, Settings } from 'lucide-react';
import { SettingsDialog } from '@/components/settings/settings-dialog';

export function Header() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="flex h-14 items-center justify-between border-b px-4 drag-region">
      <div className="flex items-center gap-3 no-drag-region">
        <div className="electron-spacer" />
        <h1 className="text-lg font-bold tracking-tight">KubeOps</h1>
        <ClusterSelector />
        <NamespaceSelector />
      </div>
      <div className="flex items-center gap-2 no-drag-region">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 text-muted-foreground"
          onClick={() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
          }}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="text-xs">Search</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1 font-mono text-[10px] font-medium">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="h-4 w-4" />
        </Button>
        <ThemeToggle />
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  );
}
