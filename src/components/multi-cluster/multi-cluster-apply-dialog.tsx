'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSWRConfig } from 'swr';
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
  RotateCcw,
} from 'lucide-react';
import { useClusters } from '@/hooks/use-clusters';
import { useNamespaces } from '@/hooks/use-namespaces';
import { useClusterCatalogStore } from '@/stores/cluster-catalog-store';
import { apiClient, LONG_RUNNING_TIMEOUT_MS } from '@/lib/api-client';
import { ensureTshKubeLogin } from '@/lib/auth/tsh-kube-login-cache';
import { guardOpenChange } from '@/lib/dialog-busy';
import { describeResource, parseManifest } from '@/lib/manifest';
import {
  allSucceeded,
  failedTargets,
  mergeRetriedRows,
  reconcileResults,
  rowKey,
  snapshotKey,
  summarizeRows,
  targetKey,
  type ApplyResult,
  type ApplyRow,
  type ApplyTarget,
} from '@/lib/multi-cluster-apply';
import { cn } from '@/lib/utils';

// === Types ===

interface MultiClusterApplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Seed for the editor. Read only when the dialog opens: callers pass live,
   * polled data, and re-seeding on every poll used to reset the wizard
   * mid-apply.
   */
  initialYaml?: string;
}

/** Rows for one run, tagged with the (targets, YAML) snapshot they answer. */
interface RunRows {
  key: string;
  rows: ApplyRow[];
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

// === One result row ===

function ResultRowView({ row, showResource }: { row: ApplyRow; showResource: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md border p-2.5',
        row.status === 'success'
          ? 'border-green-500/30 bg-green-500/5'
          : 'border-red-500/30 bg-red-500/5'
      )}
    >
      {row.status === 'success' ? (
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
      ) : (
        <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">
          {row.clusterId}
          <span className="text-muted-foreground font-normal"> / {row.namespace}</span>
          {showResource && (
            <span className="text-muted-foreground font-normal font-mono text-xs"> · {row.resource}</span>
          )}
          {row.timedOut && (
            <Badge
              variant="outline"
              className="ml-2 text-[10px] py-0 h-4 border-amber-500/50 text-amber-600 dark:text-amber-400"
              title="The request timed out; the change may or may not have been applied"
            >
              outcome unknown
            </Badge>
          )}
        </div>
        {row.message && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            title={expanded ? undefined : row.message}
            aria-expanded={expanded}
            className={cn(
              'block w-full text-left text-xs text-muted-foreground hover:text-foreground',
              expanded ? 'whitespace-pre-wrap break-words' : 'truncate'
            )}
          >
            {row.message}
          </button>
        )}
      </div>
    </div>
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
  const [validation, setValidation] = useState<RunRows | null>(null);
  const [validating, setValidating] = useState(false);
  const [applied, setApplied] = useState<RunRows | null>(null);
  const [applying, setApplying] = useState(false);

  // Bumped by every dry run and on every reopen; a response whose id is no
  // longer current answers a question nobody is asking any more.
  const requestIdRef = useRef(0);
  // Synchronous double-submit guard: `applying` state lags a fast double click.
  const applyingRef = useRef(false);
  const wasOpenRef = useRef(false);

  const { clusters } = useClusters();
  const { getClusterMeta } = useClusterCatalogStore();
  const { mutate: mutateCache } = useSWRConfig();

  const step = STEPS[currentStep];

  // Reset only on the closed → open transition. `initialYaml` is derived from
  // polled data by callers, so resetting whenever it changed restarted the
  // wizard every few seconds — including in the middle of an apply.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      requestIdRef.current += 1;
      setCurrentStep(0);
      setYamlValue(initialYaml);
      setYamlError(null);
      setSelectedTargets(new Map());
      setSearch('');
      setShowFavoritesOnly(false);
      setValidation(null);
      setValidating(false);
      setApplied(null);
      // `applying` is deliberately not reset: the dialog cannot be closed
      // while an apply runs, and clearing the flag would re-enable Apply.
    }
    wasOpenRef.current = open;
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

