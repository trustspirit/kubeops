'use client';

import { useParams } from 'next/navigation';
import { useResourceDetail } from '@/hooks/use-resource-detail';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Parse K8s resource quantities to a numeric value in base units.
 * Examples: "100m" -> 0.1, "1Ki" -> 1024, "2Mi" -> 2097152, "1Gi" -> 1073741824
 */
function parseK8sQuantity(value: string | undefined): number {
  if (!value) return 0;
  const str = String(value).trim();

  // Binary suffixes
  if (str.endsWith('Ki')) return parseFloat(str) * 1024;
  if (str.endsWith('Mi')) return parseFloat(str) * 1024 * 1024;
  if (str.endsWith('Gi')) return parseFloat(str) * 1024 * 1024 * 1024;
  if (str.endsWith('Ti')) return parseFloat(str) * 1024 * 1024 * 1024 * 1024;

  // SI suffixes
  if (str.endsWith('m')) return parseFloat(str) / 1000;
  if (str.endsWith('k')) return parseFloat(str) * 1000;
  if (str.endsWith('M')) return parseFloat(str) * 1000 * 1000;
  if (str.endsWith('G')) return parseFloat(str) * 1000 * 1000 * 1000;
  if (str.endsWith('T')) return parseFloat(str) * 1000 * 1000 * 1000 * 1000;

  return parseFloat(str) || 0;
}

function QuotaGauge({
  resourceName,
  used,
  hard,
}: {
  resourceName: string;
  used: string;
  hard: string;
}) {
  const usedVal = parseK8sQuantity(used);
  const hardVal = parseK8sQuantity(hard);
  const pct = hardVal > 0 ? Math.min((usedVal / hardVal) * 100, 100) : 0;

  let color = 'bg-green-500';
  let textColor = 'text-green-600 dark:text-green-400';
  if (pct >= 95) {
    color = 'bg-red-500';
    textColor = 'text-red-600 dark:text-red-400';
  } else if (pct >= 80) {
    color = 'bg-yellow-500';
    textColor = 'text-yellow-600 dark:text-yellow-400';
  }

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{resourceName}</span>
        <span className={`font-mono ${textColor}`}>
          {used} / {hard} ({Math.round(pct)}%)
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ResourceQuotaDetail() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const namespace = params.namespace as string;
  const name = params.name as string;
  const decodedClusterId = decodeURIComponent(clusterId);

  const { data: quota } = useResourceDetail({
    clusterId: decodedClusterId,
    namespace,
    resourceType: 'resourcequotas',
    name,
  });

  if (!quota) return null;

  const spec = quota.spec || {};
  const status = quota.status || {};
  const hardResources = status.hard || spec.hard || {};
  const usedResources = status.used || {};
  const scopes = spec.scopes || [];
  const scopeSelector = spec.scopeSelector;

  const resourceEntries = Object.keys(hardResources).sort();

  return (
    <div className="space-y-4">
      {/* Quota Gauges */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Resource Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {resourceEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No resource quotas defined.</p>
          ) : (
            resourceEntries.map((key) => (
              <QuotaGauge
                key={key}
                resourceName={key}
                used={usedResources[key] || '0'}
                hard={hardResources[key]}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Scopes */}
      {scopes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Scopes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {scopes.map((scope: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs font-mono">
                  {scope}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scope Selector */}
      {scopeSelector && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Scope Selector</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(scopeSelector.matchExpressions || []).map((expr: { scopeName?: string; operator?: string; values?: string[] }, i: number) => (
                <div key={i} className="rounded-md border p-2 text-xs">
                  <span className="font-medium">{expr.scopeName}</span>
                  <span className="text-muted-foreground"> {expr.operator} </span>
                  {expr.values && (
                    <span className="font-mono">[{expr.values.join(', ')}]</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw Quota Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Quota Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Resource</th>
                  <th className="px-3 py-2 text-left font-medium">Used</th>
                  <th className="px-3 py-2 text-left font-medium">Hard Limit</th>
                  <th className="px-3 py-2 text-left font-medium">Usage %</th>
                </tr>
              </thead>
              <tbody>
                {resourceEntries.map((key) => {
                  const usedVal = parseK8sQuantity(usedResources[key]);
                  const hardVal = parseK8sQuantity(hardResources[key]);
                  const pct = hardVal > 0 ? Math.round((usedVal / hardVal) * 100) : 0;

                  return (
                    <tr key={key} className="border-t">
                      <td className="px-3 py-2 font-medium">{key}</td>
                      <td className="px-3 py-2 font-mono">{usedResources[key] || '0'}</td>
                      <td className="px-3 py-2 font-mono">{hardResources[key]}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={pct >= 95 ? 'destructive' : pct >= 80 ? 'default' : 'secondary'}
                          className="text-[10px]"
                        >
                          {pct}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
