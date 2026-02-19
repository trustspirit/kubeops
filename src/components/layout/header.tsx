'use client';

import { useState, useEffect, useRef } from 'react';
import { ThemeToggle } from './theme-toggle';
import { ClusterSelector } from '@/components/clusters/cluster-selector';
import { NamespaceSelector } from '@/components/namespaces/namespace-selector';
import { Button } from '@/components/ui/button';
import { Search, Settings, Download, Sparkles, Loader2, RotateCcw } from 'lucide-react';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { useAutoUpdate, type UpdatePhase } from '@/hooks/use-auto-update';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function UpdateIndicator() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const {
    phase, version, percent, errorMessage, isAvailable,
    checkForUpdates, downloadUpdate, quitAndInstall,
  } = useAutoUpdate();
  const prevPhaseRef = useRef<UpdatePhase>(phase);

  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (prevPhase === phase) return;

    switch (phase) {
      case 'available':
        toast.info(`Update ${version} is available`, {
          description: 'Click the download icon in the header to download.',
          duration: 8000,
        });
        break;
      case 'downloaded':
        toast.success(`Update ${version} is ready to install`, {
          description: 'Click "Restart & Update" to apply.',
          duration: Infinity,
          action: { label: 'Restart & Update', onClick: () => quitAndInstall() },
        });
        break;
      case 'error':
        toast.error('Update check failed', {
          description: errorMessage,
          duration: 5000,
        });
        break;
      case 'not-available':
        if (prevPhase === 'checking') {
          toast.info('You are on the latest version', { duration: 3000 });
        }
        break;
    }
  }, [phase, version, errorMessage, quitAndInstall]);

  if (!mounted || !isAvailable) return null;

  if (phase === 'idle' || phase === 'not-available') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={checkForUpdates}>
            <Sparkles className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Check for updates</TooltipContent>
      </Tooltip>
    );
  }

  if (phase === 'checking') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Checking for updates...</TooltipContent>
      </Tooltip>
    );
  }

  if (phase === 'available') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500" onClick={downloadUpdate}>
            <Download className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Download update {version}</TooltipContent>
      </Tooltip>
    );
  }

  if (phase === 'downloading') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 relative" disabled>
            <Download className="h-4 w-4 animate-pulse text-blue-500" />
            <span className="absolute -bottom-1 text-[9px] font-mono text-blue-500">
              {Math.round(percent)}%
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Downloading update... {Math.round(percent)}%</TooltipContent>
      </Tooltip>
    );
  }

  if (phase === 'downloaded') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-green-500" onClick={quitAndInstall}>
            <RotateCcw className="h-4 w-4" />
            <span className="text-xs">Restart &amp; Update</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Restart to install {version}</TooltipContent>
      </Tooltip>
    );
  }

  if (phase === 'error') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={checkForUpdates}>
            <Sparkles className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Update failed. Click to retry.</TooltipContent>
      </Tooltip>
    );
  }

  return null;
}

export function Header() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="electron-header-inset flex h-14 items-center justify-between border-b px-4 drag-region">
      <div className="flex items-center gap-3 no-drag-region">
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
            <span className="text-xs">&#x2318;</span>K
          </kbd>
        </Button>
        <UpdateIndicator />
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
