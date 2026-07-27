import { registerProvider } from './registry';
import { tshProvider } from './tsh/provider';
import { awsSsoProvider, awsIamProvider } from './aws/provider';
import { oidcProvider } from './oidc/provider';
import { gkeProvider } from './gke/provider';
import { aksProvider } from './aks/provider';
import { argocdProvider } from './argocd/provider';

let registered = false;

export function registerAllProviders(): void {
  if (registered) return;
  registered = true;

  registerProvider(tshProvider);
  registerProvider(awsSsoProvider);
  registerProvider(awsIamProvider);
  registerProvider(oidcProvider);
  registerProvider(gkeProvider);
  registerProvider(aksProvider);
  registerProvider(argocdProvider);
}

// Auto-register on import
registerAllProviders();
