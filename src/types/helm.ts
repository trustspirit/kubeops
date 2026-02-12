export interface HelmRelease {
  name: string;
  namespace: string;
  revision: string;
  updated: string;
  status: string;
  chart: string;
  app_version: string;
}

export interface HelmReleaseDetail {
  name: string;
  info: {
    first_deployed: string;
    last_deployed: string;
    deleted: string;
    description: string;
    status: string;
    notes: string;
  };
  chart: {
    metadata: {
      name: string;
      version: string;
      appVersion: string;
      description: string;
    };
  };
  config: Record<string, any>;
  version: number;
  namespace: string;
}

export interface HelmRevision {
  revision: number;
  updated: string;
  status: string;
  chart: string;
  app_version: string;
  description: string;
}

export interface HelmRepo {
  name: string;
  url: string;
}

export interface HelmSearchResult {
  name: string;
  chart_version: string;
  app_version: string;
  description: string;
}
