'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  Star,
  Search,
  Globe,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  PlayCircle,
} from 'lucide-react';
import { useClusters } from '@/hooks/use-clusters';
import { useNamespaces } from '@/hooks/use-namespaces';
import { useClusterCatalogStore } from '@/stores/cluster-catalog-store';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import * as yaml from 'js-yaml';

// === Types ===

interface ApplyTarget {
  clusterId: string;
  namespace: string;
}

interface ApplyResult {
  clusterId: string;
  namespace: string;
  status: 'success' | 'error';
  message?: string;
}

interface MultiClusterApplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialYaml?: string;
}

const STEPS = ['YAML', 'Targets', 'Validate', 'Apply'] as const;

// === Namespace selector for a single cluster ===

function ClusterNamespaceSelector({
  clusterId,
  selectedNamespace,
  onNamespaceChange,
}: {
  clusterId: string;
  selectedNamespace: string;
  onNamespaceChange: (ns: string) => void;
}) {
  const { namespaces, isLoading } = useNamespaces(clusterId);

  return (
    <Select value={selectedNamespace} onValueChange={onNamespaceChange}>
      <SelectTrigger className="w-[180px] h-8 text-xs">
        <SelectValue placeholder={isLoading ? 'Loading...' : 'Select namespace'} />
      </SelectTrigger>
      <SelectContent>
        {namespaces.map((ns: string) => (
          <SelectItem key={ns} value={ns} className="text-xs">
            {ns}
          </SelectItem>
        ))}
        {!isLoading && namespaces.length === 0 && (
          <SelectItem value="default" className="text-xs">
            default
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

// === Main Dialog ===

export function MultiClusterApplyDialog({
  open,
  onOpenChange,
  initialYaml = '',
}: MultiClusterApplyDialogProps) {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [yamlValue, setYamlValue] = useState(initialYaml);
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [validationResults, setValidationResults] = useState<ApplyResult[]>([]);
  const [validating, setValidating] = useState(false);
  const [applyResults, setApplyResults] = useState<ApplyResult[]>([]);
  const [applying, setApplying] = useState(false);

  const { clusters } = useClusters();
  const { getClusterMeta } = useClusterCatalogStore();

  const step = STEPS[currentStep];

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      setYamlValue(initialYaml);
      setYamlError(null);
      setSelectedTargets(new Map());
      setSearch('');
      setShowFavoritesOnly(false);
      setValidationResults([]);
      setValidating(false);
      setApplyResults([]);
      setApplying(false);
    }
  }, [open, initialYaml]);

  // Filter clusters
  const filteredClusters = useMemo(() => {
    let result = clusters.filter((c) => c.status === 'connected');

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.server?.toLowerCase().includes(q) ?? false) ||
          c.cluster.toLowerCase().includes(q)
      );
    }

    if (showFavoritesOnly) {
      result = result.filter((c) => getClusterMeta(c.name).favorite);
    }

    return result;
  }, [clusters, search, showFavoritesOnly, getClusterMeta]);

  const targets: ApplyTarget[] = useMemo(() => {
    return Array.from(selectedTargets.entries()).map(([clusterId, namespace]) => ({
      clusterId,
      namespace,
    }));
  }, [selectedTargets]);

  // === Step handlers ===

  const validateYaml = useCallback((): boolean => {
    try {
      const parsed = yaml.load(yamlValue);
      if (!parsed || typeof parsed !== 'object') {
        setYamlError('YAML must be a valid Kubernetes resource object');
        return false;
      }
      const resource = parsed as Record<string, unknown>;
      if (!resource.kind) {
        setYamlError('Resource must have a "kind" field');
        return false;
      }
      if (!resource.apiVersion) {
        setYamlError('Resource must have an "apiVersion" field');
        return false;
      }
      setYamlError(null);
      return true;
    } catch (e: unknown) {
      const yamlErr = e as { message?: string };
      setYamlError(`Invalid YAML: ${yamlErr.message || 'Unknown parse error'}`);
      return false;
    }
  }, [yamlValue]);

  const handleNext = useCallback(() => {
    if (currentStep === 0) {
      // Validate YAML before proceeding
      if (!validateYaml()) return;
    }
    if (currentStep === 1) {
      // Must have at least one target
      if (targets.length === 0) return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  }, [currentStep, validateYaml, targets.length]);

  const handleBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const toggleCluster = useCallback(
    (clusterId: string) => {
      setSelectedTargets((prev) => {
        const next = new Map(prev);
        if (next.has(clusterId)) {
          next.delete(clusterId);
        } else {
          // Default to the cluster's namespace or 'default'
          const cluster = clusters.find((c) => c.name === clusterId);
          next.set(clusterId, cluster?.namespace || 'default');
        }
        return next;
      });
    },
    [clusters]
  );

  const updateNamespace = useCallback((clusterId: string, namespace: string) => {
    setSelectedTargets((prev) => {
      const next = new Map(prev);
      next.set(clusterId, namespace);
      return next;
    });
  }, []);

  const handleValidate = useCallback(async () => {
    setValidating(true);
    setValidationResults([]);
    try {
      const response = await apiClient.post<{
        results: ApplyResult[];
        summary: { succeeded: number; failed: number; total: number };
      }>('/api/multi-cluster/apply', {
        targets,
        yaml: yamlValue,
        action: 'apply',
        dryRun: true,
      });
      setValidationResults(response.results);
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setValidationResults(
        targets.map((t) => ({
          clusterId: t.clusterId,
          namespace: t.namespace,
          status: 'error' as const,
          message: errObj.message || 'Validation request failed',
        }))
      );
    } finally {
      setValidating(false);
    }
  }, [targets, yamlValue]);

  const handleApply = useCallback(async () => {
    setApplying(true);
    setApplyResults([]);
    try {
      const response = await apiClient.post<{
        results: ApplyResult[];
        summary: { succeeded: number; failed: number; total: number };
      }>('/api/multi-cluster/apply', {
        targets,
        yaml: yamlValue,
        action: 'apply',
        dryRun: false,
      });
      setApplyResults(response.results);
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setApplyResults(
        targets.map((t) => ({
          clusterId: t.clusterId,
          namespace: t.namespace,
          status: 'error' as const,
          message: errObj.message || 'Apply request failed',
        }))
      );
    } finally {
      setApplying(false);
    }
  }, [targets, yamlValue]);

  const applySummary = useMemo(() => {
    const succeeded = applyResults.filter((r) => r.status === 'success').length;
    const failed = applyResults.filter((r) => r.status === 'error').length;
    return { succeeded, failed, total: applyResults.length };
  }, [applyResults]);

  // === Render ===

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Apply to Multiple Clusters
          </DialogTitle>
          <DialogDescription>
            Deploy resources across multiple clusters at once.
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-1 px-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors shrink-0',
                  i === currentStep
                    ? 'bg-primary text-primary-foreground'
                    : i < currentStep
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {i < currentStep ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={cn(
                  'text-xs font-medium truncate',
                  i === currentStep ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {s}
              </span>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-px mx-1',
                    i < currentStep ? 'bg-primary/40' : 'bg-border'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-auto min-h-[300px]">
          {/* Step 1: YAML Edit */}
          {step === 'YAML' && (
            <div className="space-y-3">
              {yamlError && (
                <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {yamlError}
                </div>
              )}
              <textarea
                value={yamlValue}
                onChange={(e) => {
                  setYamlValue(e.target.value);
                  setYamlError(null);
                }}
                spellCheck={false}
                placeholder={`apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: my-app\nspec:\n  ...`}
                className="w-full rounded-md border bg-[#1e1e2e] text-[#cdd6f4] p-4 font-mono text-xs leading-5 whitespace-pre resize-y min-h-[300px] focus:outline-none focus:ring-2 focus:ring-ring"
                style={{ tabSize: 2 }}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = e.currentTarget.selectionStart;
                    const end = e.currentTarget.selectionEnd;
                    const val = e.currentTarget.value;
                    setYamlValue(val.substring(0, start) + '  ' + val.substring(end));
                    requestAnimationFrame(() => {
                      const textarea = e.target as HTMLTextAreaElement;
                      textarea.selectionStart = textarea.selectionEnd = start + 2;
                    });
                  }
                }}
              />
            </div>
          )}

          {/* Step 2: Target Selection */}
          {step === 'Targets' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search clusters..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                <Button
                  variant={showFavoritesOnly ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                >
                  <Star className={cn('h-3.5 w-3.5', showFavoritesOnly && 'fill-current')} />
                  Favorites
                </Button>
                <Badge variant="secondary" className="text-xs">
                  {targets.length} selected
                </Badge>
              </div>

              <div className="space-y-1 max-h-[280px] overflow-y-auto">
                {filteredClusters.length === 0 && (
                  <p className="text-sm text-muted-foreground p-4 text-center">
                    No clusters found. Make sure you have connected clusters.
                  </p>
                )}
                {filteredClusters.map((cluster) => {
                  const isSelected = selectedTargets.has(cluster.name);
                  const meta = getClusterMeta(cluster.name);

                  return (
                    <div
                      key={cluster.name}
                      className={cn(
                        'flex items-center gap-3 rounded-md border p-2.5 transition-colors cursor-pointer',
                        isSelected
                          ? 'border-primary/50 bg-primary/5'
                          : 'hover:bg-muted/50'
                      )}
                      onClick={() => toggleCluster(cluster.name)}
                    >
                      <div
                        className={cn(
                          'flex items-center justify-center w-5 h-5 rounded border-2 shrink-0 transition-colors',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/30'
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {meta.favorite && (
                            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />
                          )}
                          <span className="text-sm font-medium truncate">{cluster.name}</span>
                          {meta.group && (
                            <Badge variant="outline" className="text-[10px] py-0 h-4">
                              {meta.group}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="truncate">{cluster.server || cluster.cluster}</span>
                          {meta.tags.length > 0 && (
                            <div className="flex gap-1">
                              {meta.tags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="secondary"
                                  className="text-[9px] py-0 h-3.5"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {isSelected && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <ClusterNamespaceSelector
                            clusterId={cluster.name}
                            selectedNamespace={selectedTargets.get(cluster.name) || 'default'}
                            onNamespaceChange={(ns) => updateNamespace(cluster.name, ns)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Validation */}
          {step === 'Validate' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleValidate}
                  disabled={validating}
                  size="sm"
                  className="gap-1"
                >
                  {validating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlayCircle className="h-3.5 w-3.5" />
                  )}
                  {validating ? 'Validating...' : 'Run Dry Run'}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Validates against {targets.length} target{targets.length !== 1 ? 's' : ''} without applying changes
                </span>
              </div>

              {validationResults.length > 0 && (
                <div className="space-y-1">
                  {validationResults.map((result) => (
                    <div
                      key={`${result.clusterId}-${result.namespace}`}
                      className={cn(
                        'flex items-center gap-3 rounded-md border p-2.5',
                        result.status === 'success'
                          ? 'border-green-500/30 bg-green-500/5'
                          : 'border-red-500/30 bg-red-500/5'
                      )}
                    >
                      {result.status === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">
                          {result.clusterId}
                          <span className="text-muted-foreground font-normal"> / {result.namespace}</span>
                        </div>
                        {result.message && (
                          <div className="text-xs text-muted-foreground truncate">
                            {result.message}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {validationResults.length === 0 && !validating && (
                <div className="rounded-md border bg-muted/20 p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    Click &quot;Run Dry Run&quot; to validate the resource against all selected targets.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Apply & Results */}
          {step === 'Apply' && (
            <div className="space-y-3">
              {applyResults.length === 0 && (
                <div className="rounded-md border bg-muted/20 p-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Ready to apply to {targets.length} target{targets.length !== 1 ? 's' : ''}.
                  </p>
                  <Button
                    onClick={handleApply}
                    disabled={applying}
                    className="gap-1"
                  >
                    {applying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PlayCircle className="h-4 w-4" />
                    )}
                    {applying ? 'Applying...' : 'Apply Now'}
                  </Button>
                </div>
              )}

              {applying && applyResults.length === 0 && (
                <div className="space-y-1">
                  {targets.map((target) => (
                    <div
                      key={`${target.clusterId}-${target.namespace}`}
                      className="flex items-center gap-3 rounded-md border p-2.5"
                    >
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                      <div className="text-sm">
                        {target.clusterId}
                        <span className="text-muted-foreground"> / {target.namespace}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {applyResults.length > 0 && (
                <>
                  {/* Summary */}
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    {applySummary.failed === 0 ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    ) : applySummary.succeeded === 0 ? (
                      <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
                    )}
                    <div className="text-sm">
                      <span className="font-medium">
                        {applySummary.succeeded} succeeded
                      </span>
                      {applySummary.failed > 0 && (
                        <span className="text-red-500 ml-2 font-medium">
                          {applySummary.failed} failed
                        </span>
                      )}
                      <span className="text-muted-foreground ml-2">
                        of {applySummary.total} total
                      </span>
                    </div>
                  </div>

                  {/* Per-target results */}
                  <div className="space-y-1">
                    {applyResults.map((result) => (
                      <div
                        key={`${result.clusterId}-${result.namespace}`}
                        className={cn(
                          'flex items-center gap-3 rounded-md border p-2.5',
                          result.status === 'success'
                            ? 'border-green-500/30 bg-green-500/5'
                            : 'border-red-500/30 bg-red-500/5'
                        )}
                      >
                        {result.status === 'success' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">
                            {result.clusterId}
                            <span className="text-muted-foreground font-normal"> / {result.namespace}</span>
                          </div>
                          {result.message && (
                            <div className="text-xs text-muted-foreground truncate">
                              {result.message}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <div>
            {currentStep > 0 && currentStep < 3 && (
              <Button variant="outline" onClick={handleBack} className="gap-1">
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {applyResults.length > 0 ? 'Done' : 'Cancel'}
            </Button>
            {currentStep < STEPS.length - 1 && (
              <Button
                onClick={handleNext}
                disabled={
                  (currentStep === 0 && !yamlValue.trim()) ||
                  (currentStep === 1 && targets.length === 0)
                }
                className="gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
