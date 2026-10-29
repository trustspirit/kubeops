'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

interface MergeKubeconfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged?: () => void;
}

interface MergeRename {
  kind: 'cluster' | 'user';
  from: string;
  to: string;
}

interface MergeResult {
  added: string[];
  skipped: string[];
  overwritten: string[];
  renamed?: MergeRename[];
}

/** Shape of POST /api/kubeconfig/merge with dryRun: true. */
interface MergePreview {
  result: MergeResult;
  conflicts: {
    contexts: string[];
    /** Same name as an existing cluster, different content. */
    clusters: string[];
    /** Same name as an existing user, different content. */
    users: string[];
  };
  incoming: { clusters: number; users: number; contexts: number };
}

type Strategy = 'skip' | 'overwrite';

async function requestMerge(yaml: string, strategy: Strategy, dryRun: boolean) {
  const response = await fetch('/api/kubeconfig/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ yaml, strategy, dryRun }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || (dryRun ? 'Failed to preview merge' : 'Failed to merge kubeconfig'));
  }
  return data;
}

function ConflictList({ title, names }: { title: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="space-y-2">
      <h5 className="text-sm font-medium text-destructive">{title}</h5>
      <div className="flex flex-wrap gap-1">
        {names.map((name) => (
          <Badge key={name} variant="destructive">{name}</Badge>
        ))}
      </div>
    </div>
  );
}

export function MergeKubeconfigDialog({
  open,
  onOpenChange,
  onMerged,
}: MergeKubeconfigDialogProps) {
  const [yamlInput, setYamlInput] = useState('');
  const [strategy, setStrategy] = useState<Strategy>('skip');
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [merging, setMerging] = useState(false);
  const [step, setStep] = useState<'input' | 'preview' | 'result'>('input');

  // The server computes the preview against the real (possibly multi-file)
  // kubeconfig, including clusters/users whose name matches but content differs.
  const loadPreview = async (nextStrategy: Strategy) => {
    setPreviewing(true);
    try {
      const data = await requestMerge(yamlInput, nextStrategy, true);
      setPreview(data.preview as MergePreview);
      setStep('preview');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setPreviewing(false);
    }
  };

  const handlePreview = async () => {
    if (!yamlInput.trim()) {
      toast.error('Please paste a kubeconfig YAML');
      return;
    }
    await loadPreview(strategy);
  };

  const handleStrategyChange = (value: Strategy) => {
    setStrategy(value);
    void loadPreview(value);
  };

  const handleMerge = async () => {
    if (merging) return;
    setMerging(true);
    try {
      const data = await requestMerge(yamlInput, strategy, false);
      setMergeResult(data.result);
      setStep('result');
      onMerged?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setMerging(false);
    }
  };

  const handleClose = () => {
    if (merging) return;
    setYamlInput('');
    setPreview(null);
    setMergeResult(null);
    setStep('input');
    setStrategy('skip');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge Kubeconfig</DialogTitle>
          <DialogDescription>
            {step === 'input' && 'Paste an external kubeconfig YAML to merge.'}
            {step === 'preview' && 'Review conflicts and select a merge strategy.'}
            {step === 'result' && 'Merge completed.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'input' && (
          <div className="space-y-3">
            <textarea
              className="w-full rounded-md border bg-background p-3 font-mono text-xs min-h-[250px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Paste kubeconfig YAML here..."
              value={yamlInput}
              onChange={(e) => setYamlInput(e.target.value)}
              spellCheck={false}
            />
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <ConflictList title="Conflicting Contexts" names={preview.conflicts.contexts} />
            <ConflictList title="Conflicting Clusters (same name, different server/CA)" names={preview.conflicts.clusters} />
            <ConflictList title="Conflicting Users (same name, different credentials)" names={preview.conflicts.users} />

            {preview.conflicts.contexts.length === 0
              && preview.conflicts.clusters.length === 0
              && preview.conflicts.users.length === 0 && (
              <p className="text-sm text-muted-foreground">No conflicts detected.</p>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Conflict Strategy</label>
              <Select value={strategy} onValueChange={(v) => handleStrategyChange(v as Strategy)} disabled={previewing}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip existing (keep current; rename conflicting clusters/users)</SelectItem>
                  <SelectItem value="overwrite">Overwrite existing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(preview.result.renamed?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <h5 className="text-sm font-medium">Will be added under a new name</h5>
                {preview.result.renamed!.map((r) => (
                  <p key={`${r.kind}/${r.from}`} className="text-xs text-muted-foreground font-mono">
                    {r.kind}/{r.from} → {r.kind}/{r.to}
                  </p>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <h5 className="text-sm font-medium">Incoming entries</h5>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Clusters: {preview.incoming.clusters}</p>
                <p>Users: {preview.incoming.users}</p>
                <p>Contexts: {preview.incoming.contexts}</p>
              </div>
            </div>
          </div>
        )}

        {step === 'result' && mergeResult && (
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-3">
              {mergeResult.added.length > 0 && (
                <div className="space-y-1">
                  <h5 className="text-sm font-medium text-green-600">Added ({mergeResult.added.length})</h5>
                  {mergeResult.added.map((item) => (
                    <p key={item} className="text-xs text-muted-foreground">{item}</p>
                  ))}
                </div>
              )}
              {mergeResult.skipped.length > 0 && (
                <div className="space-y-1">
                  <h5 className="text-sm font-medium text-yellow-600">Skipped ({mergeResult.skipped.length})</h5>
                  {mergeResult.skipped.map((item) => (
                    <p key={item} className="text-xs text-muted-foreground">{item}</p>
                  ))}
                </div>
              )}
              {(mergeResult.renamed?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <h5 className="text-sm font-medium text-blue-600">Renamed ({mergeResult.renamed!.length})</h5>
                  {mergeResult.renamed!.map((r) => (
                    <p key={`${r.kind}/${r.from}`} className="text-xs text-muted-foreground">
                      {r.kind}/{r.from} → {r.kind}/{r.to}
                    </p>
                  ))}
                </div>
              )}
              {mergeResult.overwritten.length > 0 && (
                <div className="space-y-1">
                  <h5 className="text-sm font-medium text-orange-600">Overwritten ({mergeResult.overwritten.length})</h5>
                  {mergeResult.overwritten.map((item) => (
                    <p key={item} className="text-xs text-muted-foreground">{item}</p>
                  ))}
                </div>
              )}
              {mergeResult.added.length === 0 && mergeResult.skipped.length === 0 && mergeResult.overwritten.length === 0 && (
                <p className="text-sm text-muted-foreground">No changes made.</p>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          {step === 'preview' && (
            <Button variant="outline" onClick={() => setStep('input')}>Back</Button>
          )}
          {step !== 'result' && (
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          )}
          {step === 'input' && (
            <Button onClick={handlePreview} disabled={previewing}>
              {previewing ? 'Checking...' : 'Preview'}
            </Button>
          )}
          {step === 'preview' && (
            <Button onClick={handleMerge} disabled={merging || previewing}>
              {merging ? 'Merging...' : 'Merge'}
            </Button>
          )}
          {step === 'result' && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
