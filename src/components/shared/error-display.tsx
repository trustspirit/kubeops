'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorDisplayProps {
  error: Error & { status?: number };
  onRetry?: () => void;
}

export function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  const isTeleportAuth = error.message?.includes('credentials') ||
                          error.message?.includes('certificate') ||
                          error.message?.includes('unauthorized') ||
                          error.status === 401;

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <div>
        <h3 className="text-lg font-semibold">
          {isTeleportAuth ? 'Authentication Required' : 'Error'}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
        {isTeleportAuth && (
          <p className="mt-2 rounded-md bg-muted p-3 font-mono text-sm">
            tsh kube login &lt;cluster-name&gt;
          </p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      )}
    </div>
  );
}
