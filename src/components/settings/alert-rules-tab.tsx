'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAlertStore } from '@/stores/alert-store';
import { AlertRuleDialog } from './alert-rule-dialog';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import type { AlertRule } from '@/types/alert';

function conditionSummary(rule: AlertRule): string {
  const { type, operator, value } = rule.condition;
  const typeLabel: Record<string, string> = {
    status_change: 'Status',
    restart_count: 'Restarts',
    cpu_threshold: 'CPU',
    memory_threshold: 'Memory',
    event_match: 'Event',
  };
  return `${typeLabel[type] || type} ${operator} ${value}`;
}

export function AlertRulesTab() {
  const { rules, deleteRule, toggleRule } = useAlertStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);

  const handleEdit = (rule: AlertRule) => {
    setEditingRule(rule);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingRule(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Alert Rules</h3>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add Rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No alert rules configured. Create one to get started.
        </p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Scope</th>
                <th className="px-3 py-2 text-left font-medium">Resource</th>
                <th className="px-3 py-2 text-left font-medium">Condition</th>
                <th className="px-3 py-2 text-left font-medium">Enabled</th>
                <th className="px-3 py-2 text-left font-medium w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{rule.name}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-muted-foreground font-mono">
                      {rule.clusterId}
                      {rule.namespace ? `/${rule.namespace}` : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary" className="text-xs">
                      {rule.resourceType}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs font-mono">{conditionSummary(rule)}</td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => toggleRule(rule.id)}
                    >
                      {rule.enabled ? (
                        <ToggleRight className="h-4 w-4 text-green-500" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEdit(rule)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteRule(rule.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertRuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editRule={editingRule}
      />
    </div>
  );
}
