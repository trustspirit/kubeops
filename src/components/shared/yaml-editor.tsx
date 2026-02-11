'use client';

import { useState, useMemo, useRef, useCallback, createContext, useContext } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, RotateCcw, Pencil, Table2, Code, ChevronRight, ChevronDown, Plug, ExternalLink, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import * as yaml from 'js-yaml';
import { mutate as globalMutate } from 'swr';
import { usePortForwards } from '@/hooks/use-port-forwards';

// === Types ===

interface PortForwardContext {
  clusterId: string;
  namespace: string;
  resourceType: string;
  resourceName: string;
}

interface YamlEditorProps {
  data: any;
  apiUrl: string;
  onSaved?: () => void;
  portForwardContext?: PortForwardContext;
}

interface PortForward {
  id: string;
  localPort: number;
  containerPort: number;
  status: string;
}

// Context for port forward info
const PFContext = createContext<PortForwardContext | null>(null);

// === Port Forward Button ===

function PortForwardButton({ containerPort }: { containerPort: number }) {
  const ctx = useContext(PFContext);
  const { forwards } = usePortForwards();
  const [starting, setStarting] = useState(false);

  if (!ctx) return null;
  const active = forwards.find(
    f => f.containerPort === containerPort && f.id.includes(ctx.resourceName)
  );

  const startForward = async () => {
    setStarting(true);
    try {
      await apiClient.post('/api/port-forward', {
        clusterId: ctx.clusterId,
        namespace: ctx.namespace,
        resourceType: ctx.resourceType,
        resourceName: ctx.resourceName,
        containerPort,
        localPort: containerPort,
      });
      globalMutate('/api/port-forward');
      toast.success(`Forwarding localhost:${containerPort} → ${containerPort}`);
    } catch (err: any) {
      toast.error(`Port forward failed: ${err.message}`);
    } finally {
      setStarting(false);
    }
  };

  const stopForward = async () => {
    if (!active) return;
    try {
      await apiClient.delete(`/api/port-forward?id=${encodeURIComponent(active.id)}`);
      globalMutate('/api/port-forward');
      toast.success('Port forward stopped');
    } catch { /* ignore */ }
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
        <button onClick={stopForward} className="text-muted-foreground hover:text-destructive p-0.5">
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

function ValueDisplay({ value, fieldKey }: { value: any; fieldKey?: string }) {
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

function ObjectTable({ data, depth = 0 }: { data: any; depth?: number }) {
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
                          {Array.isArray(value) ? `[${value.length} items]` : `{${Object.keys(value as any).length} fields}`}
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

function ResourceTableView({ data }: { data: any }) {
  if (!data) return null;

  const sections: { title: string; data: any; defaultOpen: boolean }[] = [];

  if (data.metadata) {
    const { managedFields, ...cleanMeta } = data.metadata;
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

export function YamlEditor({ data, apiUrl, onSaved, portForwardContext }: YamlEditorProps) {
  const [mode, setMode] = useState<'table' | 'yaml' | 'edit'>('table');
  const [saving, setSaving] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [yamlError, setYamlError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const yamlStr = useMemo(
    () => (mode === 'yaml' ? yaml.dump(data, { lineWidth: -1 }) : ''),
    [data, mode]
  );

  const startEditing = useCallback(() => {
    const clean = { ...data };
    if (clean.metadata?.managedFields) delete clean.metadata.managedFields;
    setEditValue(yaml.dump(clean, { lineWidth: -1 }));
    setYamlError(null);
    setMode('edit');
  }, [data]);

  const cancelEditing = useCallback(() => {
    setMode('table');
    setEditValue('');
    setYamlError(null);
  }, []);

  const handleSave = async () => {
    let parsed: any;
    try {
      parsed = yaml.load(editValue);
    } catch (e: any) {
      setYamlError(`Invalid YAML: ${e.message}`);
      return;
    }
    if (!parsed || typeof parsed !== 'object') {
      setYamlError('YAML must be a valid Kubernetes resource object');
      return;
    }
    setSaving(true);
    setYamlError(null);
    try {
      await apiClient.put(apiUrl, parsed);
      toast.success(`${parsed.metadata?.name || 'Resource'} updated`);
      setMode('table');
      setEditValue('');
      onSaved?.();
    } catch (err: any) {
      setYamlError(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PFContext.Provider value={portForwardContext || null}>
      <div className="space-y-3">
        {/* Active forwards banner */}
        <ActiveForwardsBanner />

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          {mode === 'edit' ? (
            <>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />
                {saving ? 'Saving...' : 'Apply'}
              </Button>
              <Button variant="outline" size="sm" onClick={cancelEditing} disabled={saving}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <span className="text-xs text-muted-foreground ml-2">Cmd+S to save</span>
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
            </>
          )}
        </div>

        {yamlError && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {yamlError}
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
                handleSave();
              }
            }}
          />
        )}
      </div>
    </PFContext.Provider>
  );
}
