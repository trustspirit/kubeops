'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Save, RotateCcw, Pencil } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import * as yaml from 'js-yaml';

interface YamlEditorProps {
  data: any;
  apiUrl: string;
  onSaved?: () => void;
}

export function YamlEditor({ data, apiUrl, onSaved }: YamlEditorProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [yamlError, setYamlError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const yamlStr = yaml.dump(data, { lineWidth: -1 });

  const startEditing = useCallback(() => {
    const clean = { ...data };
    if (clean.metadata?.managedFields) {
      delete clean.metadata.managedFields;
    }
    setEditValue(yaml.dump(clean, { lineWidth: -1 }));
    setYamlError(null);
    setEditing(true);
  }, [data]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
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
      setEditing(false);
      setEditValue('');
      onSaved?.();
    } catch (err: any) {
      setYamlError(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? 'Saving...' : 'Apply'}
            </Button>
            <Button variant="outline" size="sm" onClick={cancelEditing} disabled={saving}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <span className="text-xs text-muted-foreground ml-2">
              Cmd+S to save
            </span>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={startEditing}>
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
        )}
      </div>

      {yamlError && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {yamlError}
        </div>
      )}

      {editing ? (
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
      ) : (
        <pre className="rounded-md border bg-muted p-4 overflow-auto min-h-[50vh] max-h-[75vh] text-xs font-mono whitespace-pre">
          {yamlStr}
        </pre>
      )}
    </div>
  );
}
