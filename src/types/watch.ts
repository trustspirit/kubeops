export type WatchEventType = 'ADDED' | 'MODIFIED' | 'DELETED' | 'ERROR' | 'BOOKMARK';

export interface WatchEventObject {
  kind?: string;
  apiVersion?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
    resourceVersion?: string;
    creationTimestamp?: string;
    deletionTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: Array<{ uid: string; kind: string; name: string; apiVersion: string }>;
    [key: string]: unknown;
  };
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
  message?: string;
  code?: number;
  reason?: string;
  [key: string]: unknown;
}

export interface WatchEvent {
  type: WatchEventType;
  object: WatchEventObject;
}

export interface WatchSubscription {
  action: 'subscribe' | 'unsubscribe';
  resourceType: string;
  namespace?: string;
}

export interface WatchMessage {
  type: 'event' | 'error' | 'subscribed' | 'unsubscribed';
  resourceType: string;
  namespace?: string;
  event?: WatchEvent;
  error?: string;
}
