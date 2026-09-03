import { toast } from 'sonner';

export interface DownloadPodLogsInput {
  clusterId: string;
  namespace: string;
  podName: string;
  container: string;
  /** On-screen buffer, used only if the full download is unavailable. */
  fallbackText: string;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Downloads the complete pod log.
 *
 * The viewer trims older output to stay responsive, so saving the in-memory
 * buffer would quietly produce a partial file. Falls back to that buffer only
 * when the API call fails, and says so.
 */
export async function downloadPodLogs(input: DownloadPodLogsInput): Promise<void> {
  const { clusterId, namespace, podName, container, fallbackText } = input;
  const filename = `${podName}-${container}.log`;
  const url = `/api/clusters/${encodeURIComponent(clusterId)}/resources/${encodeURIComponent(namespace)}`
    + `/pods/${encodeURIComponent(podName)}/logs?container=${encodeURIComponent(container)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error || `HTTP ${response.status}`);
    }
    saveBlob(await response.blob(), filename);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    if (!fallbackText) {
      toast.error(`Log download failed: ${reason}`);
      return;
    }
    saveBlob(new Blob([fallbackText], { type: 'text/plain' }), filename);
    toast.warning('Saved the on-screen buffer only', {
      description: `The full log could not be fetched: ${reason}`,
    });
  }
}
