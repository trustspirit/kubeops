'use client';

import { useState } from 'react';
import { AlertTriangle, RefreshCw, LogIn, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDetectProvider, useProviderLogin } from '@/hooks/use-auth-providers';
import { toast } from 'sonner';

interface ErrorDisplayProps {
  error: Error & { status?: number };
  onRetry?: () => void;
  clusterId?: string;
}

export function ErrorDisplay({ error, onRetry, clusterId }: ErrorDisplayProps) {
  const { providerId } = useDetectProvider(clusterId || null);
  const { login } = useProviderLogin();
  const [loading, setLoading] = useState(false);

  const isAuthError = error.message?.includes('credentials') ||
                      error.message?.includes('certificate') ||
                      error.message?.includes('unauthorized') ||
                      error.status === 401;

  const handleLogin = async () => {
    if (!providerId) return;
    setLoading(true);
    try {
      // Only send tsh-specific action keys to tsh provider
      if (providerId === 'tsh') {
        const extraConfig: Record<string, string> = clusterId
          ? { action: 'kube-login', cluster: decodeURIComponent(clusterId) }
          : { action: 'proxy-login' };
        await login(providerId, extraConfig);
      } else {
        await login(providerId);
      }
      toast.success('Login successful');
      onRetry?.();
    } catch (err: unknown) {
      toast.error(`Login failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <div>
        <h3 className="text-lg font-semibold">
          {isAuthError ? 'Authentication Required' : 'Error'}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
      </div>
      {isAuthError && providerId && (
        <Button
          variant="outline"
          onClick={handleLogin}
          disabled={loading}
          className="gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Login ({providerId})
        </Button>
      )}
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      )}
    </div>
  );
}
