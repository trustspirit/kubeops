'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Sensitive key patterns
const SENSITIVE_PATTERNS = /password|passwd|secret|token|api[_-]?key|apikey|auth|credential|private/i;

function isSensitiveKey(name: string): boolean {
  return SENSITIVE_PATTERNS.test(name);
}

function MaskedValue({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      {revealed ? (
        <>
          <span className="font-mono break-all">{value}</span>
          <button onClick={() => setRevealed(false)} className="text-muted-foreground hover:text-foreground p-0.5"><EyeOff className="h-3 w-3" /></button>
        </>
      ) : (
        <>
          <span className="font-mono">{'•'.repeat(Math.min(value.length, 16))}</span>
          <button onClick={() => setRevealed(true)} className="text-muted-foreground hover:text-foreground p-0.5"><Eye className="h-3 w-3" /></button>
        </>
      )}
    </span>
  );
}

function SecretValueInline({ clusterId, namespace, secretName, secretKey }: {
  clusterId: string; namespace: string; secretName: string; secretKey: string;
}) {
  const { data, error, isLoading } = useSWR(
    `/api/clusters/${encodeURIComponent(clusterId)}/resources/${namespace}/secrets/${secretName}`,
    { revalidateOnFocus: false }
  );
  if (isLoading) return <Loader2 className="h-3 w-3 animate-spin inline" />;
  if (error) return <span className="text-amber-600 dark:text-amber-400">secret:{secretName}/{secretKey}</span>;

  const rawValue = data?.data?.[secretKey];
  if (!rawValue) return <span className="text-muted-foreground italic">key not found</span>;

  let decoded: string;
  try { decoded = atob(rawValue); } catch { decoded = rawValue; }

  return (
    <span className="inline-flex items-center gap-1">
      {isSensitiveKey(secretKey) ? <MaskedValue value={decoded} /> : <span className="font-mono break-all">{decoded}</span>}
      <span className="text-[9px] text-amber-600/60 dark:text-amber-400/60 ml-1">({secretName})</span>
    </span>
  );
}

function ConfigMapValueInline({ clusterId, namespace, configMapName, configMapKey }: {
  clusterId: string; namespace: string; configMapName: string; configMapKey: string;
}) {
  const { data, error, isLoading } = useSWR(
    `/api/clusters/${encodeURIComponent(clusterId)}/resources/${namespace}/configmaps/${configMapName}`,
    { revalidateOnFocus: false }
  );
  if (isLoading) return <Loader2 className="h-3 w-3 animate-spin inline" />;
  if (error) return <span className="text-cyan-600 dark:text-cyan-400">configmap:{configMapName}/{configMapKey}</span>;

  const value = data?.data?.[configMapKey];
  if (value === undefined) return <span className="text-muted-foreground italic">key not found</span>;

  return (
    <span className="inline-flex items-center gap-1">
      {isSensitiveKey(configMapKey) ? <MaskedValue value={value} /> : <span className="font-mono break-all">{value.length > 100 ? value.substring(0, 100) + '...' : value}</span>}
      <span className="text-[9px] text-cyan-600/60 dark:text-cyan-400/60 ml-1">({configMapName})</span>
    </span>
  );
}

// Single env var value cell
export function EnvValueCell({ env, clusterId, namespace }: {
  env: any; clusterId: string; namespace: string;
}) {
  if (env.value !== undefined) {
    if (isSensitiveKey(env.name) && env.value) return <MaskedValue value={env.value} />;
    return <span>{env.value || <span className="text-muted-foreground italic">empty</span>}</span>;
  }
  if (env.valueFrom?.secretKeyRef) {
    return <SecretValueInline clusterId={clusterId} namespace={namespace} secretName={env.valueFrom.secretKeyRef.name} secretKey={env.valueFrom.secretKeyRef.key} />;
  }
  if (env.valueFrom?.configMapKeyRef) {
    return <ConfigMapValueInline clusterId={clusterId} namespace={namespace} configMapName={env.valueFrom.configMapKeyRef.name} configMapKey={env.valueFrom.configMapKeyRef.key} />;
  }
  if (env.valueFrom?.fieldRef) return <span className="text-purple-600 dark:text-purple-400">field:{env.valueFrom.fieldRef.fieldPath}</span>;
  if (env.valueFrom?.resourceFieldRef) return <span className="text-purple-600 dark:text-purple-400">resource:{env.valueFrom.resourceFieldRef.resource}</span>;
  return <span className="text-muted-foreground">-</span>;
}

