'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTemplateStore, type ResourceTemplate } from '@/stores/template-store';
import { RESOURCE_LABELS } from '@/lib/constants';
import { SaveAsTemplateDialog } from '@/components/templates/save-as-template-dialog';

export function TemplatesTab() {
  const { templates, deleteTemplate } = useTemplateStore();
  const [editTemplate, setEditTemplate] = useState<ResourceTemplate | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Resource Templates</h4>
        <Button size="sm" className="gap-1" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" />
          Add Template
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Resource Type</TableHead>
            <TableHead>Variables</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((template) => (
            <TableRow key={template.id}>
              <TableCell className="font-medium">
                {template.name}
                {template.description && (
                  <span className="ml-2 text-xs text-muted-foreground">{template.description}</span>
                )}
              </TableCell>
              <TableCell>{RESOURCE_LABELS[template.resourceType] || template.resourceType}</TableCell>
              <TableCell>{template.variables.length}</TableCell>
              <TableCell>
                {template.builtIn ? (
                  <Badge variant="secondary">Built-in</Badge>
                ) : (
                  <Badge variant="outline">Custom</Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setEditTemplate(template)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {!template.builtIn && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteTemplate(template.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {templates.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No templates yet
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <SaveAsTemplateDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        yaml=""
        mode="create"
      />

      {editTemplate && (
        <SaveAsTemplateDialog
          open={!!editTemplate}
          onOpenChange={(open) => { if (!open) setEditTemplate(null); }}
          yaml={editTemplate.yaml}
          existingTemplate={editTemplate}
          mode="edit"
        />
      )}
    </div>
  );
}
