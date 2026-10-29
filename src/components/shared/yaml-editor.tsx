'use client';

import { useState, useMemo, useRef, useCallback, useEffect, createContext, useContext } from 'react';
import type { KubeResource } from '@/types/resource';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, RotateCcw, Pencil, Table2, Code, ChevronRight, ChevronDown, Plug, ExternalLink, X, GitCompareArrows, Globe, Copy } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import * as yaml from 'js-yaml';
import { mutate as globalMutate } from 'swr';
import { usePortForwards } from '@/hooks/use-port-forwards';
import { findMatchingPortForward, type PortForwardInfo } from '@/lib/port-forward-client';
import { YamlDiffView } from '@/components/shared/yaml-diff-view';
import { MultiClusterApplyDialog } from '@/components/multi-cluster/multi-cluster-apply-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useModifierKeyLabel } from '@/hooks/use-modifier-key';
import { looksLikeResource, toEditableYaml, toPortableYaml } from '@/lib/portable-manifest';

// === Types ===

interface PortForwardContext {
  clusterId: string;
  namespace: string;
  resourceType: string;
  resourceName: string;
}

interface YamlEditorProps {
  data: KubeResource;
  apiUrl: string;
  /**
   * Revalidates the resource. Return the promise (e.g. `() => mutate()`) so a
   * conflict reload can wait for, and rebuild from, the fresh object.
   */
  onSaved?: () => unknown;
  portForwardContext?: PortForwardContext;
  clusterScoped?: boolean;
  /** Reports whether there are unapplied edits, so a parent can guard navigation. */
  onDirtyChange?: (dirty: boolean) => void;
}


// Context for port forward info
const PFContext = createContext<PortForwardContext | null>(null);

// === Port Forward Button ===

