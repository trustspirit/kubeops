'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAlertStore } from '@/stores/alert-store';
import { AlertRuleDialog } from './alert-rule-dialog';
import { Info, Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { getAlertRuleActivity, summarizeAlertScope, type AlertRuleActivity } from '@/lib/alert-scope';
import type { AlertRule } from '@/types/alert';

const ACTIVITY_BADGE: Record<AlertRuleActivity, { label: string; className: string; title: string }> = {
  active: {
    label: 'Active',
    className: 'bg-green-500/15 text-green-700 dark:text-green-400',
    title: 'Evaluating against the open cluster\u2019s Watch stream',
  },
  background: {
    label: 'Background',
    className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    title: 'Evaluating over a background Watch connection to this rule\u2019s cluster',
  },
  disabled: {
    label: 'Off',
    className: 'bg-muted text-muted-foreground',
    title: 'Rule is switched off',
  },
};

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
  const params = useParams();
  const activeClusterId = typeof params?.clusterId === 'string'
    ? decodeURIComponent(params.clusterId)
    : null;
  const scope = summarizeAlertScope(rules, activeClusterId);
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

      {/*
        Rules run off the Watch connection of the cluster on screen. Saying so
        beats the previous behaviour, where they just stopped firing.
      */}
      <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Enabled rules keep running while KubeOps is open, whichever cluster you are
          looking at. The open cluster
          {activeClusterId ? <> (<span className="font-mono text-foreground">{activeClusterId}</span>)</> : ''}{' '}
          reuses this page&apos;s connection.
          {scope.background > 0 && (
            <>
              {' '}
              {scope.background} rule{scope.background === 1 ? '' : 's'} for{' '}
              <span className="font-mono">{scope.backgroundClusters.join(', ')}</span>{' '}
              {scope.background === 1 ? 'runs' : 'run'} over background connections.
            </>
          )}
        </p>
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
                <th className="px-3 py-2 text-left font-medium">Status</th>
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
                    {(() => {
                      const activity = getAlertRuleActivity(rule, activeClusterId);
                      const badge = ACTIVITY_BADGE[activity];
                      return (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${badge.className}`}
                          title={badge.title}
                        >
                          {badge.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => toggleRule(rule.id)}
                      aria-label={`${rule.enabled ? 'Disable' : 'Enable'} alert rule ${rule.name}`}
                      aria-pressed={rule.enabled}
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
                        aria-label={`Edit alert rule ${rule.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteRule(rule.id)}
                        aria-label={`Delete alert rule ${rule.name}`}
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
