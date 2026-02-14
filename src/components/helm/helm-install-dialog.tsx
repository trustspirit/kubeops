'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { Loader2, Search, Plus, Package } from 'lucide-react';

interface HelmInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  onInstalled?: () => void;
}

interface SearchResult {
  name: string;
  chart_version: string;
  app_version: string;
  description: string;
}

type Step = 'search' | 'configure';

export function HelmInstallDialog({ open, onOpenChange, clusterId, onInstalled }: HelmInstallDialogProps) {
  const [step, setStep] = useState<Step>('search');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedChart, setSelectedChart] = useState('');
  const [releaseName, setReleaseName] = useState('');
  const [namespace, setNamespace] = useState('default');
  const [values, setValues] = useState('');
  const [installing, setInstalling] = useState(false);

  const resetState = () => {
    setStep('search');
    setSearchKeyword('');
    setSearchResults([]);
    setSearching(false);
    setSearchError(null);
    setSelectedChart('');
    setReleaseName('');
    setNamespace('default');
    setValues('');
    setInstalling(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) resetState();
    onOpenChange(open);
  };

  const handleSearch = async () => {
    if (!searchKeyword.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const data = await apiClient.get<{ results: SearchResult[] }>(
        `/api/clusters/${encodeURIComponent(clusterId)}/helm/search?keyword=${encodeURIComponent(searchKeyword)}`
      );
      setSearchResults(data.results || []);
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectChart = (chartName: string) => {
    setSelectedChart(chartName);
    // Auto-generate release name from chart name
    const shortName = chartName.includes('/') ? chartName.split('/').pop()! : chartName;
    setReleaseName(shortName);
    setStep('configure');
  };

  const handleInstall = async () => {
    if (!releaseName || !selectedChart || !namespace) return;
    setInstalling(true);
    try {
      await apiClient.post(
        `/api/clusters/${encodeURIComponent(clusterId)}/helm/install`,
        {
          releaseName,
          chart: selectedChart,
          namespace,
          values: values || undefined,
          createNamespace: true,
        }
      );
      toast.success(`Release "${releaseName}" installed successfully`);
      onInstalled?.();
      handleOpenChange(false);
    } catch (err: unknown) {
      toast.error(`Install failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleManualChart = () => {
    setStep('configure');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Install Helm Chart</DialogTitle>
          <DialogDescription>
            {step === 'search'
              ? 'Search for a chart in your configured repositories or enter a chart name directly.'
              : `Configure installation for "${selectedChart || 'chart'}"`}
          </DialogDescription>
        </DialogHeader>

        {step === 'search' && (
          <div className="space-y-4">
            {/* Search input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search charts (e.g., nginx, prometheus)..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-8"
                />
              </div>
              <Button onClick={handleSearch} disabled={searching || !searchKeyword.trim()}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
              </Button>
            </div>

            {searchError && (
              <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                {searchError}
              </div>
            )}

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {searchResults.map((result) => (
                  <button
                    key={result.name}
                    className="w-full text-left rounded-md border p-3 hover:bg-muted/50 transition-colors"
                    onClick={() => handleSelectChart(result.name)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{result.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-mono">{result.chart_version}</Badge>
                        {result.app_version && (
                          <Badge variant="secondary" className="text-xs font-mono">{result.app_version}</Badge>
                        )}
                      </div>
                    </div>
                    {result.description && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{result.description}</p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {searchResults.length === 0 && !searching && searchKeyword && !searchError && (
              <p className="text-center text-sm text-muted-foreground py-4">
                No charts found. Try a different search term or enter the chart name directly.
              </p>
            )}

            {/* Manual entry option */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <span className="text-sm text-muted-foreground">Or enter chart name directly:</span>
              <Input
                placeholder="repo/chart-name"
                value={selectedChart}
                onChange={(e) => setSelectedChart(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={handleManualChart} disabled={!selectedChart.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                Use
              </Button>
            </div>
          </div>
        )}

        {step === 'configure' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Release Name</label>
                <Input
                  value={releaseName}
                  onChange={(e) => setReleaseName(e.target.value)}
                  placeholder="my-release"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Namespace</label>
                <Input
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  placeholder="default"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Chart</label>
              <Input
                value={selectedChart}
                onChange={(e) => setSelectedChart(e.target.value)}
                placeholder="repo/chart-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Values (YAML)</label>
              <textarea
                value={values}
                onChange={(e) => setValues(e.target.value)}
                placeholder={"# Override values here\n# replicaCount: 2\n# image:\n#   tag: latest"}
                className="w-full h-48 rounded-md border bg-muted/30 p-3 font-mono text-xs leading-5 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                spellCheck={false}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'configure' && (
            <Button variant="outline" onClick={() => setStep('search')} disabled={installing}>
              Back
            </Button>
          )}
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={installing}>
            Cancel
          </Button>
          {step === 'configure' && (
            <Button
              onClick={handleInstall}
              disabled={installing || !releaseName || !selectedChart || !namespace}
            >
              {installing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Installing...
                </>
              ) : (
                'Install'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
