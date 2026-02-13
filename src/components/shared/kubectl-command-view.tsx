'use client';

import { useState } from 'react';
import { Terminal, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface KubectlCommandViewProps {
  command: string;
  collapsible?: boolean;
  className?: string;
}

export function KubectlCommandView({
  command,
  collapsible = true,
  className,
}: KubectlCommandViewProps) {
  const [expanded, setExpanded] = useState(!collapsible);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = command;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (collapsible) {
    return (
      <div className={cn('rounded-md border', className)}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Terminal className="h-3 w-3" />
          <span>kubectl command</span>
        </button>
        {expanded && (
          <div className="flex items-center gap-2 border-t bg-muted/50 px-3 py-2">
            <code className="flex-1 text-xs font-mono break-all">{command}</code>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2', className)}>
      <Terminal className="h-3 w-3 text-muted-foreground shrink-0" />
      <code className="flex-1 text-xs font-mono break-all">{command}</code>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}
