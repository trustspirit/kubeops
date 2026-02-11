import { NextRequest, NextResponse } from 'next/server';
import { getKubeConfigForContext } from '@/lib/k8s/kubeconfig-manager';

export const dynamic = 'force-dynamic';

function extractK8sError(error: any): { status: number; message: string } {
  const status = error?.code || error?.statusCode || 500;
  let body = error?.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { /* keep as string */ }
  }
  return { status, message: body?.message || error?.message || 'Request failed' };
}

// Helper: make HTTPS request through K8s API
function k8sRequest(server: string, path: string, opts: any, skipTLS?: boolean, accept = 'application/json'): Promise<string> {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const urlObj = new URL(`${server}${path}`);
    const reqOpts: any = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { 'Accept': accept },
      ca: opts.ca, cert: opts.cert, key: opts.key,
      rejectUnauthorized: !skipTLS,
    };
    const request = https.request(reqOpts, (res: any) => {
      let body = '';
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject({ code: res.statusCode, message: body.slice(0, 500) });
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

// Prometheus service discovery cache
let promCache: { svc: string | null; ns: string; checkedAt: number } | null = null;

async function findPrometheusService(server: string, opts: any, skipTLS?: boolean): Promise<{ ns: string; svc: string } | null> {
  // Cache for 2 minutes (null result) or 10 minutes (found)
  const cacheTTL = promCache?.svc ? 600_000 : 120_000;
  if (promCache && Date.now() - promCache.checkedAt < cacheTTL) {
    return promCache.svc ? { ns: promCache.ns, svc: promCache.svc } : null;
  }

  const candidates = [
    // Victoria Metrics
    { ns: 'victoria-metrics', names: ['vmsingle-victoria-metrics', 'vmselect-victoria-metrics', 'victoria-metrics'] },
    { ns: 'monitoring', names: ['vmsingle-victoria-metrics', 'vmselect-victoria-metrics'] },
    // Prometheus
    { ns: 'monitoring', names: ['prometheus-server', 'prometheus-kube-prometheus-prometheus', 'prometheus-operated', 'prometheus', 'kube-prometheus-stack-prometheus'] },
    { ns: 'prometheus', names: ['prometheus-server', 'prometheus'] },
    { ns: 'lens-metrics', names: ['prometheus'] },
    { ns: 'kube-system', names: ['prometheus'] },
    { ns: 'observability', names: ['prometheus', 'prometheus-server'] },
  ];

  for (const { ns, names } of candidates) {
    for (const svcName of names) {
      try {
        const raw = await k8sRequest(server, `/api/v1/namespaces/${ns}/services/${svcName}`, opts, skipTLS);
        const svc = JSON.parse(raw);
        const port = svc.spec?.ports?.find((p: any) => p.port === 9090 || p.port === 8429 || p.port === 8428 || p.port === 80 || p.name === 'http' || p.name === 'web');
        if (port) {
          promCache = { svc: `${svcName}:${port.port}`, ns, checkedAt: Date.now() };
          console.log(`[Metrics] Found Prometheus: ${ns}/${svcName}:${port.port}`);
          return { ns, svc: `${svcName}:${port.port}` };
        }
      } catch { /* not found, try next */ }
    }
  }

  promCache = { svc: null, ns: '', checkedAt: Date.now() };
  return null;
}

async function queryPrometheus(server: string, opts: any, skipTLS: boolean | undefined, prom: { ns: string; svc: string }, query: string): Promise<number> {
  const path = `/api/v1/namespaces/${prom.ns}/services/${prom.svc}/proxy/api/v1/query?query=${encodeURIComponent(query)}`;
  const raw = await k8sRequest(server, path, opts, skipTLS);
  const data = JSON.parse(raw);
  const result = data?.data?.result?.[0];
  if (!result) return 0;
  return parseFloat(result.value?.[1] || '0');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clusterId: string }> }
) {
  const { clusterId } = await params;
  const contextName = decodeURIComponent(clusterId);
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'pods';
  const namespace = searchParams.get('namespace') || '_all';
  const name = searchParams.get('name');

  const kc = getKubeConfigForContext(contextName);
  const cluster = kc.getCurrentCluster();
  if (!cluster) {
    return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
  }

  try {
    const opts: any = {};
    await kc.applyToHTTPSOptions(opts);

    // Prometheus-based metrics for network & filesystem I/O
    if (type === 'prometheus') {
      const podName = name;
      const nodeName = searchParams.get('node');
      if (!podName || !namespace || namespace === '_all') {
        return NextResponse.json({ error: 'pod name and namespace required' }, { status: 400 });
      }

      const results: Record<string, number> = { netRxBytes: 0, netTxBytes: 0, fsReadBytes: 0, fsWriteBytes: 0 };

      // Try Prometheus/VictoriaMetrics first
      const prom = await findPrometheusService(cluster.server, opts, cluster.skipTLSVerify);
      if (prom) {
        const queries: Record<string, string> = {
          netRxBytes: `sum(container_network_receive_bytes_total{pod="${podName}",namespace="${namespace}"})`,
          netTxBytes: `sum(container_network_transmit_bytes_total{pod="${podName}",namespace="${namespace}"})`,
          fsReadBytes: `sum(container_fs_reads_bytes_total{pod="${podName}",namespace="${namespace}"})`,
          fsWriteBytes: `sum(container_fs_writes_bytes_total{pod="${podName}",namespace="${namespace}"})`,
        };
        for (const [key, query] of Object.entries(queries)) {
          try { results[key] = await queryPrometheus(cluster.server, opts, cluster.skipTLSVerify, prom, query); } catch { /* keep 0 */ }
        }
        // If Prometheus had data, return it
        if (results.netRxBytes > 0 || results.fsReadBytes > 0) {
          return NextResponse.json(results);
        }
      }

      // Fallback: kubelet stats/summary via node proxy
      if (nodeName) {
        try {
          const statsPath = `/api/v1/nodes/${nodeName}/proxy/stats/summary`;
          const statsRaw = await k8sRequest(cluster.server, statsPath, opts, cluster.skipTLSVerify);
          const statsData = JSON.parse(statsRaw);
          const pod = (statsData.pods || []).find((p: any) =>
            p.podRef?.name === podName && p.podRef?.namespace === namespace
          );
          if (pod) {
            results.netRxBytes = pod.network?.rxBytes || 0;
            results.netTxBytes = pod.network?.txBytes || 0;
            // Aggregate container rootfs IO as filesystem proxy
            let fsR = 0, fsW = 0;
            for (const c of pod.containers || []) {
              fsR += c.rootfs?.usedBytes || 0;
              fsW += (c.logs?.usedBytes || 0);
            }
            results.fsReadBytes = fsR;
            results.fsWriteBytes = fsW;
          }
        } catch {
          // kubelet proxy also unavailable - return zeros
        }
      }

      return NextResponse.json(results);
    }

    // K8s Metrics API for CPU/Memory
    let metricsPath: string;
    if (type === 'nodes') {
      metricsPath = name
        ? `/apis/metrics.k8s.io/v1beta1/nodes/${name}`
        : '/apis/metrics.k8s.io/v1beta1/nodes';
    } else {
      if (name && namespace !== '_all') {
        metricsPath = `/apis/metrics.k8s.io/v1beta1/namespaces/${namespace}/pods/${name}`;
      } else if (namespace !== '_all') {
        metricsPath = `/apis/metrics.k8s.io/v1beta1/namespaces/${namespace}/pods`;
      } else {
        metricsPath = '/apis/metrics.k8s.io/v1beta1/pods';
      }
    }

    const raw = await k8sRequest(cluster.server, metricsPath, opts, cluster.skipTLSVerify);
    return NextResponse.json(JSON.parse(raw));
  } catch (error: any) {
    const { status, message } = extractK8sError(error);
    console.error(`[Metrics] ${type}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
