'use client';
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useMemo, useEffect } from 'react';
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
import { useTemplateStore, type ResourceTemplate } from '@/stores/template-store';
import { extractVariables, cleanResourceForTemplate } from '@/lib/template-engine';
import { RESOURCE_LABELS } from '@/lib/constants';
import { toast } from 'sonner';
import * as jsYaml from 'js-yaml';

interface SaveAsTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  yaml: string;
  resource?: any;
  existingTemplate?: ResourceTemplate;
  mode: 'create' | 'edit';
}

const RESOURCE_TYPES = [
  'deployments', 'services', 'configmaps', 'secrets', 'cronjobs',
  'jobs', 'ingresses', 'statefulsets', 'daemonsets', 'pods', 'pvcs',
];

export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  yaml: initialYaml,
  resource,
  existingTemplate,
  mode,
}: SaveAsTemplateDialogProps) {
  const { addTemplate, updateTemplate } = useTemplateStore();

  const cleanedYaml = useMemo(() => {
    if (resource) {
      const cleaned = cleanResourceForTemplate(resource);
      return jsYaml.dump(cleaned, { lineWidth: -1 });
    }
    return initialYaml;
  }, [resource, initialYaml]);

  const [name, setName] = useState(existingTemplate?.name || '');
  const [description, setDescription] = useState(existingTemplate?.description || '');
  const [resourceType, setResourceType] = useState(existingTemplate?.resourceType || '');
  const [yamlContent, setYamlContent] = useState(existingTemplate?.yaml || cleanedYaml);

   
  useEffect(() => {
    if (open) {
      setName(existingTemplate?.name || '');
      setDescription(existingTemplate?.description || '');
      setResourceType(existingTemplate?.resourceType || '');
      setYamlContent(existingTemplate?.yaml || cleanedYaml);
    }
  }, [open, existingTemplate, cleanedYaml]);

  const detectedVariables = useMemo(() => {
    return extractVariables(yamlContent);
  }, [yamlContent]);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Template name is required');
      return;
    }
    if (!resourceType) {
      toast.error('Resource type is required');
      return;
    }

    const variables = detectedVariables.map((v) => {
      const existing = existingTemplate?.variables.find((ev) => ev.name === v);
      return {
        name: v,
        defaultValue: existing?.defaultValue,
        description: existing?.description,
      };
    });

    if (mode === 'edit' && existingTemplate) {
      updateTemplate(existingTemplate.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        resourceType,
        yaml: yamlContent,
        variables,
      });
      toast.success('Template updated');
    } else {
      addTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        resourceType,
        yaml: yamlContent,
        variables,
      });
      toast.success('Template saved');
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit Template' : 'Save as Template'}</DialogTitle>
          <DialogDescription>
            Use {'{{variableName}}'} syntax in the YAML to create template variables.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Name</label>
              <Input
                placeholder="My Template"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Resource Type</label>
              <Select value={resourceType} onValueChange={setResourceType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {RESOURCE_LABELS[type] || type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Description</label>
            <Input
              placeholder="A brief description of this template"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">YAML Template</label>
            <textarea
              className="w-full rounded-md border bg-background p-3 font-mono text-xs min-h-[200px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              value={yamlContent}
              onChange={(e) => setYamlContent(e.target.value)}
              spellCheck={false}
            />
          </div>

          {detectedVariables.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Detected Variables</label>
              <div className="flex flex-wrap gap-1">
                {detectedVariables.map((v) => (
                  <Badge key={v} variant="outline">{`{{${v}}}`}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>{mode === 'edit' ? 'Update' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
