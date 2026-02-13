'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTemplateStore, type ResourceTemplate } from '@/stores/template-store';
import { renderTemplate } from '@/lib/template-engine';
import { RESOURCE_LABELS } from '@/lib/constants';
import { toast } from 'sonner';

interface CreateFromTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  namespace: string;
  onApplied?: () => void;
}

type Step = 'select' | 'variables' | 'preview' | 'apply';

export function CreateFromTemplateDialog({
  open,
  onOpenChange,
  clusterId,
  namespace,
  onApplied,
}: CreateFromTemplateDialogProps) {
  const { templates } = useTemplateStore();
  const [step, setStep] = useState<Step>('select');
  const [selectedTemplate, setSelectedTemplate] = useState<ResourceTemplate | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);

  const filteredTemplates = useMemo(() => {
    if (filterType === 'all') return templates;
    return templates.filter((t) => t.resourceType === filterType);
  }, [templates, filterType]);

  const resourceTypes = useMemo(() => {
    const types = new Set(templates.map((t) => t.resourceType));
    return Array.from(types);
  }, [templates]);

  const renderedYaml = useMemo(() => {
    if (!selectedTemplate) return '';
    return renderTemplate(selectedTemplate.yaml, variableValues);
  }, [selectedTemplate, variableValues]);

  const handleSelectTemplate = (template: ResourceTemplate) => {
    setSelectedTemplate(template);
    // Pre-fill with defaults and current namespace
    const defaults: Record<string, string> = {};
    for (const v of template.variables) {
      if (v.name === 'namespace') {
        defaults[v.name] = namespace;
      } else if (v.defaultValue) {
        defaults[v.name] = v.defaultValue;
      }
    }
    setVariableValues(defaults);
    setStep('variables');
  };

  const handleApply = async () => {
    if (!selectedTemplate) return;
    setApplying(true);
    try {
      const resourceType = selectedTemplate.resourceType;
      const targetNamespace = variableValues['namespace'] || namespace;
      const response = await fetch(
        `/api/clusters/${encodeURIComponent(clusterId)}/resources/${targetNamespace}/${resourceType}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ yaml: renderedYaml }),
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to apply template');
      }
      toast.success('Resource created from template');
      onApplied?.();
      handleClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply template');
    } finally {
      setApplying(false);
    }
  };

  const handleClose = () => {
    setStep('select');
    setSelectedTemplate(null);
    setVariableValues({});
    setFilterType('all');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create from Template</DialogTitle>
          <DialogDescription>
            {step === 'select' && 'Select a template to get started'}
            {step === 'variables' && 'Fill in the template variables'}
            {step === 'preview' && 'Review the generated YAML'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <div className="space-y-3">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by resource type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {resourceTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {RESOURCE_LABELS[type] || type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {filteredTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className="flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{template.name}</span>
                        {template.builtIn && <Badge variant="secondary">Built-in</Badge>}
                      </div>
                      {template.description && (
                        <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {RESOURCE_LABELS[template.resourceType] || template.resourceType} &middot; {template.variables.length} variables
                      </p>
                    </div>
                  </button>
                ))}
                {filteredTemplates.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">No templates found</p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {step === 'variables' && selectedTemplate && (
          <div className="space-y-3">
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {selectedTemplate.variables.map((variable) => (
                <div key={variable.name} className="space-y-1.5">
                  <label className="text-xs font-medium">
                    {variable.name}
                    {variable.description && (
                      <span className="ml-1 text-muted-foreground font-normal">({variable.description})</span>
                    )}
                  </label>
                  <Input
                    placeholder={variable.defaultValue || variable.name}
                    value={variableValues[variable.name] || ''}
                    onChange={(e) =>
                      setVariableValues((prev) => ({
                        ...prev,
                        [variable.name]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'preview' && (
          <ScrollArea className="h-[400px]">
            <pre className="rounded-md bg-muted p-4 text-xs font-mono whitespace-pre-wrap">
              {renderedYaml}
            </pre>
          </ScrollArea>
        )}

        <DialogFooter>
          {step !== 'select' && (
            <Button
              variant="outline"
              onClick={() => {
                if (step === 'variables') setStep('select');
                else if (step === 'preview') setStep('variables');
              }}
            >
              Back
            </Button>
          )}
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {step === 'variables' && (
            <Button onClick={() => setStep('preview')}>Preview</Button>
          )}
          {step === 'preview' && (
            <Button onClick={handleApply} disabled={applying}>
              {applying ? 'Applying...' : 'Apply'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
