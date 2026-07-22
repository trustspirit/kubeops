'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { useAlertStore } from '@/stores/alert-store';
import type { AlertRule, ConditionType, ConditionOperator } from '@/types/alert';
import {
  CONDITION_OPERATORS,
  type AlertRuleValidationErrors,
  validateAlertRuleDraft,
} from '@/lib/alert-rule-validation';

const RESOURCE_TYPES = [
  { value: 'pods', label: 'Pods' },
  { value: 'deployments', label: 'Deployments' },
  { value: 'statefulsets', label: 'StatefulSets' },
  { value: 'daemonsets', label: 'DaemonSets' },
  { value: 'replicasets', label: 'ReplicaSets' },
  { value: 'jobs', label: 'Jobs' },
  { value: 'cronjobs', label: 'CronJobs' },
  { value: 'services', label: 'Services' },
  { value: 'events', label: 'Events' },
  { value: 'nodes', label: 'Nodes' },
  { value: 'horizontalpodautoscalers', label: 'HPA' },
];

const CONDITION_TYPES: { value: ConditionType; label: string }[] = [
  { value: 'status_change', label: 'Status Change' },
  { value: 'restart_count', label: 'Restart Count' },
  { value: 'cpu_threshold', label: 'CPU Threshold' },
  { value: 'memory_threshold', label: 'Memory Threshold' },
  { value: 'event_match', label: 'Event Match' },
];

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '==', label: '==' },
  { value: 'contains', label: 'contains' },
];

interface AlertRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editRule?: AlertRule | null;
}

export function AlertRuleDialog({ open, onOpenChange, editRule }: AlertRuleDialogProps) {
  const { addRule, updateRule } = useAlertStore();

  const [name, setName] = useState('');
  const [clusterId, setClusterId] = useState('');
  const [namespace, setNamespace] = useState('');
  const [resourceType, setResourceType] = useState('pods');
  const [conditionType, setConditionType] = useState<ConditionType>('status_change');
  const [operator, setOperator] = useState<ConditionOperator>('==');
  const [value, setValue] = useState('');
  const [cooldown, setCooldown] = useState('60');
  const [errors, setErrors] = useState<AlertRuleValidationErrors>({});

   
  useEffect(() => {
    if (editRule) {
      setName(editRule.name);
      setClusterId(editRule.clusterId);
      setNamespace(editRule.namespace || '');
      setResourceType(editRule.resourceType);
      setConditionType(editRule.condition.type);
      setOperator(editRule.condition.operator);
      setValue(String(editRule.condition.value));
      setCooldown(String(editRule.cooldown));
    } else {
      setName('');
      setClusterId('');
      setNamespace('');
      setResourceType('pods');
      setConditionType('status_change');
      setOperator('==');
      setValue('');
      setCooldown('60');
    }
    setErrors({});
  }, [editRule, open]);

  const handleSave = () => {
    const validation = validateAlertRuleDraft({
      name,
      clusterId,
      conditionType,
      operator,
      value,
      cooldown,
    });
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});

    const rule: AlertRule = {
      id: editRule?.id || `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      enabled: editRule?.enabled ?? true,
      clusterId,
      namespace: namespace || undefined,
      resourceType,
      condition: {
        type: conditionType,
        operator,
        value: validation.value.conditionValue,
      },
      cooldown: validation.value.cooldown,
    };

    if (editRule) {
      updateRule(editRule.id, rule);
    } else {
      addRule(rule);
    }

    onOpenChange(false);
  };

  const handleConditionTypeChange = (nextConditionType: ConditionType) => {
    setConditionType(nextConditionType);
    if (!CONDITION_OPERATORS[nextConditionType].includes(operator)) {
      setOperator(CONDITION_OPERATORS[nextConditionType][0]);
    }
  };

  const allowedOperators = CONDITION_OPERATORS[conditionType];

  const isValid = name.trim() !== '' && clusterId.trim() !== '' && value.trim() !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editRule ? 'Edit Alert Rule' : 'New Alert Rule'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              placeholder="High restart count"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Cluster ID</label>
              <Input
                placeholder="my-cluster"
                value={clusterId}
                onChange={(e) => setClusterId(e.target.value)}
              />
              {errors.clusterId && <p className="text-xs text-destructive">{errors.clusterId}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Namespace (optional)</label>
              <Input
                placeholder="default"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Resource Type</label>
            <Select value={resourceType} onValueChange={setResourceType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_TYPES.map((rt) => (
                  <SelectItem key={rt.value} value={rt.value}>
                    {rt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Condition</label>
              <Select value={conditionType} onValueChange={(v) => handleConditionTypeChange(v as ConditionType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_TYPES.map((ct) => (
                    <SelectItem key={ct.value} value={ct.value}>
                      {ct.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Operator</label>
              <Select value={operator} onValueChange={(v) => setOperator(v as ConditionOperator)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.filter((op) => allowedOperators.includes(op.value)).map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Value</label>
              <Input
                placeholder="5"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              {errors.value && <p className="text-xs text-destructive">{errors.value}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Cooldown (seconds)</label>
            <Input
              type="number"
              min={0}
              placeholder="60"
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
            />
            {errors.cooldown && <p className="text-xs text-destructive">{errors.cooldown}</p>}
          </div>
        </div>

        {errors.operator && <p className="text-xs text-destructive">{errors.operator}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {editRule ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