function PortForwardButton({ containerPort }: { containerPort: number }) {
  const ctx = useContext(PFContext);
  const { forwards, markStopped, unmarkStopped } = usePortForwards();
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  if (!ctx) return null;
  const active = findMatchingPortForward(forwards, {
    clusterId: ctx.clusterId,
    namespace: ctx.namespace,
    resourceType: ctx.resourceType,
    resourceName: ctx.resourceName,
    containerPort,
  });

  const startForward = async () => {
    setStarting(true);
    try {
      const response = await apiClient.post<{ forward: PortForwardInfo }>('/api/port-forward', {
        clusterId: ctx.clusterId,
        namespace: ctx.namespace,
        resourceType: ctx.resourceType,
        resourceName: ctx.resourceName,
        containerPort,
        localPort: containerPort,
      });
      globalMutate('/api/port-forward');
      toast.success(`Forwarding localhost:${response.forward.localPort} → ${containerPort}`);
    } catch (err: unknown) {
      toast.error(`Port forward failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setStarting(false);
    }
  };

  const stopForward = async () => {
    if (!active || stopping) return;
    setStopping(true);
    try {
      // Suppress the "stopped unexpectedly" warning before the DELETE so a poll
      // landing mid-request is not read as a drop; undone if the stop fails.
      markStopped(active.id);
      await apiClient.delete(`/api/port-forward?id=${encodeURIComponent(active.id)}`);
      globalMutate('/api/port-forward');
      toast.success('Port forward stopped');
    } catch (err: unknown) {
      unmarkStopped(active.id);
      toast.error(`Failed to stop port forward: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setStopping(false);
    }
  };

  if (active) {
    return (
      <span className="inline-flex items-center gap-1 ml-2">
        <a
          href={`http://localhost:${active.localPort}`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" />
          :{active.localPort}
        </a>
        <button
          onClick={stopForward}
          disabled={stopping}
          className="text-muted-foreground hover:text-destructive p-0.5 disabled:opacity-50"
          aria-label={`Stop port forward on local port ${active.localPort}`}
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={startForward}
      disabled={starting}
      className="inline-flex items-center gap-1 ml-2 text-[10px] text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
    >
      <Plug className="h-3 w-3" />
      {starting ? 'Starting...' : 'Forward'}
    </button>
  );
}

// === Table View Components ===

function ValueDisplay({ value, fieldKey }: { value: unknown; fieldKey?: string }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground italic">null</span>;
  if (typeof value === 'boolean') return <Badge variant={value ? 'default' : 'secondary'} className="text-xs font-mono">{String(value)}</Badge>;
  if (typeof value === 'number') {
    const isPort = fieldKey && (fieldKey === 'containerPort' || fieldKey === 'port' || fieldKey === 'targetPort');
    return (
      <span className="font-mono text-blue-600 dark:text-blue-400">
        {value}
        {isPort && <PortForwardButton containerPort={value} />}
      </span>
    );
  }
  if (typeof value === 'string') {
    if (value.length > 120) return <span className="font-mono text-xs break-all">{value.substring(0, 120)}...</span>;
    return <span className="font-mono text-xs break-all">{value}</span>;
  }
  return <span className="font-mono text-xs text-muted-foreground">{JSON.stringify(value)}</span>;
}

function ObjectTable({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!data || typeof data !== 'object') return <ValueDisplay value={data} />;

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-muted-foreground italic text-xs">[]</span>;
    if (data.every(item => typeof item !== 'object')) {
      return (
        <div className="flex flex-wrap gap-1">
          {data.map((item, i) => (
            <Badge key={i} variant="outline" className="text-xs font-mono font-normal">{String(item)}</Badge>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {data.map((item, i) => (
          <div key={i} className="rounded border p-2 bg-muted/30">
            <div className="text-[10px] text-muted-foreground mb-1 font-medium">[{i}]</div>
            <ObjectTable data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  const entries = Object.entries(data);
  if (entries.length === 0) return <span className="text-muted-foreground italic text-xs">{'{}'}</span>;

  return (
    <div className="w-full">
      <table className="w-full text-sm">
        <tbody>
          {entries.map(([key, value]) => {
            const isObject = value !== null && value !== undefined && typeof value === 'object';
            const isCollapsed = collapsed[key];
            const toggleKey = () => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

            return (
              <tr key={key} className="border-b last:border-b-0 align-top">
                <td
                  className={cn(
                    'py-1.5 pr-3 text-xs font-medium text-muted-foreground whitespace-nowrap',
                    depth === 0 ? 'w-[180px]' : 'w-[140px]',
                    isObject ? 'cursor-pointer hover:text-foreground select-none' : ''
                  )}
                  onClick={isObject ? toggleKey : undefined}
                >
                  <div className="flex items-center gap-1">
                    {isObject && (
                      isCollapsed
                        ? <ChevronRight className="h-3 w-3 shrink-0" />
                        : <ChevronDown className="h-3 w-3 shrink-0" />
                    )}
                    {key}
                  </div>
                </td>
                <td className="py-1.5 text-xs">
                  {isObject ? (
                    isCollapsed
                      ? <span className="text-muted-foreground text-xs italic">
                          {Array.isArray(value) ? `[${value.length} items]` : `{${Object.keys(value as Record<string, unknown>).length} fields}`}
                        </span>
                      : <ObjectTable data={value} depth={depth + 1} />
                  ) : (
                    <ValueDisplay value={value} fieldKey={key} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResourceTableView({ data }: { data: KubeResource }) {
  if (!data) return null;

  const sections: { title: string; data: unknown; defaultOpen: boolean }[] = [];

  if (data.metadata) {
    const { managedFields: _mf, ...cleanMeta } = data.metadata;
    void _mf; // Destructured to exclude from output
    sections.push({ title: 'Metadata', data: cleanMeta, defaultOpen: true });
  }
  if (data.spec) sections.push({ title: 'Spec', data: data.spec, defaultOpen: true });
  if (data.status) sections.push({ title: 'Status', data: data.status, defaultOpen: true });
  if (data.data) sections.push({ title: 'Data', data: data.data, defaultOpen: true });
  if (data.rules) sections.push({ title: 'Rules', data: data.rules, defaultOpen: true });
  if (data.roleRef) sections.push({ title: 'Role Ref', data: data.roleRef, defaultOpen: true });
  if (data.subjects) sections.push({ title: 'Subjects', data: data.subjects, defaultOpen: true });

  const handled = new Set(['apiVersion', 'kind', 'metadata', 'spec', 'status', 'data', 'rules', 'roleRef', 'subjects']);
  const remaining = Object.fromEntries(Object.entries(data).filter(([k]) => !handled.has(k)));
  if (Object.keys(remaining).length > 0) {
    sections.push({ title: 'Other', data: remaining, defaultOpen: false });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge className="text-xs">{data.kind}</Badge>
        <span className="text-xs text-muted-foreground">{data.apiVersion}</span>
      </div>
      {sections.map((section) => (
        <SectionCard key={section.title} title={section.title} defaultOpen={section.defaultOpen}>
          <ObjectTable data={section.data} />
        </SectionCard>
      ))}
    </div>
  );
}

function SectionCard({ title, defaultOpen, children }: { title: string; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border">
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-semibold hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

// === Active Port Forwards Banner ===

function ActiveForwardsBanner() {
  const { forwards } = usePortForwards();

  if (forwards.length === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2">
      <Plug className="h-4 w-4 text-green-500 shrink-0" />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {forwards.map(f => (
          <a
            key={f.id}
            href={`http://localhost:${f.localPort}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-green-700 dark:text-green-400 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            :{f.localPort} → {f.containerPort}
          </a>
        ))}
      </div>
    </div>
  );
}

// === Main Component ===

export function YamlEditor({ data, apiUrl, onSaved, portForwardContext, clusterScoped, onDirtyChange }: YamlEditorProps) {
  const [mode, setMode] = useState<'table' | 'yaml' | 'edit' | 'review'>('table');
  const [saving, setSaving] = useState(false);
  // Synchronous in-flight guard: Cmd+S auto-repeat or a double click fired
  // several PUTs, and every one after the first failed with a false 409.
  const savingRef = useRef(false);
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  /** The user's text from before a conflict reload, kept so it is not lost. */
  const [previousDraft, setPreviousDraft] = useState<string | null>(null);
  const [showDraftDiff, setShowDraftDiff] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [originalYaml, setOriginalYaml] = useState('');
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [multiApplyOpen, setMultiApplyOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modifierKey = useModifierKeyLabel();

  const yamlStr = useMemo(
    () => (mode === 'yaml' ? yaml.dump(data, { lineWidth: -1 }) : ''),
    [data, mode]
  );

  const beginEditing = useCallback((source: KubeResource) => {
    // `status` is server-owned and often hundreds of lines; showing it buries
    // the handful of spec fields the user actually came to edit.
    const yamlStr = toEditableYaml(source);
    setEditValue(yamlStr);
    setOriginalYaml(yamlStr);
    setYamlError(null);
    setMode('edit');
  }, []);

  const startEditing = useCallback(() => {
    setPreviousDraft(null);
    setShowDraftDiff(false);
    beginEditing(data);
  }, [beginEditing, data]);

  const isDirty = mode !== 'table' && mode !== 'yaml' && editValue !== originalYaml;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Report clean on unmount so a parent guard does not stay armed.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // Closing or reloading the window would silently drop unapplied edits.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const cancelEditing = useCallback(() => {
    setMode('table');
    setEditValue('');
    setOriginalYaml('');
    setYamlError(null);
    setConflict(false);
    setPreviousDraft(null);
    setShowDraftDiff(false);
    setDiscardOpen(false);
  }, []);

  // Discarding an edit is not recoverable, so confirm when there is something
  // to lose.
  const requestCancel = useCallback(() => {
    if (editValue !== originalYaml) {
      setDiscardOpen(true);
      return;
    }
    cancelEditing();
  }, [editValue, originalYaml, cancelEditing]);

  const goToReview = useCallback(() => {
    // Validate YAML before entering review
    try {
      const parsed = yaml.load(editValue);
      if (!parsed || typeof parsed !== 'object') {
        setYamlError('YAML must be a valid Kubernetes resource object');
        return;
      }
    } catch (e: unknown) {
      setYamlError(`Invalid YAML: ${e instanceof Error ? e.message : 'Unknown error'}`);
      return;
    }
    setYamlError(null);
    setMode('review');
  }, [editValue]);

  const handleSave = async () => {
    if (savingRef.current) return;
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = yaml.load(editValue) as Record<string, unknown>;
    } catch (e: unknown) {
      setYamlError(`Invalid YAML: ${e instanceof Error ? e.message : 'Unknown error'}`);
      setMode('edit');
      return;
    }
    if (!parsed || typeof parsed !== 'object') {
      setYamlError('YAML must be a valid Kubernetes resource object');
      setMode('edit');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setYamlError(null);
    setConflict(false);
    try {
      await apiClient.put(apiUrl, parsed);
      const meta = parsed?.metadata as Record<string, unknown> | undefined;
      toast.success(`${meta?.name || 'Resource'} updated`);
      setMode('table');
      setEditValue('');
      setOriginalYaml('');
      setPreviousDraft(null);
      setShowDraftDiff(false);
      void Promise.resolve(onSaved?.()).catch(() => {
        // Saved; the next poll will pick the new version up.
      });
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      // 409 means someone (or a controller) changed the object underneath us.
      setConflict(status === 409);
      setYamlError(`Save failed: ${(err instanceof Error ? err.message : 'Unknown error')}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Pull the server's current version into the editor. The revalidation is
  // awaited so the editor is rebuilt from the fresh object rather than the
  // stale one that just conflicted, and the user's text is kept alongside.
  const reloadFromServer = useCallback(async () => {
    if (reloading) return;
    setReloading(true);
    const draft = editValue;
    try {
      const fresh = await Promise.resolve(onSaved?.());
      const source = looksLikeResource(fresh) ? (fresh as KubeResource) : data;
      setConflict(false);
      setYamlError(null);
      beginEditing(source);
      setPreviousDraft(draft);
      setShowDraftDiff(false);
      toast.info('Reloaded the current version from the cluster', {
        description: 'Your edits were kept below so you can copy or compare them.',
      });
    } catch (err: unknown) {
      toast.error(`Reload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setReloading(false);
      setReloadConfirmOpen(false);
    }
  }, [reloading, editValue, onSaved, data, beginEditing]);

  const copyPreviousDraft = useCallback(async () => {
    if (previousDraft === null) return;
    try {
      await navigator.clipboard.writeText(previousDraft);
      toast.success('Previous edits copied to the clipboard');
    } catch {
      toast.error('Could not access the clipboard');
    }
  }, [previousDraft]);

  // Only computed while the dialog is open; it snapshots this on open.
  const multiApplyYaml = useMemo(
    () => (multiApplyOpen ? toPortableYaml(data) : ''),
    [multiApplyOpen, data]
  );

  // Cmd+S in review mode → apply changes
  useEffect(() => {
    if (mode !== 'review') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        // Held keys auto-repeat; `handleSave` also guards against overlap.
        if (e.repeat) return;
        void handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, editValue, apiUrl]);

  return (
    <PFContext.Provider value={portForwardContext || null}>
      <div className="space-y-3">
        {/* Active forwards banner */}
        <ActiveForwardsBanner />

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          {mode === 'edit' ? (
            <>
              <Button size="sm" onClick={goToReview}>
                <GitCompareArrows className="h-4 w-4 mr-1" />
                Review Changes
              </Button>
              <Button variant="outline" size="sm" onClick={requestCancel}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              {isDirty && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
              <span className="text-xs text-muted-foreground ml-2">{modifierKey}+S to review</span>
            </>
          ) : mode === 'review' ? (
            <>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />
                {saving ? 'Saving...' : 'Apply Changes'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMode('edit')} disabled={saving}>
                <Pencil className="h-4 w-4 mr-1" />
                Back to Edit
              </Button>
              <Button variant="outline" size="sm" onClick={requestCancel} disabled={saving}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <span className="text-xs text-muted-foreground ml-2">{modifierKey}+S to apply</span>
            </>
          ) : (
            <>
              <div className="flex rounded-md border overflow-hidden">
                <button
                  className={cn('px-2.5 py-1 text-xs flex items-center gap-1 transition-colors', mode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                  onClick={() => setMode('table')}
                >
                  <Table2 className="h-3 w-3" /> Table
                </button>
                <button
                  className={cn('px-2.5 py-1 text-xs flex items-center gap-1 border-l transition-colors', mode === 'yaml' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                  onClick={() => setMode('yaml')}
                >
                  <Code className="h-3 w-3" /> YAML
                </button>
              </div>
              <Button variant="outline" size="sm" onClick={startEditing}>
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
              {!clusterScoped && (
                <Button variant="outline" size="sm" onClick={() => setMultiApplyOpen(true)}>
                  <Globe className="h-4 w-4 mr-1" />
                  Multi-cluster
                </Button>
              )}
            </>
          )}
        </div>

        {yamlError && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            <p>{yamlError}</p>
            {conflict && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs">
                  The resource changed in the cluster after you started editing.
                </span>
                <Button variant="outline" size="sm" onClick={() => setReloadConfirmOpen(true)} disabled={reloading}>
                  {reloading ? 'Reloading...' : 'Reload current version'}
                </Button>
              </div>
            )}
          </div>
        )}

        {previousDraft !== null && (mode === 'edit' || mode === 'review') && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-2" role="status">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                The editor now holds the cluster&apos;s current version. Your earlier edits were kept.
              </span>
              <Button variant="outline" size="sm" className="h-7" onClick={copyPreviousDraft}>
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copy my edits
              </Button>
              <Button variant="outline" size="sm" className="h-7" onClick={() => setShowDraftDiff((v) => !v)}>
                <GitCompareArrows className="h-3.5 w-3.5 mr-1" />
                {showDraftDiff ? 'Hide comparison' : 'Compare with my edits'}
              </Button>
              <Button variant="ghost" size="sm" className="h-7" onClick={() => { setPreviousDraft(null); setShowDraftDiff(false); }}>
                Dismiss
              </Button>
            </div>
            {showDraftDiff && (
              <div>
                <p className="mb-1 text-muted-foreground">Current version → your earlier edits</p>
                <YamlDiffView original={originalYaml} modified={previousDraft} />
              </div>
            )}
          </div>
        )}

        {mode === 'table' && <ResourceTableView data={data} />}

        {mode === 'yaml' && (
          <pre className="rounded-md border bg-muted p-4 overflow-auto min-h-[50vh] max-h-[75vh] text-xs font-mono whitespace-pre">
            {yamlStr}
          </pre>
        )}

        {mode === 'edit' && (
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => { setEditValue(e.target.value); setYamlError(null); }}
            spellCheck={false}
            className="w-full rounded-md border bg-[#1e1e2e] text-[#cdd6f4] p-4 font-mono text-xs leading-5 whitespace-pre resize-y min-h-[70vh] focus:outline-none focus:ring-2 focus:ring-ring"
            style={{ tabSize: 2 }}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                const start = e.currentTarget.selectionStart;
                const end = e.currentTarget.selectionEnd;
                const val = e.currentTarget.value;
                setEditValue(val.substring(0, start) + '  ' + val.substring(end));
                requestAnimationFrame(() => {
                  if (textareaRef.current) {
                    textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
                  }
                });
              }
              if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                goToReview();
              }
            }}
          />
        )}

        {mode === 'review' && (
          <YamlDiffView original={originalYaml} modified={editValue} />
        )}

        <MultiClusterApplyDialog
          open={multiApplyOpen}
          onOpenChange={setMultiApplyOpen}
          initialYaml={multiApplyYaml}
        />

        <ConfirmDialog
          open={reloadConfirmOpen}
          onOpenChange={setReloadConfirmOpen}
          title="Replace your edits with the current version?"
          description="The editor will be reset to what is in the cluster now. Your edited YAML is kept so you can copy it or compare it against the new version."
          confirmLabel="Reload"
          onConfirm={() => void reloadFromServer()}
          loading={reloading}
        />

        <ConfirmDialog
          open={discardOpen}
          onOpenChange={setDiscardOpen}
          title="Discard changes?"
          description="Your edits to this resource have not been applied and will be lost."
          confirmLabel="Discard"
          variant="destructive"
          onConfirm={cancelEditing}
        />
      </div>
    </PFContext.Provider>
  );
}
