import { loadKubeConfig } from '@/lib/k8s/kubeconfig-manager';

interface DetectionResult {
  providerId: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  /** For Teleport contexts: the --kube-cluster value from exec args */
  kubeCluster?: string;
}

/**
 * Detect the auth provider for a given kubeconfig context.
 * Inspects exec.command and server URL patterns.
 */
export function detectProvider(contextName: string): DetectionResult {
  const kc = loadKubeConfig();
  const context = kc.getContexts().find(c => c.name === contextName);
  if (!context) {
    return { providerId: null, confidence: 'low', reason: 'Context not found' };
  }

  const cluster = kc.getClusters().find(c => c.name === context.cluster);
  const user = kc.getUsers().find(u => u.name === context.user);
  const server = cluster?.server || '';
  const exec = user?.exec;
  const execCommand = exec?.command || '';
  const execArgs = (exec?.args || []).join(' ');

  // Teleport
  if (execCommand.includes('tsh') || execCommand.endsWith('/tsh')) {
    // Extract --kube-cluster from exec args for tsh kube login
    const execArgsList = exec?.args || [];
    const kubeClusterArg = execArgsList.find((a: string) => a.startsWith('--kube-cluster='));
    const kubeCluster = kubeClusterArg?.split('=')[1] || undefined;
    return { providerId: 'tsh', confidence: 'high', reason: `exec.command: ${execCommand}`, kubeCluster };
  }

  // AWS EKS
  if (
    execCommand.includes('aws') ||
    execCommand.includes('aws-iam-authenticator') ||
    server.includes('.eks.amazonaws.com')
  ) {
    const isSSO = execArgs.includes('--profile') || execArgs.includes('sso');
    return {
      providerId: isSSO ? 'aws-sso' : 'aws-iam',
      confidence: server.includes('.eks.amazonaws.com') ? 'high' : 'medium',
      reason: `exec.command: ${execCommand}, server: ${server}`,
    };
  }

  // GKE
  if (
    execCommand.includes('gke-gcloud-auth-plugin') ||
    execCommand.includes('gcloud') ||
    server.includes('gke.io') ||
    server.includes('container.googleapis.com')
  ) {
    return { providerId: 'gke', confidence: 'high', reason: `exec.command: ${execCommand}, server: ${server}` };
  }

  // AKS — kubelogin with --server-id or azmk8s.io server
  if (
    (execCommand.includes('kubelogin') && execArgs.includes('--server-id')) ||
    server.includes('.azmk8s.io')
  ) {
    return { providerId: 'aks', confidence: 'high', reason: `exec.command: ${execCommand}, server: ${server}` };
  }

  // OIDC — kubelogin without Azure markers
  if (execCommand.includes('kubelogin') || execCommand.includes('oidc-login')) {
    return { providerId: 'oidc', confidence: 'medium', reason: `exec.command: ${execCommand}` };
  }

  return { providerId: null, confidence: 'low', reason: 'No matching pattern found' };
}