// Resolve envFrom references into individual env var rows
export function EnvFromRows({ envFrom, clusterId, namespace }: {
  envFrom: any[]; clusterId: string; namespace: string;
}) {
  return (
    <>
      {envFrom.map((ef: any, efi: number) => (
        <EnvFromBlock key={efi} entry={ef} clusterId={clusterId} namespace={namespace} />
      ))}
    </>
  );
}

// Resolve mounted Secret/ConfigMap volumes into env-like rows
export function MountedSecretRows({ volumes, volumeMounts, clusterId, namespace }: {
  volumes: any[]; volumeMounts: any[]; clusterId: string; namespace: string;
}) {
  // Find volume mounts that reference secrets or configmaps
  const mountedSecrets: { volumeName: string; secretName: string; mountPath: string }[] = [];
  const mountedConfigMaps: { volumeName: string; configMapName: string; mountPath: string }[] = [];
  const seen = new Set<string>();

  for (const vm of volumeMounts || []) {
    const vol = (volumes || []).find((v: any) => v.name === vm.name);
    if (!vol) continue;
    if (vol.secret && !seen.has(`secret:${vol.secret.secretName}`)) {
      seen.add(`secret:${vol.secret.secretName}`);
      mountedSecrets.push({ volumeName: vm.name, secretName: vol.secret.secretName, mountPath: vm.mountPath });
    } else if (vol.configMap && !seen.has(`cm:${vol.configMap.name}`)) {
      seen.add(`cm:${vol.configMap.name}`);
      mountedConfigMaps.push({ volumeName: vm.name, configMapName: vol.configMap.name, mountPath: vm.mountPath });
    } else if (vol.projected) {
      // Handle projected volumes (can contain multiple secrets/configmaps)
      for (const source of vol.projected.sources || []) {
        if (source.secret && !seen.has(`secret:${source.secret.name}`)) {
          seen.add(`secret:${source.secret.name}`);
          mountedSecrets.push({ volumeName: vm.name, secretName: source.secret.name, mountPath: vm.mountPath });
        }
        if (source.configMap && !seen.has(`cm:${source.configMap.name}`)) {
          seen.add(`cm:${source.configMap.name}`);
          mountedConfigMaps.push({ volumeName: vm.name, configMapName: source.configMap.name, mountPath: vm.mountPath });
        }
      }
    }
  }

  if (mountedSecrets.length === 0 && mountedConfigMaps.length === 0) return null;

  return (
    <>
      {mountedSecrets.map((ms) => (
        <MountedResourceBlock
          key={ms.secretName}
          clusterId={clusterId}
          namespace={namespace}
          resourceType="secrets"
          resourceName={ms.secretName}
          mountPath={ms.mountPath}
          isSecret={true}
        />
      ))}
      {mountedConfigMaps.map((mc) => (
        <MountedResourceBlock
          key={mc.configMapName}
          clusterId={clusterId}
          namespace={namespace}
          resourceType="configmaps"
          resourceName={mc.configMapName}
          mountPath={mc.mountPath}
          isSecret={false}
        />
      ))}
    </>
  );
}

