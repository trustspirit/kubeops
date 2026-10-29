'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AnsiToHtml from 'ansi-to-html';
import { buildWebSocketUrl } from '@/lib/websocket-session';
import { canRetryStream, getReconnectDelay } from '@/lib/stream-policy';
import { LogBuffer } from '@/lib/log-buffer';
import {
  buildLogStreamPath,
  INITIAL_TAIL_LINES,
  LogResumeFilter,
  RESUME_TAIL_LINES,
} from '@/lib/log-request';
import { listPodContainers } from '@/lib/pod-containers';
import type { KubeResource } from '@/types/resource';

export const MAX_LOG_SIZE = 512 * 1024; // 512KB retained in the viewer
const MAX_RETRIES = 5;
/** Repaint at most this often; 60fps repaints of a 512KB pre element are wasted work. */
const RENDER_INTERVAL_MS = 100;
/** A line without a trailing newline is shown once the stream has been quiet this long. */
const PARTIAL_LINE_IDLE_MS = 300;

export type LogConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'ended';

const ANSI_OPTIONS = { fg: '#cdd6f4', bg: '#1e1e2e', escapeXML: true, stream: true } as const;

function createLogBuffer(): LogBuffer {
  // Per-buffer converter: `stream: true` keeps ANSI state across calls, which
  // must not bleed from one container into the next.
  const converter = new AnsiToHtml(ANSI_OPTIONS);
  return new LogBuffer({ maxChars: MAX_LOG_SIZE, convert: (raw) => converter.toHtml(raw) });
}

interface UseLogStreamOptions {
  /** Decoded cluster id. */
  clusterId: string;
  namespace: string;
  podName: string;
  container: string;
  /** Inactive streams close their socket and resume (without losing lines) when re-activated. */
  active?: boolean;
}

/**
 * Follow-mode pod log stream shared by the logs page and the bottom-panel tab.
 *
 * Reconnects (network drop, tab re-activation, stream end) replay the recent
 * tail and drop what is already on screen, instead of asking for `tailLines=0`
 * and silently losing whatever was logged while disconnected. The server has
 * no `sinceTime` support, so if the replay does not reach back far enough a
 * visible gap marker is inserted.
 */
