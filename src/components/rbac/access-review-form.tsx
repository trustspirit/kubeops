'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';
import { ShieldCheck, ShieldX, Loader2 } from 'lucide-react';

interface AccessReviewFormProps {
  clusterId: string;
}

interface AccessReviewResult {
  allowed: boolean;
  reason?: string;
  evaluationError?: string;
}

const COMMON_VERBS = ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete', 'deletecollection', '*'];

export function AccessReviewForm({ clusterId }: AccessReviewFormProps) {
  const [user, setUser] = useState('');
  const [group, setGroup] = useState('');
  const [verb, setVerb] = useState('');
  const [resource, setResource] = useState('');
  const [namespace, setNamespace] = useState('');
  const [apiGroup, setApiGroup] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AccessReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    if (!verb || !resource) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await apiClient.post<AccessReviewResult>(
        `/api/clusters/${encodeURIComponent(clusterId)}/rbac/access-review`,
        {
          user: user || undefined,
          group: group || undefined,
          verb,
          resource,
          namespace: namespace || undefined,
          apiGroup: apiGroup || undefined,
        }
      );
      setResult(response);
    } catch (err: unknown) {
      setError((err as Error).message || 'Access review failed');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = verb && resource && !loading;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Subject Access Review
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Check whether a user or service account has permission to perform an action.
            Leave the User/Group fields empty to check your own permissions.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Subject */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                User / ServiceAccount (optional)
              </label>
              <Input
                placeholder="e.g. jane or system:serviceaccount:default:my-sa"
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Group (optional)
              </label>
              <Input
                placeholder="e.g. system:masters"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              />
            </div>
          </div>

          {/* Action */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Verb <span className="text-red-500">*</span>
              </label>
              <Select value={verb} onValueChange={setVerb}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a verb" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_VERBS.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Resource <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g. pods, deployments, secrets"
                value={resource}
                onChange={(e) => setResource(e.target.value)}
              />
            </div>
          </div>

          {/* Optional fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Namespace (optional)
              </label>
              <Input
                placeholder="Leave empty for cluster-scoped check"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                API Group (optional)
              </label>
              <Input
                placeholder="e.g. apps, batch, rbac.authorization.k8s.io"
                value={apiGroup}
                onChange={(e) => setApiGroup(e.target.value)}
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleCheck} disabled={!canSubmit}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              Check Access
            </Button>
            {(result || error) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setResult(null);
                  setError(null);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card
          className={
            result.allowed
              ? 'border-green-500/30 bg-green-500/5'
              : 'border-red-500/30 bg-red-500/5'
          }
        >
          <CardContent className="flex items-start gap-4 p-6">
            {result.allowed ? (
              <ShieldCheck className="h-8 w-8 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldX className="h-8 w-8 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  className={
                    result.allowed
                      ? 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20'
                      : 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20'
                  }
                  variant="outline"
                >
                  {result.allowed ? 'Allowed' : 'Denied'}
                </Badge>
                <span className="text-sm font-medium">
                  {user || 'Current user'} {verb} {resource}
                  {namespace ? ` in ${namespace}` : ' (cluster-scoped)'}
                </span>
              </div>
              {result.reason && (
                <p className="text-xs text-muted-foreground">{result.reason}</p>
              )}
              {result.evaluationError && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  Evaluation error: {result.evaluationError}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-center gap-3 p-6">
            <ShieldX className="h-6 w-6 text-red-600 dark:text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-medium">Access Review Failed</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
