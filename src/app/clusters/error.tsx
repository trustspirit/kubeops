'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Route-level boundary.
 *
 * Without this, a render error anywhere under /clusters escaped to the single
 * app-wide boundary and blanked the whole window; here the chrome survives and
 * the user can retry the segment.
 */
export default function ClustersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[clusters] render error:', error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center" role="alert">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div>
        <h2 className="text-lg font-semibold">This view failed to render</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The rest of KubeOps is still running. Try again, or navigate elsewhere.
        </p>
      </div>
      <details className="max-w-xl text-xs text-muted-foreground">
        <summary className="cursor-pointer">Technical details</summary>
        <code className="mt-1 block break-all text-left">{error.message}</code>
      </details>
      <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
        <RotateCcw className="h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}