function MountedResourceBlock({ clusterId, namespace, resourceType, resourceName, mountPath, isSecret }: {
  clusterId: string; namespace: string; resourceType: string; resourceName: string; mountPath: string; isSecret: boolean;
}) {
  const { data, error, isLoading } = useSWR(
    `/api/clusters/${encodeURIComponent(clusterId)}/resources/${namespace}/${resourceType}/${resourceName}`,
    { revalidateOnFocus: false }
  );

  if (isLoading) {
    return (
      <tr className="border-t">
        <td colSpan={2} className="px-3 py-1 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
          Loading {resourceType}/{resourceName}...
        </td>
      </tr>
    );
  }

  if (error) {
    return (
      <tr className="border-t">
        <td colSpan={2} className="px-3 py-1">
          <span className={isSecret ? 'text-amber-600 dark:text-amber-400' : 'text-cyan-600 dark:text-cyan-400'}>
            mounted: {resourceType}/{resourceName} (access denied)
          </span>
        </td>
      </tr>
    );
  }

  // Support both data and stringData fields
  const rawData = data?.data || {};
  const stringData = data?.stringData || {};
  const mergedData = { ...rawData, ...stringData };
  const entries = Object.entries(mergedData).sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) return null;

  // Check if a single key contains dotenv-style content (KEY=VALUE lines)
  const parsedEntries: [string, string][] = [];
  for (const [key, rawValue] of entries) {
    let value = rawValue as string;
    if (isSecret && data?.data?.[key]) {
      // Only decode base64 for items from data (not stringData)
      try { value = atob(value); } catch { /* keep raw */ }
    }
    // Try to parse as dotenv (.env file format)
    if (value.includes('=') && value.includes('\n')) {
      const lines = value.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const envKey = trimmed.substring(0, eqIdx).trim();
          let envVal = trimmed.substring(eqIdx + 1).trim();
          // Remove surrounding quotes
          if ((envVal.startsWith('"') && envVal.endsWith('"')) || (envVal.startsWith("'") && envVal.endsWith("'"))) {
            envVal = envVal.slice(1, -1);
          }
          parsedEntries.push([envKey, envVal]);
        }
      }
    } else {
      parsedEntries.push([key, value]);
    }
  }

  return (
    <>
      <tr className="border-t bg-muted/30">
        <td colSpan={2} className="px-3 py-1">
          <Badge variant={isSecret ? 'default' : 'secondary'} className="text-[9px] py-0 h-4 font-normal">
            Mounted {isSecret ? 'Secret' : 'ConfigMap'}: {resourceName}
          </Badge>
          <span className="text-[10px] text-muted-foreground ml-1.5">{mountPath}</span>
        </td>
      </tr>
      {parsedEntries.map(([key, value], idx) => {
        const sensitive = isSensitiveKey(key);
        return (
          <tr key={`${resourceName}:${idx}`} className="border-t hover:bg-muted/30">
            <td className="px-3 py-1 font-mono font-medium text-blue-600 dark:text-blue-400 truncate">{key}</td>
            <td className="px-3 py-1 font-mono overflow-hidden">
              <div className="break-all">
                {sensitive && value ? (
                  <MaskedValue value={value} />
                ) : (
                  value
                )}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

// Pod-level: extract ALL secret/configmap names from entire pod spec and show all keys
export function PodLinkedSecrets({ podSpec, clusterId, namespace }: {
  podSpec: any; clusterId: string; namespace: string;
}) {
  // Gather every unique secret & configmap referenced in the entire pod spec
  const secretNames = new Set<string>();
  const configMapNames = new Set<string>();

  const allContainers = [
    ...(podSpec.containers || []),
    ...(podSpec.initContainers || []),
    ...(podSpec.ephemeralContainers || []),
  ];

  for (const ctr of allContainers) {
    // env[].valueFrom.secretKeyRef / configMapKeyRef
    for (const env of ctr.env || []) {
      if (env.valueFrom?.secretKeyRef?.name) secretNames.add(env.valueFrom.secretKeyRef.name);
      if (env.valueFrom?.configMapKeyRef?.name) configMapNames.add(env.valueFrom.configMapKeyRef.name);
    }
    // envFrom[].secretRef / configMapRef
    for (const ef of ctr.envFrom || []) {
      if (ef.secretRef?.name) secretNames.add(ef.secretRef.name);
      if (ef.configMapRef?.name) configMapNames.add(ef.configMapRef.name);
    }
  }

  // volumes
  for (const vol of podSpec.volumes || []) {
    if (vol.secret?.secretName) secretNames.add(vol.secret.secretName);
    if (vol.configMap?.name) configMapNames.add(vol.configMap.name);
    if (vol.projected) {
      for (const src of vol.projected.sources || []) {
        if (src.secret?.name) secretNames.add(src.secret.name);
        if (src.configMap?.name) configMapNames.add(src.configMap.name);
      }
    }
    if (vol.csi?.volumeAttributes?.secretProviderClass) {
      // CSI secrets-store volumes: we can't directly resolve these
    }
  }

  // imagePullSecrets
  for (const ips of podSpec.imagePullSecrets || []) {
    if (ips.name) secretNames.add(ips.name);
  }

  const secrets = Array.from(secretNames).sort();
  const configMaps = Array.from(configMapNames).sort();

  if (secrets.length === 0 && configMaps.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Linked Secrets & ConfigMaps</h3>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '35%' }} />
            <col style={{ width: '65%' }} />
          </colgroup>
          <thead className="bg-muted/50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Key</th>
              <th className="px-3 py-1.5 text-left font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {secrets.map((name) => (
              <LinkedResourceBlock
                key={`s:${name}`}
                clusterId={clusterId}
                namespace={namespace}
                resourceType="secrets"
                resourceName={name}
                isSecret={true}
              />
            ))}
            {configMaps.map((name) => (
              <LinkedResourceBlock
                key={`cm:${name}`}
                clusterId={clusterId}
                namespace={namespace}
                resourceType="configmaps"
                resourceName={name}
                isSecret={false}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LinkedResourceBlock({ clusterId, namespace, resourceType, resourceName, isSecret }: {
  clusterId: string; namespace: string; resourceType: string; resourceName: string; isSecret: boolean;
}) {
  const { data, error, isLoading } = useSWR(
    `/api/clusters/${encodeURIComponent(clusterId)}/resources/${namespace}/${resourceType}/${resourceName}`,
    { revalidateOnFocus: false }
  );

  if (isLoading) {
    return (
      <tr className="border-t">
        <td colSpan={2} className="px-3 py-1 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
          {resourceName}...
        </td>
      </tr>
    );
  }

  if (error) {
    return (
      <tr className="border-t">
        <td colSpan={2} className="px-3 py-1">
          <Badge variant={isSecret ? 'default' : 'secondary'} className="text-[9px] py-0 h-4 font-normal mr-1">
            {isSecret ? 'Secret' : 'ConfigMap'}
          </Badge>
          <span className={isSecret ? 'text-amber-600 dark:text-amber-400' : 'text-cyan-600 dark:text-cyan-400'}>
            {resourceName} <span className="text-muted-foreground">(access denied)</span>
          </span>
        </td>
      </tr>
    );
  }

  const rawData = data?.data || {};
  const stringData = data?.stringData || {};
  const mergedData = { ...rawData, ...stringData };
  const entries = Object.entries(mergedData).sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    return (
      <tr className="border-t">
        <td colSpan={2} className="px-3 py-1 text-muted-foreground italic">
          <Badge variant={isSecret ? 'default' : 'secondary'} className="text-[9px] py-0 h-4 font-normal mr-1">
            {isSecret ? 'Secret' : 'ConfigMap'}
          </Badge>
          {resourceName} (empty)
        </td>
      </tr>
    );
  }

  // Parse entries, decode base64 for secrets, expand dotenv format
  const parsedEntries: [string, string][] = [];
  for (const [key, rawValue] of entries) {
    let value = rawValue as string;
    if (isSecret && rawData[key]) {
      try { value = atob(value); } catch { /* keep raw */ }
    }
    // Try to parse as dotenv (.env file format)
    if (value.includes('=') && value.includes('\n')) {
      const lines = value.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const envKey = trimmed.substring(0, eqIdx).trim();
          let envVal = trimmed.substring(eqIdx + 1).trim();
          if ((envVal.startsWith('"') && envVal.endsWith('"')) || (envVal.startsWith("'") && envVal.endsWith("'"))) {
            envVal = envVal.slice(1, -1);
          }
          parsedEntries.push([envKey, envVal]);
        }
      }
    } else {
      parsedEntries.push([key, value]);
    }
  }

  return (
    <>
      <tr className="border-t bg-muted/30">
        <td colSpan={2} className="px-3 py-1">
          <Badge variant={isSecret ? 'default' : 'secondary'} className="text-[9px] py-0 h-4 font-normal">
            {isSecret ? 'Secret' : 'ConfigMap'}: {resourceName}
          </Badge>
          <span className="text-[10px] text-muted-foreground ml-1.5">{parsedEntries.length} keys</span>
        </td>
      </tr>
      {parsedEntries.map(([key, value], pi) => {
        const sensitive = isSensitiveKey(key);
        return (
          <tr key={`linked:${resourceName}:${pi}`} className="border-t hover:bg-muted/30">
            <td className="px-3 py-1 font-mono font-medium text-blue-600 dark:text-blue-400 truncate">{key}</td>
            <td className="px-3 py-1 font-mono overflow-hidden">
              <div className="break-all">
                {sensitive && value ? (
                  <MaskedValue value={value} />
                ) : (
                  value
                )}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

function EnvFromBlock({ entry, clusterId, namespace }: {
  entry: any; clusterId: string; namespace: string;
}) {
  const isSecret = !!entry.secretRef;
  const resourceName = entry.secretRef?.name || entry.configMapRef?.name;
  const prefix = entry.prefix || '';
  const resourceType = isSecret ? 'secrets' : 'configmaps';

  const { data, error, isLoading } = useSWR(
    resourceName ? `/api/clusters/${encodeURIComponent(clusterId)}/resources/${namespace}/${resourceType}/${resourceName}` : null,
    { revalidateOnFocus: false }
  );

  if (!resourceName) return null;

  if (isLoading) {
    return (
      <tr className="border-t">
        <td colSpan={2} className="px-3 py-1 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
          Loading {resourceType}/{resourceName}...
        </td>
      </tr>
    );
  }

  if (error) {
    return (
      <tr className="border-t">
        <td colSpan={2} className="px-3 py-1">
          <span className={isSecret ? 'text-amber-600 dark:text-amber-400' : 'text-cyan-600 dark:text-cyan-400'}>
            envFrom: {resourceType}/{resourceName} (access denied)
          </span>
        </td>
      </tr>
    );
  }

  const rawData = data?.data || {};
  const entries = Object.entries(rawData).sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    return (
      <tr className="border-t">
        <td colSpan={2} className="px-3 py-1 text-muted-foreground italic">
          envFrom: {resourceType}/{resourceName} (empty)
        </td>
      </tr>
    );
  }

  return (
    <>
      {/* Section header */}
      <tr className="border-t bg-muted/30">
        <td colSpan={2} className="px-3 py-1">
          <Badge variant={isSecret ? 'default' : 'secondary'} className="text-[9px] py-0 h-4 font-normal">
            {isSecret ? 'Secret' : 'ConfigMap'}: {resourceName}
          </Badge>
          {prefix && <span className="text-[10px] text-muted-foreground ml-1.5">prefix: {prefix}</span>}
        </td>
      </tr>
      {entries.map(([key, rawValue], idx) => {
        const envName = `${prefix}${key}`;
        let displayValue = rawValue as string;

        // Decode base64 for secrets
        if (isSecret) {
          try { displayValue = atob(displayValue); } catch { /* keep raw */ }
        }

        const sensitive = isSensitiveKey(envName) || isSensitiveKey(key);

        return (
          <tr key={`${resourceName}:${idx}`} className="border-t hover:bg-muted/30">
            <td className="px-3 py-1 font-mono font-medium text-blue-600 dark:text-blue-400 truncate">{envName}</td>
            <td className="px-3 py-1 font-mono overflow-hidden">
              <div className="break-all">
                {sensitive && displayValue ? (
                  <MaskedValue value={displayValue} />
                ) : (
                  displayValue
                )}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