  const manifest = useMemo(() => parseManifest(yamlValue), [yamlValue]);
  const resources = useMemo(
    () => (manifest.ok ? manifest.documents.map(describeResource) : []),
    [manifest]
  );
  const multiDocument = resources.length > 1;
  const currentKey = useMemo(() => snapshotKey(targets, yamlValue), [targets, yamlValue]);

  // Results only count for the exact selection and YAML they were run with.
  const validationRows = useMemo(
    () => (validation?.key === currentKey ? validation.rows : []),
    [validation, currentKey]
  );
  const applyRows = useMemo(
    () => (applied?.key === currentKey ? applied.rows : []),
    [applied, currentKey]
  );

  // === Step handlers ===

  const validateYaml = useCallback((): boolean => {
    if (!manifest.ok) {
      setYamlError(manifest.error);
      return false;
    }
    setYamlError(null);
    return true;
  }, [manifest]);

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

  /**
   * Runs one apply (or dry run) for `runTargets` and lays the outcome onto the
   * expected (target × document) grid.
   *
   * Preflight: ensure every target has a valid per-cluster credential. For
   * Teleport clusters the server-side apply fails with an auth error if
   * `tsh kube login <cluster>` has never run; doing this here surfaces the
   * failure per target instead of as one opaque API error. No-op (cheap
   * detect call) for non-tsh providers; cached for repeat clicks.
   */
  const runApply = useCallback(async (
    runTargets: ApplyTarget[],
    yamlText: string,
    runResources: string[],
    dryRun: boolean,
  ): Promise<ApplyRow[]> => {
    const targetFailures: ApplyResult[] = [];
    await Promise.all(
      runTargets.map(async (t) => {
        try {
          await ensureTshKubeLogin(t.clusterId);
        } catch (err) {
          targetFailures.push({
            ...t,
            status: 'error',
            message: err instanceof Error ? err.message : 'tsh kube login failed',
          });
        }
      })
    );
    const failedKeys = new Set(targetFailures.map(targetKey));
    const runnable = runTargets.filter((t) => !failedKeys.has(targetKey(t)));

    let results: ApplyResult[] = [];
    if (runnable.length > 0) {
      try {
        const response = await apiClient.post<{ results?: ApplyResult[] }>('/api/multi-cluster/apply', {
          targets: runnable,
          yaml: yamlText,
          action: 'apply',
          dryRun,
        }, { timeoutMs: LONG_RUNNING_TIMEOUT_MS });
        results = response.results ?? [];
      } catch (err: unknown) {
        const message = err instanceof Error && err.message
          ? err.message
          : dryRun ? 'Validation request failed' : 'Apply request failed';
        for (const t of runnable) targetFailures.push({ ...t, status: 'error', message });
      }
    }
    return reconcileResults(runTargets, runResources, results, targetFailures);
  }, []);

  const handleValidate = useCallback(async () => {
    if (!manifest.ok || targets.length === 0) return;
    const requestId = ++requestIdRef.current;
    const key = currentKey;
    setValidating(true);
    setValidation(null);
    try {
      const rows = await runApply(targets, yamlValue, resources, true);
      if (requestId !== requestIdRef.current) return;
      setValidation({ key, rows });
    } finally {
      if (requestId === requestIdRef.current) setValidating(false);
    }
  }, [manifest.ok, targets, yamlValue, resources, currentKey, runApply]);

  const revalidateTargets = useCallback((runTargets: ApplyTarget[]) => {
    const prefixes = runTargets.map((t) => `/api/clusters/${encodeURIComponent(t.clusterId)}/`);
    void mutateCache(
      (key) => typeof key === 'string' && prefixes.some((prefix) => key.startsWith(prefix)),
    ).catch(() => {
      // The apply itself succeeded; polling will reconcile the views.
    });
  }, [mutateCache]);

