export const EXTERNAL_SECRET_FORCE_SYNC_ANNOTATION = 'force-sync';

interface ExternalSecretIdentity {
  group?: string;
  plural?: string;
  kind?: string;
}

export function isExternalSecretResource({ group, plural, kind }: ExternalSecretIdentity): boolean {
  return (
    group === 'external-secrets.io' &&
    (plural === 'externalsecrets' || kind === 'ExternalSecret')
  );
}

export function createForceSyncValue(date = new Date()): string {
  return Math.floor(date.getTime() / 1000).toString();
}

export function buildExternalSecretForceSyncPatch(value = createForceSyncValue()) {
  return {
    metadata: {
      annotations: {
        [EXTERNAL_SECRET_FORCE_SYNC_ANNOTATION]: value,
      },
    },
  };
}
