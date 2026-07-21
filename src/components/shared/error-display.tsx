'use client';

import { useState } from 'react';
import { AlertTriangle, RefreshCw, LogIn, Loader2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDetectProvider, useProviderLogin, useProviderLoginOperations } from '@/hooks/use-auth-providers';
import { toast } from 'sonner';
import { getErrorPresentation } from '@/lib/error-presentation';

interface ErrorDisplayProps {
  error: Error & { status?: number };
  onRetry?: () => void | Promise<unknown>;
  clusterId?: string;
}

export function ErrorDisplay({ error, onRetry, clusterId }: ErrorDisplayProps) {
  const { providerId, kubeCluster } = useDetectProvider(clusterId || null);
  const { login } = useProviderLogin();
  const loginOperations = useProviderLoginOperations();
  const [loading, setLoading] = useState(false);

  const presentation = getErrorPresentation(error.message, error.status);
  const isAuthenticating = presentation.canLogin && (
    loading || loginOperations.some((operation) =>
      operation.scope === 'provider'
        ? !providerId || operation.providerId === providerId
        : Boolean(clusterId && operation.clusterId === clusterId),
    )
  );

  const handleLogin = async () => {
    if (!providerId) return;
    setLoading(true);
    try {
      // Only send tsh-specific action keys to tsh provider
      if (providerId === 'tsh') {
        const extraConfig: Record<string, string> = clusterId
          ? { action: 'kube-login', cluster: kubeCluster || decodeURIComponent(clusterId) }
          : { action: 'proxy-login' };
        await login(providerId, extraConfig, { clusterId });
      } else {
        await login(providerId);
      }
      toast.success('Login successful', { id: `auth-${providerId}` });
      await onRetry?.();
    } catch (err: unknown) {
      toast.error(`Login failed: ${(err as Error).message}`, { id: `auth-${providerId}` });
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticating) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center" role="status" aria-live="polite">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <div>
          <h3 className="text-lg font-semibold">Signing in…</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Waiting for {providerId} authentication. Complete the sign-in in your browser if prompted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <div>
        <h3 className="text-lg font-semibold">
          {presentation.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{presentation.summary}</p>
      </div>
      {presentation.details && (
        <details className="w-full max-w-2xl rounded-md border bg-muted/30 p-3 text-left text-xs">
          <summary className="cursor-pointer text-muted-foreground">Technical details</summary>
          <div className="mt-2 flex items-start gap-2">
            <code className="min-w-0 flex-1 whitespace-pre-wrap break-all">{presentation.details}</code>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="Copy technical details"
              onClick={() => void navigator.clipboard.writeText(presentation.details)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </details>
      )}
      {presentation.canLogin && providerId && (
        <Button
          variant="outline"
          onClick={handleLogin}
          disabled={loading || isAuthenticating}
          className="gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Login ({providerId})
        </Button>
      )}
      {onRetry && (
        <Button variant="outline" onClick={onRetry} disabled={isAuthenticating} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      )}
    </div>
  );
}