  const handleApply = useCallback(async (retryFailedOnly = false) => {
    if (applyingRef.current || !manifest.ok) return;
    const key = currentKey;
    const runTargets = retryFailedOnly ? failedTargets(applyRows, targets) : targets;
    if (runTargets.length === 0) return;

    applyingRef.current = true;
    setApplying(true);
    try {
      const rows = await runApply(runTargets, yamlValue, resources, false);
      setApplied((prev) => (
        retryFailedOnly && prev?.key === key
          ? { key, rows: mergeRetriedRows(prev.rows, rows) }
          : { key, rows }
      ));
      revalidateTargets(runTargets);
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  }, [manifest.ok, currentKey, applyRows, targets, yamlValue, resources, runApply, revalidateTargets]);

  const applySummary = useMemo(() => summarizeRows(applyRows), [applyRows]);

  const canProceedToApply = useMemo(
    () => allSucceeded(validationRows, targets, resources),
    [validationRows, targets, resources]
  );

  const expectedRows = targets.length * resources.length;

  // === Render ===

  return (
    <Dialog open={open} onOpenChange={guardOpenChange(applying, onOpenChange)}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col" busy={applying}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Apply to Multiple Clusters
          </DialogTitle>
          <DialogDescription>
            Deploy resources across multiple clusters at once. Multi-document manifests (separated by <code>---</code>) are supported.
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
                  Validates {resources.length} resource{resources.length !== 1 ? 's' : ''} against{' '}
                  {targets.length} target{targets.length !== 1 ? 's' : ''} without applying changes
                </span>
              </div>

              {validationRows.length > 0 && (
                <div className="space-y-1">
                  {validationRows.map((row) => (
                    <ResultRowView key={rowKey(row, row.resource)} row={row} showResource={multiDocument} />
                  ))}
                </div>
              )}

              {validationRows.length === 0 && !validating && (
                <div className="rounded-md border bg-muted/20 p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    Click &quot;Run Dry Run&quot; to validate the resource against all selected targets.
                  </p>
                </div>
              )}

              {validationRows.length > 0 && !canProceedToApply && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  Resolve validation errors before applying.
                </div>
              )}
            </div>
          )}

          {/* Step 4: Apply & Results */}
          {step === 'Apply' && (
            <div className="space-y-3">
              {applyRows.length === 0 && !applying && (
                <div className="rounded-md border bg-muted/20 p-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Ready to apply {resources.length} resource{resources.length !== 1 ? 's' : ''} to{' '}
                    {targets.length} target{targets.length !== 1 ? 's' : ''} ({expectedRows} change{expectedRows !== 1 ? 's' : ''}).
                  </p>
                  <Button
                    onClick={() => void handleApply()}
                    disabled={applying}
                    className="gap-1"
                  >
                    <PlayCircle className="h-4 w-4" />
                    Apply Now
                  </Button>
                </div>
              )}

              {applying && applyRows.length === 0 && (
                <div className="space-y-1">
                  {targets.flatMap((target) => resources.map((resource) => (
                    <div
                      key={rowKey(target, resource)}
                      className="flex items-center gap-3 rounded-md border p-2.5"
                    >
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                      <div className="text-sm">
                        {target.clusterId}
                        <span className="text-muted-foreground"> / {target.namespace}</span>
                        {multiDocument && (
                          <span className="text-muted-foreground font-mono text-xs"> · {resource}</span>
                        )}
                      </div>
                    </div>
                  )))}
                </div>
              )}

              {applyRows.length > 0 && (
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
                    <div className="text-sm flex-1">
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
                    {applySummary.failed > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => void handleApply(true)}
                        disabled={applying}
                      >
                        {applying ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        {applying ? 'Retrying...' : 'Retry failed'}
                      </Button>
                    )}
                  </div>

                  {/* Per-target results */}
                  <div className="space-y-1">
                    {applyRows.map((row) => (
                      <ResultRowView key={rowKey(row, row.resource)} row={row} showResource={multiDocument} />
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
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
              {applyRows.length > 0 ? 'Done' : 'Cancel'}
            </Button>
            {currentStep < STEPS.length - 1 && (
              <Button
                onClick={handleNext}
                disabled={
                  (currentStep === 0 && !yamlValue.trim()) ||
                  (currentStep === 1 && targets.length === 0) ||
                  (currentStep === 2 && (!canProceedToApply || validating))
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
