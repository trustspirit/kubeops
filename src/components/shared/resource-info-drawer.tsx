'use client';

import useSWR from 'swr';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgeDisplay } from '@/components/shared/age-display';
import { ExternalLink, Terminal, AlertTriangle, CircleCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePanelStore } from '@/stores/panel-store';
import type { ResourceNodeData } from './resource-node';

/** Map node kind to the API resource type plural */
const KIND_TO_RESOURCE_TYPE: Record<string, string> = {
  Pod: 'pods',
  Deployment: 'deployments',
  StatefulSet: 'statefulsets',
  DaemonSet: 'daemonsets',
  ReplicaSet: 'replicasets',
  Service: 'services',
  Ingress: 'ingresses',
  Job: 'jobs',
  CronJob: 'cronjobs',
  ConfigMap: 'configmaps',
  Secret: 'secrets',
};

interface ResourceInfoDrawerProps {
  node: ResourceNodeData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResourceInfoDrawer({ node, open, onOpenChange }: ResourceInfoDrawerProps) {
  const router = useRouter();

  if (!node) return null;

  const { kind, name, namespace, clusterId, href, health } = node;
  const resourceType = KIND_TO_RESOURCE_TYPE[kind] || kind.toLowerCase() + 's';
  const clusterIdEnc = clusterId ? encodeURIComponent(clusterId) : '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[440px] sm:max-w-[440px] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2 border-b">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-base truncate">{name}</SheetTitle>
            <Badge variant="secondary" className="text-[10px] shrink-0">{kind}</Badge>
          </div>
          <SheetDescription className="text-xs">
            {namespace && <span>{namespace}</span>}
            {health && (
              <>
                {' · '}
                <span className={
                  health === 'Healthy' ? 'text-green-500' :
                  health === 'Degraded' ? 'text-red-500' :
                  health === 'Progressing' ? 'text-yellow-500' :
                  'text-muted-foreground'
                }>
                  {health}
                </span>
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 mt-2 w-fit">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-1 min-h-0 mt-0 px-4 pb-4">
            <ScrollArea className="h-full">
              <DrawerOverview
                kind={kind}
                name={name}
                namespace={namespace}
                clusterId={clusterId}
                resourceType={resourceType}
                clusterIdEnc={clusterIdEnc}
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="events" className="flex-1 min-h-0 mt-0 px-4 pb-4">
            <ScrollArea className="h-full">
              <DrawerEvents
                name={name}
                namespace={namespace}
                clusterIdEnc={clusterIdEnc}
              />
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Footer actions */}
        <div className="border-t px-4 py-3 flex gap-2">
          {href && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => { router.push(href); onOpenChange(false); }}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Detail Page
            </Button>
          )}
          {kind === 'Pod' && namespace && clusterId && (
            <OpenLogsButton
              clusterId={clusterId}
              namespace={namespace}
              podName={name}
              clusterIdEnc={clusterIdEnc}
              onDone={() => onOpenChange(false)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Overview sub-component                                              */
/* ------------------------------------------------------------------ */

function DrawerOverview({
  kind,
  name,
  namespace,
  clusterId,
  resourceType,
  clusterIdEnc,
}: {
  kind: string;
  name: string;
  namespace?: string;
  clusterId?: string;
  resourceType: string;
  clusterIdEnc: string;
}) {
  const apiUrl =
    clusterId && namespace
      ? `/api/clusters/${clusterIdEnc}/resources/${namespace}/${resourceType}/${name}`
      : null;

  const { data, isLoading } = useSWR(apiUrl, { refreshInterval: 10000 });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading...
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground py-4">No data available</p>;
  }

  const metadata = data.metadata || {};
  const status = data.status || {};
  const spec = data.spec || {};

  return (
    <div className="space-y-4 pt-2">
      {/* Metadata */}
      <Section title="Metadata">
        <Row label="Name" value={metadata.name} mono />
        {metadata.namespace && <Row label="Namespace" value={metadata.namespace} mono />}
        <Row label="UID" value={metadata.uid} mono small />
        <RowAge label="Age" timestamp={metadata.creationTimestamp} />
      </Section>

      {/* Kind-specific info */}
      {kind === 'Pod' && <PodOverview status={status} spec={spec} />}
      {(kind === 'Deployment' || kind === 'StatefulSet' || kind === 'DaemonSet') && (
        <WorkloadOverview kind={kind} status={status} spec={spec} />
      )}
      {kind === 'ReplicaSet' && (
        <Section title="Replicas">
          <Row label="Desired" value={spec.replicas ?? 0} />
          <Row label="Ready" value={status.readyReplicas ?? 0} />
          <Row label="Available" value={status.availableReplicas ?? 0} />
        </Section>
      )}
      {kind === 'Service' && <ServiceOverview spec={spec} />}
      {kind === 'Ingress' && <IngressOverview spec={spec} status={status} />}

      {/* Labels */}
      {metadata.labels && Object.keys(metadata.labels).length > 0 && (
        <Section title="Labels">
          <div className="flex flex-wrap gap-1">
            {Object.entries(metadata.labels).map(([k, v]) => (
              <Badge key={k} variant="secondary" className="text-[10px] font-mono">
                {k}={v as string}
              </Badge>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Events sub-component                                                */
/* ------------------------------------------------------------------ */

function DrawerEvents({
  name,
  namespace,
  clusterIdEnc,
}: {
  name: string;
  namespace?: string;
  clusterIdEnc: string;
}) {
  const apiUrl =
    namespace && clusterIdEnc
      ? `/api/clusters/${clusterIdEnc}/resources/${namespace}/events`
      : null;

  const { data, isLoading } = useSWR(apiUrl, { refreshInterval: 10000 });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading events...
      </div>
    );
  }

  const allEvents: Record<string, unknown>[] = data?.items || [];
  // Match events by involvedObject name (also match prefix for pods owned by this resource)
  const events = allEvents
    .filter((e) => {
      const involvedObject = e.involvedObject as Record<string, string> | undefined;
      const objName = involvedObject?.name;
      return objName === name || objName?.startsWith(name + '-');
    })
    .sort((a, b) => {
      // Warnings first, then by time
      if (a.type !== b.type) {
        if (a.type === 'Warning') return -1;
        if (b.type === 'Warning') return 1;
      }
      const aMeta = a.metadata as Record<string, string> | undefined;
      const bMeta = b.metadata as Record<string, string> | undefined;
      const ta = (a.lastTimestamp as string) || aMeta?.creationTimestamp || '';
      const tb = (b.lastTimestamp as string) || bMeta?.creationTimestamp || '';
      return tb.localeCompare(ta);
    });

  const warningCount = events.filter((e) => e.type === 'Warning').length;

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
        <CircleCheck className="h-8 w-8 text-green-500/60" />
        <span>No events found</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-2">
      {/* Summary bar */}
      <div className="flex items-center gap-2 text-xs pb-1">
        {warningCount > 0 ? (
          <Badge variant="destructive" className="text-[10px]">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {warningCount} warning{warningCount > 1 ? 's' : ''}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px] text-green-600">
            <CircleCheck className="h-3 w-3 mr-1" />
            Healthy
          </Badge>
        )}
        <span className="text-muted-foreground">{events.length} event{events.length > 1 ? 's' : ''}</span>
      </div>

      {events.map((evt, i: number) => {
        const isWarning = evt.type === 'Warning';
        const reason = (evt.reason as string) || '';
        const isUnhealthy = isWarning || [
          'BackOff', 'Failed', 'FailedScheduling', 'Unhealthy',
          'FailedMount', 'FailedAttachVolume', 'ImagePullBackOff',
          'CrashLoopBackOff', 'ErrImagePull', 'OOMKilled',
        ].some((r) => reason.includes(r));

        return (
          <div
            key={(evt.metadata as Record<string, string>)?.uid || i}
            className={`rounded-md border p-2.5 text-xs space-y-1 ${
              isUnhealthy
                ? 'border-red-500/40 bg-red-500/5'
                : ''
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Badge
                variant={isUnhealthy ? 'destructive' : 'secondary'}
                className="text-[10px]"
              >
                {evt.type as string}
              </Badge>
              <span className="font-medium text-foreground">{reason}</span>
              {((evt.count as number) ?? 0) > 1 && (
                <span className="text-muted-foreground">x{evt.count as number}</span>
              )}
              <span className="ml-auto text-muted-foreground shrink-0">
                <AgeDisplay timestamp={(evt.lastTimestamp as string) || (evt.metadata as Record<string, string>)?.creationTimestamp} />
              </span>
            </div>
            <p className="text-muted-foreground leading-relaxed break-words">{evt.message as string}</p>
            {(evt.involvedObject as Record<string, string>)?.name !== name && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {(evt.involvedObject as Record<string, string>)?.kind}/{(evt.involvedObject as Record<string, string>)?.name}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kind-specific overview sections                                     */
/* ------------------------------------------------------------------ */

function PodOverview({ status, spec }: { status: Record<string, unknown>; spec: Record<string, unknown> }) {
  const containers = (spec.containers || []) as Array<Record<string, unknown>>;
  const containerStatuses = (status.containerStatuses || []) as Array<Record<string, unknown>>;

  return (
    <>
      <Section title="Status">
        <Row label="Phase" value={status.phase as string} />
        <Row label="Pod IP" value={(status.podIP as string) || '-'} mono />
        <Row label="Node" value={(spec.nodeName as string) || (status.hostIP as string) || '-'} mono />
        <Row label="Restart Policy" value={(spec.restartPolicy as string) || '-'} />
      </Section>
      <Section title={`Containers (${containers.length})`}>
        {containers.map((c) => {
          const cs = containerStatuses.find((s) => s.name === c.name);
          const state = cs?.state as Record<string, unknown> | undefined;
          const stateKey = state ? Object.keys(state)[0] : 'unknown';
          return (
            <div key={c.name as string} className="rounded border p-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="font-medium">{c.name as string}</span>
                <Badge variant="secondary" className="text-[10px]">{stateKey}</Badge>
              </div>
              <div className="text-muted-foreground font-mono text-[10px] truncate">{c.image as string}</div>
              {cs && (
                <div className="flex gap-3 text-muted-foreground">
                  <span>Ready: {cs.ready ? 'Yes' : 'No'}</span>
                  <span>Restarts: {(cs.restartCount as number) ?? 0}</span>
                </div>
              )}
            </div>
          );
        })}
      </Section>
    </>
  );
}

function WorkloadOverview({ kind, status, spec }: { kind: string; status: Record<string, unknown>; spec: Record<string, unknown> }) {
  return (
    <Section title="Replicas">
      <Row label="Desired" value={((spec.replicas as number | undefined) ?? (kind === 'DaemonSet' ? (status.desiredNumberScheduled as number) : 1))} />
      <Row label="Ready" value={((status.readyReplicas as number | undefined) ?? (status.numberReady as number | undefined) ?? 0)} />
      <Row label="Updated" value={((status.updatedReplicas as number | undefined) ?? (status.updatedNumberScheduled as number | undefined) ?? 0)} />
      <Row label="Available" value={((status.availableReplicas as number | undefined) ?? (status.numberAvailable as number | undefined) ?? 0)} />
      {kind === 'Deployment' && !!spec.strategy && (
        <Row label="Strategy" value={((spec.strategy as Record<string, string>).type || '-')} />
      )}
    </Section>
  );
}

function ServiceOverview({ spec }: { spec: Record<string, unknown> }) {
  const ports = (spec.ports || []) as Array<Record<string, unknown>>;
  return (
    <>
      <Section title="Service">
        <Row label="Type" value={(spec.type as string) || 'ClusterIP'} />
        <Row label="Cluster IP" value={(spec.clusterIP as string) || '-'} mono />
        {!!spec.externalIPs && <Row label="External IPs" value={(spec.externalIPs as string[]).join(', ')} mono />}
        <Row label="Session Affinity" value={(spec.sessionAffinity as string) || 'None'} />
      </Section>
      {ports.length > 0 && (
        <Section title={`Ports (${ports.length})`}>
          {ports.map((p, i: number) => (
            <Row key={i} label={(p.name as string) || `port-${i}`} value={`${p.port}${p.targetPort ? `\u2192${p.targetPort}` : ''}/${p.protocol || 'TCP'}`} mono />
          ))}
        </Section>
      )}
    </>
  );
}

function IngressOverview({ spec, status }: { spec: Record<string, unknown>; status: Record<string, unknown> }) {
  const rules = (spec.rules || []) as Array<Record<string, unknown>>;
  const lb = status?.loadBalancer as Record<string, unknown> | undefined;
  const lbIngress = (lb?.ingress || []) as Array<Record<string, string>>;
  return (
    <>
      <Section title="Ingress">
        {!!spec.ingressClassName && <Row label="Class" value={spec.ingressClassName as string} />}
        {lbIngress.length > 0 && (
          <Row label="LB Address" value={lbIngress.map((lb) => lb.hostname || lb.ip).join(', ')} mono />
        )}
      </Section>
      {rules.length > 0 && (
        <Section title={`Rules (${rules.length})`}>
          {rules.map((rule, i: number) => (
            <div key={i} className="text-xs space-y-0.5">
              <span className="font-medium">{(rule.host as string) || '*'}</span>
              {((rule.http as Record<string, unknown>)?.paths as Array<Record<string, unknown>> || []).map((p, j: number) => {
                const backend = p.backend as Record<string, unknown> | undefined;
                const service = backend?.service as Record<string, unknown> | undefined;
                const port = service?.port as Record<string, unknown> | undefined;
                return (
                <div key={j} className="text-muted-foreground font-mono pl-2">
                  {(p.path as string) || '/'} &rarr; {service?.name as string}:{(port?.number || port?.name) as string}
                </div>
                );
              })}
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Open Logs button                                                    */
/* ------------------------------------------------------------------ */

function OpenLogsButton({
  clusterId,
  namespace,
  podName,
  clusterIdEnc,
  onDone,
}: {
  clusterId: string;
  namespace: string;
  podName: string;
  clusterIdEnc: string;
  onDone: () => void;
}) {
  const addTab = usePanelStore((s) => s.addTab);

  // Fetch pod to get first container name
  const { data } = useSWR(
    `/api/clusters/${clusterIdEnc}/resources/${namespace}/pods/${podName}`,
    { refreshInterval: 0 }
  );

  const container = data?.spec?.containers?.[0]?.name || '';

  const handleOpenLogs = () => {
    if (!container) return;
    addTab({
      id: `logs-${podName}-${container}`,
      type: 'logs',
      title: `${podName}`,
      clusterId,
      namespace,
      podName,
      container,
    });
    onDone();
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="flex-1"
      onClick={handleOpenLogs}
      disabled={!container}
    >
      <Terminal className="h-3.5 w-3.5 mr-1.5" />
      View Logs
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* Shared UI helpers                                                   */
/* ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</h4>
      <div className="rounded-md border p-2.5 space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right truncate ${mono ? 'font-mono' : ''} ${small ? 'text-[10px]' : ''}`} title={String(value)}>
        {value}
      </span>
    </div>
  );
}

function RowAge({ label, timestamp }: { label: string; timestamp?: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <AgeDisplay timestamp={timestamp} />
    </div>
  );
}
