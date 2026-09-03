import { clearClientCache } from './client-factory';
import { invalidateKubeConfigCache } from './kubeconfig-manager';
import { clearStatusCache } from './cluster-status-cache';
import { shutdownAllWatchManagers } from './watch-manager';

/**
 * Called after the app itself writes to the kubeconfig (merge, add/edit/delete
 * context, switch current context).
 *
 * Every layer keeps its own TTL cache; without this the UI kept serving the
 * pre-edit context list for up to 30s and cached API clients kept talking to
 * contexts the user had just deleted.
 */
export function invalidateKubeconfigDerivedCaches(): void {
  invalidateKubeConfigCache();
  clearClientCache();
  clearStatusCache();
  // Watches hold a KubeConfig snapshot taken at construction time.
  shutdownAllWatchManagers();
}
