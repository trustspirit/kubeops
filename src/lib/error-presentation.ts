export interface ErrorPresentation {
  title: string;
  summary: string;
  details: string;
  canLogin: boolean;
}

export function getErrorPresentation(message = '', status?: number): ErrorPresentation {
  const normalized = message.toLowerCase();
  const isAuth = status === 401 || [
    'unauthorized',
    'credentials',
    'certificate',
    'authentication',
    'session expired',
  ].some((token) => normalized.includes(token));

  if (isAuth) {
    return {
      title: 'Authentication required',
      summary: 'Your cluster session is missing or expired. Log in again, then retry.',
      details: message,
      canLogin: true,
    };
  }

  const isConnection = [
    'econnrefused',
    'enotfound',
    'network',
    'fetch failed',
    'socket',
    'timeout',
    'timed out',
  ].some((token) => normalized.includes(token));

  if (isConnection) {
    return {
      title: 'Connection failed',
      summary: 'The cluster API could not be reached. Check the network or VPN and retry.',
      details: message,
      canLogin: false,
    };
  }

  if (status === 403 || normalized.includes('forbidden')) {
    return {
      title: 'Access denied',
      summary: 'Your account does not have permission to perform this request.',
      details: message,
      canLogin: false,
    };
  }

  if (status === 404 || normalized.includes('not found')) {
    return {
      title: 'Resource not found',
      summary: 'The resource may have been deleted or recreated since the last refresh.',
      details: message,
      canLogin: false,
    };
  }

  return {
    title: 'Request failed',
    summary: 'KubeOps could not complete this request. Retry or inspect the technical details.',
    details: message,
    canLogin: false,
  };
}
