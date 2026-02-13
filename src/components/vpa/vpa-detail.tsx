'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface VpaContainerRecommendation {
  containerName: string;
  target?: { cpu?: string; memory?: string };
  lowerBound?: { cpu?: string; memory?: string };
  upperBound?: { cpu?: string; memory?: string };
  uncappedTarget?: { cpu?: string; memory?: string };
}

interface VpaData {
  spec?: {
    updatePolicy?: { updateMode?: string };
    targetRef?: { kind?: string; name?: string };
    [key: string]: unknown;
  };
  status?: {
    recommendation?: {
      containerRecommendations?: VpaContainerRecommendation[];
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface VpaDetailProps {
  data: VpaData;
}

function parseQuantity(val: string | undefined): { value: number; unit: string } {
  if (!val) return { value: 0, unit: '' };
  const match = val.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return { value: 0, unit: val };
  return { value: parseFloat(match[1]), unit: match[2] };
}

function RecommendationBar({
  label,
  target,
  lowerBound,
  upperBound,
}: {
  label: string;
  target: string;
  lowerBound: string;
  upperBound: string;
}) {
  const tgt = parseQuantity(target);
  const lower = parseQuantity(lowerBound);
  const upper = parseQuantity(upperBound);
  const maxVal = upper.value || tgt.value * 2 || 100;

  const lowerPct = maxVal > 0 ? (lower.value / maxVal) * 100 : 0;
  const targetPct = maxVal > 0 ? (tgt.value / maxVal) * 100 : 0;
  const upperPct = 100;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">target: {target || '-'}</span>
      </div>
      <div className="relative h-4 rounded-full bg-muted overflow-hidden">
        {/* Lower bound to upper bound background */}
        <div
          className="absolute h-full bg-blue-200 dark:bg-blue-900/40"
          style={{ left: `${lowerPct}%`, width: `${upperPct - lowerPct}%` }}
        />
        {/* Target marker */}
        <div
          className="absolute h-full w-1 bg-blue-500 rounded"
          style={{ left: `${targetPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>lower: {lowerBound || '-'}</span>
        <span>upper: {upperBound || '-'}</span>
      </div>
    </div>
  );
}

export function VpaDetail({ data }: VpaDetailProps) {
  if (!data) return null;

  const spec = data.spec || {};
  const status = data.status || {};
  const updatePolicy = spec.updatePolicy || {};
  const recommendation = status.recommendation || {};
  const containerRecommendations = recommendation.containerRecommendations || [];

  return (
    <div className="space-y-4">
      {/* Update Policy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Update Policy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Mode:</span>
            <Badge variant="outline" className="font-mono">
              {updatePolicy.updateMode || 'Auto'}
            </Badge>
          </div>
          {spec.targetRef && (
            <div className="mt-2 text-sm text-muted-foreground">
              Target: {spec.targetRef.kind}/{spec.targetRef.name}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommendations */}
      {containerRecommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Recommendations ({containerRecommendations.length} containers)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {containerRecommendations.map((rec: VpaContainerRecommendation, i: number) => (
              <div key={i} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {rec.containerName}
                  </Badge>
                </div>

                {/* Table */}
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Resource</th>
                        <th className="px-3 py-2 text-left font-medium">Target</th>
                        <th className="px-3 py-2 text-left font-medium">Lower Bound</th>
                        <th className="px-3 py-2 text-left font-medium">Upper Bound</th>
                        <th className="px-3 py-2 text-left font-medium">Uncapped Target</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="px-3 py-2 font-medium">CPU</td>
                        <td className="px-3 py-2 font-mono">{rec.target?.cpu || '-'}</td>
                        <td className="px-3 py-2 font-mono">{rec.lowerBound?.cpu || '-'}</td>
                        <td className="px-3 py-2 font-mono">{rec.upperBound?.cpu || '-'}</td>
                        <td className="px-3 py-2 font-mono">{rec.uncappedTarget?.cpu || '-'}</td>
                      </tr>
                      <tr className="border-t">
                        <td className="px-3 py-2 font-medium">Memory</td>
                        <td className="px-3 py-2 font-mono">{rec.target?.memory || '-'}</td>
                        <td className="px-3 py-2 font-mono">{rec.lowerBound?.memory || '-'}</td>
                        <td className="px-3 py-2 font-mono">{rec.upperBound?.memory || '-'}</td>
                        <td className="px-3 py-2 font-mono">{rec.uncappedTarget?.memory || '-'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Visual bars */}
                <div className="space-y-2">
                  <RecommendationBar
                    label="CPU"
                    target={rec.target?.cpu || ''}
                    lowerBound={rec.lowerBound?.cpu || ''}
                    upperBound={rec.upperBound?.cpu || ''}
                  />
                  <RecommendationBar
                    label="Memory"
                    target={rec.target?.memory || ''}
                    lowerBound={rec.lowerBound?.memory || ''}
                    upperBound={rec.upperBound?.memory || ''}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {containerRecommendations.length === 0 && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground text-center">
              No recommendations available yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
