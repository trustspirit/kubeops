'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useHelmReleaseDetail } from '@/hooks/use-helm-release-detail';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { HelmUpgradeDialog } from '@/components/helm/helm-upgrade-dialog';
import { HelmRollbackDialog } from '@/components/helm/helm-rollback-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient, fetcher } from '@/lib/api-client';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
  ArrowLeft,
  Trash2,
  ArrowUpCircle,
  RotateCcw,
  Ship,
  Loader2,
  Clock,
  FileText,
} from 'lucide-react';

interface HistoryEntry {
  revision: number;
  updated: string;
  status: string;
  chart: string;
  app_version: string;
  description: string;
}

export default function HelmReleaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clusterId = params.clusterId as string;
  const releaseName = params.releaseName as string;
  const namespace = searchParams.get('namespace') || 'default';
  const decodedClusterId = decodeURIComponent(clusterId);
  const decodedReleaseName = decodeURIComponent(releaseName);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackRevision, setRollbackRevision] = useState(0);
  const [showAllValues, setShowAllValues] = useState(false);

  const { data: detail, error, isLoading, mutate } = useHelmReleaseDetail({
    clusterId: decodedClusterId,
    name: decodedReleaseName,
    namespace,
  });

  // History
  const historyUrl = `/api/clusters/${encodeURIComponent(decodedClusterId)}/helm/releases/${encodeURIComponent(decodedReleaseName)}/history?namespace=${encodeURIComponent(namespace)}`;
  const { data: historyData, mutate: mutateHistory } = useSWR(historyUrl, fetcher, { refreshInterval: 15000 });

  // Values
  const valuesUrl = `/api/clusters/${encodeURIComponent(decodedClusterId)}/helm/releases/${encodeURIComponent(decodedReleaseName)}/values?namespace=${encodeURIComponent(namespace)}${showAllValues ? '&all=true' : ''}`;
  const { data: valuesData, mutate: mutateValues } = useSWR(valuesUrl, fetcher, { refreshInterval: 15000 });

  const [valuesYaml, setValuesYaml] = useState('');

  useEffect(() => {
    if (valuesData) {
      import('js-yaml').then((yaml) => {
        const vals = (valuesData as any).values;
        if (vals && Object.keys(vals).length > 0) {
          setValuesYaml(yaml.default.dump(vals, { lineWidth: -1 }));
        } else {
          setValuesYaml('# No custom values configured');
        }
      });
    }
  }, [valuesData]);

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} clusterId={clusterId} />;
  if (!detail) return null;

  const info = (detail as any).info || {};
  const chartMeta = (detail as any).chart?.metadata || {};
  const releaseNamespace = (detail as any).namespace || namespace;
  const status = info.status || 'unknown';
  const history: HistoryEntry[] = (historyData as any)?.history || [];
  const currentChart = chartMeta.name
    ? `${chartMeta.name}`
    : (detail as any).chart || '';

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(
        `/api/clusters/${encodeURIComponent(decodedClusterId)}/helm/releases/${encodeURIComponent(decodedReleaseName)}?namespace=${encodeURIComponent(namespace)}`
      );
      toast.success(`Release "${decodedReleaseName}" uninstalled`);
      router.push(`/clusters/${clusterId}/helm`);
    } catch (err: any) {
      toast.error(`Uninstall failed: ${err.message}`);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleRollbackClick = (revision: number) => {
    setRollbackRevision(revision);
    setRollbackOpen(true);
  };

  const refreshAll = () => {
    mutate();
    mutateHistory();
    mutateValues();
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/clusters/${clusterId}/helm`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Ship className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{decodedReleaseName}</h1>
            <StatusBadge status={status.charAt(0).toUpperCase() + status.slice(1)} />
          </div>
          <p className="text-sm text-muted-foreground">
            Namespace: {releaseNamespace}
            {chartMeta.name && ` -- Chart: ${chartMeta.name}-${chartMeta.version || ''}`}
            {chartMeta.appVersion && ` -- App: ${chartMeta.appVersion}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setUpgradeOpen(true)}>
            <ArrowUpCircle className="h-4 w-4 mr-1" />
            Upgrade
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1" />
            Uninstall
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="values">Values</TabsTrigger>
          <TabsTrigger value="history">History ({history.length})</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Release Info */}
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs">
              <tbody>
                <tr className="border-b">
                  <td className="px-3 py-1.5 text-muted-foreground font-medium w-[140px]">Name</td>
                  <td className="px-3 py-1.5 font-medium">{decodedReleaseName}</td>
                  <td className="px-3 py-1.5 text-muted-foreground font-medium w-[140px]">Namespace</td>
                  <td className="px-3 py-1.5">{releaseNamespace}</td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-1.5 text-muted-foreground font-medium">Status</td>
                  <td className="px-3 py-1.5">
                    <StatusBadge status={status.charAt(0).toUpperCase() + status.slice(1)} />
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground font-medium">Revision</td>
                  <td className="px-3 py-1.5">{(detail as any).version || '-'}</td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-1.5 text-muted-foreground font-medium">Chart</td>
                  <td className="px-3 py-1.5 font-mono">
                    {chartMeta.name || '-'}{chartMeta.version ? `-${chartMeta.version}` : ''}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground font-medium">App Version</td>
                  <td className="px-3 py-1.5 font-mono">{chartMeta.appVersion || '-'}</td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-1.5 text-muted-foreground font-medium">First Deployed</td>
                  <td className="px-3 py-1.5">
                    {info.first_deployed ? new Date(info.first_deployed).toLocaleString() : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground font-medium">Last Deployed</td>
                  <td className="px-3 py-1.5">
                    {info.last_deployed ? new Date(info.last_deployed).toLocaleString() : '-'}
                  </td>
                </tr>
                {chartMeta.description && (
                  <tr className="border-b">
                    <td className="px-3 py-1.5 text-muted-foreground font-medium">Description</td>
                    <td className="px-3 py-1.5" colSpan={3}>{chartMeta.description}</td>
                  </tr>
                )}
                {info.description && (
                  <tr className="border-b">
                    <td className="px-3 py-1.5 text-muted-foreground font-medium">Release Notes</td>
                    <td className="px-3 py-1.5" colSpan={3}>{info.description}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Notes */}
          {info.notes && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <FileText className="h-4 w-4" />
                Release Notes
              </h3>
              <pre className="rounded-md border bg-muted p-4 overflow-auto max-h-[400px] text-xs font-mono whitespace-pre-wrap">
                {info.notes}
              </pre>
            </div>
          )}
        </TabsContent>

        {/* Values Tab */}
        <TabsContent value="values" className="space-y-3 mt-4">
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border overflow-hidden">
              <button
                className={`px-2.5 py-1 text-xs transition-colors ${!showAllValues ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                onClick={() => setShowAllValues(false)}
              >
                User Values
              </button>
              <button
                className={`px-2.5 py-1 text-xs border-l transition-colors ${showAllValues ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                onClick={() => setShowAllValues(true)}
              >
                All Values
              </button>
            </div>
          </div>
          <pre className="rounded-md border bg-muted p-4 overflow-auto min-h-[300px] max-h-[70vh] text-xs font-mono whitespace-pre">
            {valuesYaml || '# Loading values...'}
          </pre>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No revision history found.</p>
          ) : (
            <div className="space-y-3">
              {[...history].reverse().map((entry) => {
                const isCurrent = entry.revision === Math.max(...history.map(h => h.revision));
                return (
                  <div
                    key={entry.revision}
                    className={`rounded-md border p-3 ${isCurrent ? 'border-primary/50 bg-primary/5' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={isCurrent ? 'default' : 'secondary'} className="text-xs">
                          Rev {entry.revision}
                        </Badge>
                        {isCurrent && (
                          <Badge variant="outline" className="text-[10px] text-green-600 dark:text-green-400">
                            Current
                          </Badge>
                        )}
                        <StatusBadge status={entry.status.charAt(0).toUpperCase() + entry.status.slice(1)} />
                        <span className="text-xs font-mono text-muted-foreground">{entry.chart}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {entry.updated ? new Date(entry.updated).toLocaleString() : '-'}
                        </span>
                        {!isCurrent && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleRollbackClick(entry.revision)}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Rollback
                          </Button>
                        )}
                      </div>
                    </div>
                    {entry.description && (
                      <p className="mt-1.5 text-xs text-muted-foreground">{entry.description}</p>
                    )}
                    {entry.app_version && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        App Version: <span className="font-mono">{entry.app_version}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Uninstall ${decodedReleaseName}?`}
        description={`This will permanently uninstall the Helm release "${decodedReleaseName}" from namespace "${namespace}". All associated resources will be deleted.`}
        confirmLabel="Uninstall"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />

      <HelmUpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        clusterId={decodedClusterId}
        releaseName={decodedReleaseName}
        namespace={namespace}
        currentChart={currentChart}
        onUpgraded={refreshAll}
      />

      <HelmRollbackDialog
        open={rollbackOpen}
        onOpenChange={setRollbackOpen}
        clusterId={decodedClusterId}
        releaseName={decodedReleaseName}
        namespace={namespace}
        revision={rollbackRevision}
        onRolledBack={refreshAll}
      />
    </div>
  );
}
