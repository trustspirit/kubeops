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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clusterId: string }> }
) {
  const { clusterId } = await params;
  const contextName = decodeURIComponent(clusterId);
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'pods'; // pods or nodes
  const namespace = searchParams.get('namespace') || '_all';
  const name = searchParams.get('name'); // specific pod/node name

  const kc = getKubeConfigForContext(contextName);
  const cluster = kc.getCurrentCluster();
  if (!cluster) {
    return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
  }

  try {
    const opts: any = {};
    await kc.applyToHTTPSOptions(opts);

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

    const url = `${cluster.server}${metricsPath}`;

    // Build fetch options with TLS certs
    const fetchOpts: any = {
      headers: { 'Accept': 'application/json', ...opts.headers },
    };

    // For Node.js fetch with TLS client certs
    if (opts.ca || opts.cert || opts.key) {
      const tls = await import('tls');
      const https = await import('https');
      const agent = new https.Agent({
        ca: opts.ca,
        cert: opts.cert,
        key: opts.key,
        rejectUnauthorized: !cluster.skipTLSVerify,
      });
      fetchOpts.agent = agent;
    }

    // Use Node.js http/https for proper TLS client cert support
    const data = await new Promise<any>((resolve, reject) => {
      const https = require('https');
      const urlObj = new URL(url);
      const reqOpts: any = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        ca: opts.ca,
        cert: opts.cert,
        key: opts.key,
        rejectUnauthorized: !cluster.skipTLSVerify,
      };

      const request = https.request(reqOpts, (res: any) => {
        let body = '';
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); }
          } else {
            reject({ code: res.statusCode, message: body });
          }
        });
      });
      request.on('error', reject);
      request.end();
    });

    return NextResponse.json(data);
  } catch (error: any) {
    const { status, message } = extractK8sError(error);
    console.error(`[Metrics] ${type}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