export function useLogStream({ clusterId, namespace, podName, container, active = true }: UseLogStreamOptions) {
  const [html, setHtml] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [hasOutput, setHasOutput] = useState(false);
  const [connectionState, setConnectionState] = useState<LogConnectionState>('connecting');
  const [reconnectNonce, setReconnectNonce] = useState(0);

  const bufferRef = useRef<LogBuffer>(createLogBuffer());
  const filterRef = useRef(new LogResumeFilter());
  const pendingRef = useRef('');
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef(0);
  const endedRetryRef = useRef(0);
  const freshStartRef = useRef(false);
  const targetRef = useRef<string | null>(null);

  /** Moves queued output into the buffer and repaints. */
  const render = useCallback((flushPartial = false) => {
    if (renderTimerRef.current) {
      clearTimeout(renderTimerRef.current);
      renderTimerRef.current = null;
    }
    const buffer = bufferRef.current;
    const chunk = pendingRef.current;
    pendingRef.current = '';
    if (chunk) buffer.append(chunk);
    if (flushPartial) buffer.flushPending();
    if (!chunk && !flushPartial) return;
    setHtml(buffer.html);
    setTruncated(buffer.truncated);
    if (buffer.length > 0) setHasOutput(true);
  }, []);

  const scheduleRender = useCallback(() => {
    if (renderTimerRef.current) return;
    renderTimerRef.current = setTimeout(() => {
      renderTimerRef.current = null;
      render();
    }, RENDER_INTERVAL_MS);
  }, [render]);

  /** Shows a held, unterminated final line (a prompt, a progress bar, a crash message). */
  const flushPartialLine = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    pendingRef.current += filterRef.current.flush();
    render(true);
  }, [render]);

  const scheduleIdleFlush = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      flushPartialLine();
    }, PARTIAL_LINE_IDLE_MS);
  }, [flushPartialLine]);

  /** Appends a client-side notice line (bypasses the resume filter). */
  const appendNotice = useCallback((text: string) => {
    pendingRef.current += filterRef.current.flush();
    pendingRef.current += `\n${text}\n`;
    render(true);
  }, [render]);

  useEffect(() => {
    if (!container || !active) return;

    const target = [clusterId, namespace, podName, container].join('\u0000');
    if (targetRef.current !== target) {
      targetRef.current = target;
      retryRef.current = 0;
      endedRetryRef.current = 0;
      freshStartRef.current = false;
      pendingRef.current = '';
      filterRef.current.reset();
      bufferRef.current = createLogBuffer();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHtml('');
      setTruncated(false);
      setHasOutput(false);
    }

    let disposed = false;
    let ended = false;
    let ws: WebSocket | null = null;
    setConnectionState(retryRef.current > 0 || endedRetryRef.current > 0 ? 'reconnecting' : 'connecting');

    const filter = filterRef.current;
    let tailLines = INITIAL_TAIL_LINES;
    if (freshStartRef.current) {
      // Following a recreated pod: its history is new, not a replay.
      freshStartRef.current = false;
      filter.reset();
    } else if (filter.hasHistory) {
      filter.beginResume();
      tailLines = RESUME_TAIL_LINES;
    }

    const scheduleReconnect = (attempt: number) => {
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        setReconnectNonce((value) => value + 1);
      }, getReconnectDelay(attempt));
    };

    void (async () => {
      try {
        const path = buildLogStreamPath({ clusterId, namespace, podName, container, tailLines });
        ws = new WebSocket(await buildWebSocketUrl(path));
        if (disposed) {
          ws.close();
          return;
        }
        const socket = ws;

        socket.onopen = () => {
          if (disposed) return;
          retryRef.current = 0;
          setConnectionState('connected');
        };
        socket.onmessage = (event) => {
          if (disposed || typeof event.data !== 'string') return;
          const data = event.data;
          if (data.startsWith('{')) {
            try {
              const msg = JSON.parse(data) as { type?: string; message?: string };
              if (msg.type === 'error') {
                pendingRef.current += `\n[ERROR] ${msg.message}\n`;
                scheduleRender();
                return;
              }
              if (msg.type === 'end') {
                ended = true;
                socket.close();
                return;
              }
            } catch { /* not a control message */ }
          }
          const accepted = filter.process(data);
          if (accepted) {
            endedRetryRef.current = 0;
            pendingRef.current += accepted;
            scheduleRender();
          }
          scheduleIdleFlush();
        };
        socket.onclose = (event) => {
          if (disposed) return;

          if (ended || isLogStreamEndClose(event)) {
            flushPartialLine();
            // One notice per real end, not one per reconnect that found nothing new.
            if (endedRetryRef.current === 0) appendNotice('--- stream ended ---');
            // The container may simply have restarted; follow it again, but
            // stop once repeated reconnects bring nothing new.
            if (endedRetryRef.current < MAX_RETRIES) {
              const attempt = endedRetryRef.current++;
              setConnectionState('ended');
              scheduleReconnect(attempt + 2);
            } else {
              setConnectionState('ended');
            }
            return;
          }

          if (event.wasClean) {
            flushPartialLine();
            setConnectionState('disconnected');
            return;
          }

          // The partial line is not flushed here: the resumed stream replays it whole.
          if (canRetryStream({ intentional: disposed, normalExit: false, attempt: retryRef.current, maxAttempts: MAX_RETRIES })) {
            const attempt = retryRef.current++;
            setConnectionState('reconnecting');
            scheduleReconnect(attempt);
          } else {
            flushPartialLine();
            setConnectionState('disconnected');
          }
        };
      } catch {
        if (!disposed) setConnectionState('disconnected');
      }
    })();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      ws?.close();
      // Keep what already arrived; dropping it here lost lines on every tab switch.
      render();
    };
  }, [clusterId, namespace, podName, container, active, reconnectNonce, render, scheduleRender, scheduleIdleFlush, flushPartialLine, appendNotice]);

  /** Manual reconnect: resumes after what is already shown. */
  const reconnect = useCallback(() => {
    retryRef.current = 0;
    endedRetryRef.current = 0;
    setConnectionState('connecting');
    setReconnectNonce((value) => value + 1);
  }, []);

  /** The pod was recreated under the same name: stream its history from the start. */
  const followNewPod = useCallback(() => {
    appendNotice('--- following recreated pod ---');
    freshStartRef.current = true;
    retryRef.current = 0;
    endedRetryRef.current = 0;
    setReconnectNonce((value) => value + 1);
  }, [appendNotice]);

  const getText = useCallback(() => bufferRef.current.text, []);

  return {
    html,
    truncated,
    hasOutput,
    connectionState,
    reconnect,
    followNewPod,
    getText,
  };
}

/** Close reason the server uses when the API server ended the log stream. */
export const LOG_STREAM_END_REASON = 'Log stream ended';

/**
 * The stream ended on the server side (container exited or restarted), as
 * opposed to an error or a network drop. Signalled either by a `{type:'end'}`
 * frame or by a normal close carrying {@link LOG_STREAM_END_REASON}.
 */
export function isLogStreamEndClose(event: Pick<CloseEvent, 'code' | 'reason'>): boolean {
  return event.code === 1000 && event.reason === LOG_STREAM_END_REASON;
}

export function describeLogConnection(state: LogConnectionState): string {
  switch (state) {
    case 'connected': return 'Streaming';
    case 'reconnecting': return 'Reconnecting…';
    case 'connecting': return 'Connecting…';
    case 'ended': return 'Stream ended';
    default: return 'Disconnected';
  }
}

export function logConnectionDotClass(state: LogConnectionState): string {
  if (state === 'connected') return 'bg-green-500';
  if (state === 'reconnecting' || state === 'connecting') return 'bg-yellow-500';
  if (state === 'ended') return 'bg-muted-foreground';
  return 'bg-red-500';
}

/**
 * Every container whose logs can be read: regular, then init, then ephemeral
 * (debug) containers — a crash-looping init container is often the one to read.
 */
export function listLogContainerNames(pod: KubeResource | undefined): string[] {
  const names = listPodContainers(pod).map((c) => c.name);
  const ephemeral = (pod?.spec as { ephemeralContainers?: { name?: unknown }[] } | undefined)?.ephemeralContainers;
  if (Array.isArray(ephemeral)) {
    for (const entry of ephemeral) {
      if (typeof entry?.name === 'string' && entry.name && !names.includes(entry.name)) names.push(entry.name);
    }
  }
  return names;
}
