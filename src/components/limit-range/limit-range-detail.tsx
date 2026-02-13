'use client';

import { useParams } from 'next/navigation';
import { useResourceDetail } from '@/hooks/use-resource-detail';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function parseQuantityToNumber(val: string | undefined): number {
  if (!val) return 0;
  const str = String(val).trim();
  if (str.endsWith('Ki')) return parseFloat(str) * 1024;
  if (str.endsWith('Mi')) return parseFloat(str) * 1024 * 1024;
  if (str.endsWith('Gi')) return parseFloat(str) * 1024 * 1024 * 1024;
  if (str.endsWith('Ti')) return parseFloat(str) * 1024 * 1024 * 1024 * 1024;
  if (str.endsWith('m')) return parseFloat(str) / 1000;
  if (str.endsWith('k')) return parseFloat(str) * 1000;
  if (str.endsWith('M')) return parseFloat(str) * 1000 * 1000;
  if (str.endsWith('G')) return parseFloat(str) * 1000 * 1000 * 1000;
  return parseFloat(str) || 0;
}

function RangeBar({
  label,
  min,
  defaultRequest,
  defaultLimit,
  max,
}: {
  label: string;
  min?: string;
  defaultRequest?: string;
  defaultLimit?: string;
  max?: string;
}) {
  // Determine the full range
  const values = [min, defaultRequest, defaultLimit, max].filter(Boolean) as string[];
  if (values.length === 0) return null;

  const numValues = values.map(parseQuantityToNumber);
  const maxNum = Math.max(...numValues) || 1;

  const minPct = min ? (parseQuantityToNumber(min) / maxNum) * 100 : 0;
  const reqPct = defaultRequest ? (parseQuantityToNumber(defaultRequest) / maxNum) * 100 : 0;
  const limPct = defaultLimit ? (parseQuantityToNumber(defaultLimit) / maxNum) * 100 : 0;
  const maxPct = 100;

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium">{label}</div>
      <div className="relative h-6 rounded bg-muted overflow-hidden">
        {/* Full range background (min to max) */}
        <div
          className="absolute h-full bg-blue-100 dark:bg-blue-900/30"
          style={{ left: `${minPct}%`, width: `${maxPct - minPct}%` }}
        />
        {/* Default request marker */}
        {defaultRequest && (
          <div
            className="absolute h-full w-1.5 bg-green-500 rounded"
            style={{ left: `${reqPct}%` }}
            title={`Default Request: ${defaultRequest}`}
          />
        )}
        {/* Default limit marker */}
        {defaultLimit && (
          <div
            className="absolute h-full w-1.5 bg-orange-500 rounded"
            style={{ left: `${limPct}%` }}
            title={`Default Limit: ${defaultLimit}`}
          />
        )}
        {/* Min marker */}
        {min && (
          <div
            className="absolute h-full w-1 bg-blue-500 rounded"
            style={{ left: `${minPct}%` }}
            title={`Min: ${min}`}
          />
        )}
        {/* Max marker at end */}
        {max && (
          <div
            className="absolute h-full w-1 bg-red-500 rounded right-0"
            title={`Max: ${max}`}
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <div className="flex gap-3">
          {min && (
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />
              min: {min}
            </span>
          )}
          {defaultRequest && (
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />
              req: {defaultRequest}
            </span>
          )}
        </div>
        <div className="flex gap-3">
          {defaultLimit && (
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1" />
              limit: {defaultLimit}
            </span>
          )}
          {max && (
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />
              max: {max}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function LimitRangeDetail() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const namespace = params.namespace as string;
  const name = params.name as string;
  const decodedClusterId = decodeURIComponent(clusterId);

  const { data: lr } = useResourceDetail({
    clusterId: decodedClusterId,
    namespace,
    resourceType: 'limitranges',
    name,
  });

  if (!lr) return null;

  const spec = lr.spec || {};
  const limits = spec.limits || [];

  return (
    <div className="space-y-4">
      {limits.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground text-center">
              No limit ranges defined.
            </p>
          </CardContent>
        </Card>
      ) : (
        limits.map((limit: { type?: string; default?: Record<string, string>; defaultRequest?: Record<string, string>; min?: Record<string, string>; max?: Record<string, string>; maxLimitRequestRatio?: Record<string, string> }, i: number) => {
          const limitType = limit.type || 'Unknown';
          const defaultLimits = limit.default || {};
          const defaultRequests = limit.defaultRequest || {};
          const minValues = limit.min || {};
          const maxValues = limit.max || {};
          const maxLimitRequestRatio = limit.maxLimitRequestRatio || {};

          // Collect all resource names across all fields
          const allResources = new Set<string>();
          [defaultLimits, defaultRequests, minValues, maxValues, maxLimitRequestRatio].forEach(
            (obj) => Object.keys(obj).forEach((k) => allResources.add(k))
          );
          const resourceNames = Array.from(allResources).sort();

          return (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm">Limit Range</CardTitle>
                  <Badge variant="outline" className="text-xs font-mono">
                    {limitType}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Table view */}
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Resource</th>
                        <th className="px-3 py-2 text-left font-medium">Min</th>
                        <th className="px-3 py-2 text-left font-medium">Default Request</th>
                        <th className="px-3 py-2 text-left font-medium">Default Limit</th>
                        <th className="px-3 py-2 text-left font-medium">Max</th>
                        <th className="px-3 py-2 text-left font-medium">Max Ratio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resourceNames.map((res) => (
                        <tr key={res} className="border-t">
                          <td className="px-3 py-2 font-medium">{res}</td>
                          <td className="px-3 py-2 font-mono">{minValues[res] || '-'}</td>
                          <td className="px-3 py-2 font-mono">{defaultRequests[res] || '-'}</td>
                          <td className="px-3 py-2 font-mono">{defaultLimits[res] || '-'}</td>
                          <td className="px-3 py-2 font-mono">{maxValues[res] || '-'}</td>
                          <td className="px-3 py-2 font-mono">
                            {maxLimitRequestRatio[res] || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Visual range bars */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground">
                    Visual Range
                  </h4>
                  {resourceNames.map((res) => (
                    <RangeBar
                      key={res}
                      label={res}
                      min={minValues[res]}
                      defaultRequest={defaultRequests[res]}
                      defaultLimit={defaultLimits[res]}
                      max={maxValues[res]}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
