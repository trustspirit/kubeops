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
import * as jsYaml from 'js-yaml';

interface MergeKubeconfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged?: () => void;
}

interface MergeResult {
  added: string[];
  skipped: string[];
  overwritten: string[];
}

interface ConflictPreview {
  contexts: string[];
  clusters: string[];
  users: string[];
}

export function MergeKubeconfigDialog({
  open,
  onOpenChange,
  onMerged,
}: MergeKubeconfigDialogProps) {
  const [yamlInput, setYamlInput] = useState('');
  const [strategy, setStrategy] = useState<'skip' | 'overwrite'>('skip');
  const [conflicts, setConflicts] = useState<ConflictPreview | null>(null);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [merging, setMerging] = useState(false);
  const [step, setStep] = useState<'input' | 'preview' | 'result'>('input');

  const handlePreview = async () => {
    if (!yamlInput.trim()) {
      toast.error('Please paste a kubeconfig YAML');
      return;
    }

    try {
      // Validate YAML
      const parsed = jsYaml.load(yamlInput) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid YAML');
      }

      // Detect potential conflicts by checking existing contexts
      const response = await fetch('/api/kubeconfig/contexts');
      const data = await response.json();
      const existingNames = new Set((data.contexts || []).map((c: Record<string, string>) => c.name));

      const incomingContexts = ((parsed.contexts || []) as Array<Record<string, string>>).map((c) => c.name).filter(Boolean);
      const incomingClusters = ((parsed.clusters || []) as Array<Record<string, string>>).map((c) => c.name).filter(Boolean);
      const incomingUsers = ((parsed.users || []) as Array<Record<string, string>>).map((u) => u.name).filter(Boolean);

      setConflicts({
        contexts: incomingContexts.filter((n: string) => existingNames.has(n)),
        clusters: incomingClusters,
        users: incomingUsers,
      });
      setStep('preview');
    } catch (err: unknown) {
      toast.error(`Invalid kubeconfig: ${(err instanceof Error ? err.message : 'Unknown error')}`);
    }
  };

  const handleMerge = async () => {
    setMerging(true);
    try {
      const response = await fetch('/api/kubeconfig/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: yamlInput, strategy }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to merge kubeconfig');
      }
      const data = await response.json();
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
    setYamlInput('');
    setConflicts(null);
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

        {step === 'preview' && conflicts && (
          <div className="space-y-4">
            {conflicts.contexts.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium text-destructive">Conflicting Contexts</h5>
                <div className="flex flex-wrap gap-1">
                  {conflicts.contexts.map((name) => (
                    <Badge key={name} variant="destructive">{name}</Badge>
                  ))}
                </div>
              </div>
            )}

            {conflicts.contexts.length === 0 && (
              <p className="text-sm text-muted-foreground">No conflicts detected.</p>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Conflict Strategy</label>
              <Select value={strategy} onValueChange={(v) => setStrategy(v as 'skip' | 'overwrite')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip existing (keep current)</SelectItem>
                  <SelectItem value="overwrite">Overwrite existing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <h5 className="text-sm font-medium">Incoming entries</h5>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Clusters: {conflicts.clusters.length}</p>
                <p>Users: {conflicts.users.length}</p>
                <p>Contexts: {conflicts.contexts.length + (conflicts.clusters.length - conflicts.contexts.length)}</p>
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
            <Button onClick={handlePreview}>Preview</Button>
          )}
          {step === 'preview' && (
            <Button onClick={handleMerge} disabled={merging}>
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
