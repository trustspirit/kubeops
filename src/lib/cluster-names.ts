/** Extract the real kube cluster name by stripping the kubeconfig cluster prefix.
 *  e.g. context="ovdr-teleport-dev-bet-aws-apne2-a01", cluster="ovdr-teleport"
 *       → prefix "ovdr-teleport-", real name "dev-bet-aws-apne2-a01"  */
export function parseClusterName(contextName: string, clusterField: string) {
  const prefix = clusterField + '-';
  if (contextName.startsWith(prefix) && contextName.length > prefix.length) {
    return { prefix, realName: contextName.slice(prefix.length) };
  }
  return { prefix: '', realName: contextName };
}
