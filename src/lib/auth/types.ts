export interface AuthProviderStatus {
  authenticated: boolean;
  user?: string;
  expiresAt?: Date;
}

export interface AuthProviderAvailability {
  available: boolean;
  path?: string;
  version?: string;
}

export interface AuthConfigField {
  key: string;
  label: string;
  type: 'text' | 'select';
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface AuthProvider {
  id: string;
  name: string;
  icon: string;

  checkAvailability(): Promise<AuthProviderAvailability>;
  getStatus(config: Record<string, string>): Promise<AuthProviderStatus>;
  login(config: Record<string, string>): Promise<{ success: boolean; output?: string; error?: string }>;
  getConfigFields(): AuthConfigField[];
}
