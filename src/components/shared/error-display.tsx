'use client';

import { useState } from 'react';
import { AlertTriangle, RefreshCw, LogIn, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/stores/settings-store';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

interface ErrorDisplayProps {
  error: Error & { status?: number };
  onRetry?: () => void;
  clusterId?: string;
}

export function ErrorDisplay({ error, onRetry, clusterId }: ErrorDisplayProps) {
  const { tshProxyUrl, tshAuthType } = useSettingsStore();
  const [tshLoading, setTshLoading] = useState(false);
  const [kubeLoading, setKubeLoading] = useState(false);

  const isTeleportAuth = error.message?.includes('credentials') ||
                          error.message?.includes('certificate') ||
                          error.message?.includes('unauthorized') ||
                          error.status === 401;

  const tshConfigured = !!tshProxyUrl;

  const handleTshLogin = async () => {
    setTshLoading(true);
    try {
      await apiClient.post('/api/tsh/login', {
        action: 'proxy-login',
        proxyUrl: tshProxyUrl,
        authType: tshAuthType || undefined,
      });
      toast.success('TSH login successful');
      onRetry?.();
    } catch (err: unknown) {
      toast.error(`TSH login failed: ${(err as Error).message}`);
    } finally {
      setTshLoading(false);
    }
  };

  const handleKubeLogin = async () => {
    if (!clusterId) return;
    setKubeLoading(true);
    try {
      await apiClient.post('/api/tsh/login', {
        action: 'kube-login',
        cluster: decodeURIComponent(clusterId),
      });
      toast.success('Kube login successful');
      onRetry?.();
    } catch (err: unknown) {
      toast.error(`Kube login failed: ${(err as Error).message}`);
    } finally {
      setKubeLoading(false);
    }
  };

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
      {isTeleportAuth && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleTshLogin}
            disabled={!tshConfigured || tshLoading}
            className="gap-2"
            title={!tshConfigured ? 'Configure TSH proxy in Settings first' : undefined}
          >
            {tshLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            TSH Login
          </Button>
          {clusterId && (
            <Button
              variant="outline"
              onClick={handleKubeLogin}
              disabled={kubeLoading}
              className="gap-2"
            >
              {kubeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Kube Login
            </Button>
          )}
        </div>
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
