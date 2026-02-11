'use client';

import { useEffect, useState } from 'react';

function formatAge(timestamp: string): string {
  const now = Date.now();
  const created = new Date(timestamp).getTime();
  const diffMs = now - created;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d${hours % 24}h`;
  if (hours > 0) return `${hours}h${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m${seconds % 60}s`;
  return `${seconds}s`;
}

export function AgeDisplay({ timestamp }: { timestamp?: string }) {
  const [age, setAge] = useState('');

  useEffect(() => {
    if (!timestamp) return;
    setAge(formatAge(timestamp));
    const interval = setInterval(() => setAge(formatAge(timestamp)), 30000);
    return () => clearInterval(interval);
  }, [timestamp]);

  if (!timestamp) return <span className="text-muted-foreground">-</span>;
  return <span title={new Date(timestamp).toLocaleString()}>{age}</span>;
}
