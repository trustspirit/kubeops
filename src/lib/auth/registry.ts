import type { AuthProvider } from './types';

const providers = new Map<string, AuthProvider>();

export function registerProvider(provider: AuthProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): AuthProvider | undefined {
  return providers.get(id);
}

export function getAllProviders(): AuthProvider[] {
  return Array.from(providers.values());
}
