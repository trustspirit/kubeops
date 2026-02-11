'use client';

import { ThemeToggle } from './theme-toggle';
import { ClusterSelector } from '@/components/clusters/cluster-selector';
import { NamespaceSelector } from '@/components/namespaces/namespace-selector';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

export function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight">KubeOps</h1>
        <ClusterSelector />
        <NamespaceSelector />
      </div>
      <div className="flex items-center gap-2">
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
        <ThemeToggle />
      </div>
    </header>
  );
}
