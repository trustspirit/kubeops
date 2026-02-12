import { NextRequest, NextResponse } from 'next/server';
import * as k8s from '@kubernetes/client-node';
import { getKubeConfigForContext } from '@/lib/k8s/kubeconfig-manager';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { clusterId } = await params;
  const contextName = decodeURIComponent(clusterId);

  try {
    const kc = getKubeConfigForContext(contextName);
    const client = kc.makeApiClient(k8s.ApiextensionsV1Api);
    const result = await client.listCustomResourceDefinition();

    // Transform CRD list into a more frontend-friendly format
    const crds = (result.items || []).map((crd: any) => {
      const spec = crd.spec || {};
      const names = spec.names || {};
      const servingVersion = (spec.versions || []).find((v: any) => v.served && v.storage)
        || (spec.versions || [])[0]
        || {};
      const printerColumns = servingVersion.additionalPrinterColumns || [];

      return {
        name: crd.metadata?.name,
        group: spec.group,
        kind: names.kind,
        plural: names.plural,
        singular: names.singular,
        scope: spec.scope, // Namespaced or Cluster
        version: servingVersion.name,
        versions: (spec.versions || [])
          .filter((v: any) => v.served)
          .map((v: any) => v.name),
        printerColumns,
      };
    });

    return NextResponse.json({ items: crds });
  } catch (error: any) {
    const status = error?.statusCode || error?.response?.statusCode || 500;
    const message = error?.body?.message || error?.message || 'Failed to list CRDs';
    console.error(`[K8s API] GET CRDs: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
