'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface ContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextName?: string;
  existingContext?: {
    name: string;
    cluster: string;
    user: string;
    namespace?: string;
  };
  onSaved?: () => void;
}

export function ContextDialog({
  open,
  onOpenChange,
  contextName,
  existingContext,
  onSaved,
}: ContextDialogProps) {
  const isEdit = !!contextName;

  const [name, setName] = useState('');
  const [server, setServer] = useState('');
  const [cluster, setCluster] = useState('');
  const [user, setUser] = useState('');
  const [namespace, setNamespace] = useState('');
  const [authMethod, setAuthMethod] = useState<'token' | 'cert' | 'exec'>('token');
  const [token, setToken] = useState('');
  const [clientCert, setClientCert] = useState('');
  const [clientKey, setClientKey] = useState('');
  const [ca, setCa] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && existingContext) {
      setName(existingContext.name);
      setCluster(existingContext.cluster);
      setUser(existingContext.user);
      setNamespace(existingContext.namespace || '');
    } else if (open && !existingContext) {
      setName('');
      setServer('');
      setCluster('');
      setUser('');
      setNamespace('');
      setAuthMethod('token');
      setToken('');
      setClientCert('');
      setClientKey('');
      setCa('');
    }
  }, [open, existingContext]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Context name is required');
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        const response = await fetch(
          `/api/kubeconfig/contexts/${encodeURIComponent(contextName)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cluster: cluster || undefined,
              user: user || undefined,
              namespace: namespace || undefined,
            }),
          }
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update context');
        }
        toast.success('Context updated');
      } else {
        if (!cluster.trim() || !user.trim()) {
          toast.error('Cluster and user are required');
          setSaving(false);
          return;
        }
        const response = await fetch('/api/kubeconfig/contexts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            cluster: cluster.trim(),
            user: user.trim(),
            namespace: namespace.trim() || undefined,
            server: server.trim() || undefined,
            certificateAuthorityData: ca.trim() || undefined,
            token: authMethod === 'token' ? token.trim() || undefined : undefined,
            clientCertificateData: authMethod === 'cert' ? clientCert.trim() || undefined : undefined,
            clientKeyData: authMethod === 'cert' ? clientKey.trim() || undefined : undefined,
          }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to add context');
        }
        toast.success('Context added');
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Context' : 'Add Context'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the context configuration.' : 'Add a new kubeconfig context.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Context Name</label>
            <Input
              placeholder="my-cluster-context"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEdit}
            />
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Server URL</label>
              <Input
                placeholder="https://kubernetes.example.com:6443"
                value={server}
                onChange={(e) => setServer(e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Cluster Name</label>
              <Input
                placeholder="my-cluster"
                value={cluster}
                onChange={(e) => setCluster(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">User Name</label>
              <Input
                placeholder="admin"
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Namespace</label>
            <Input
              placeholder="default"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
            />
          </div>

          {!isEdit && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Certificate Authority (base64)</label>
                <Input
                  placeholder="CA certificate data"
                  value={ca}
                  onChange={(e) => setCa(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Auth Method</label>
                <Select value={authMethod} onValueChange={(v) => setAuthMethod(v as 'token' | 'cert' | 'exec')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="token">Token</SelectItem>
                    <SelectItem value="cert">Client Certificate</SelectItem>
                    <SelectItem value="exec">Exec (external auth)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {authMethod === 'token' && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Token</label>
                  <Input
                    placeholder="Bearer token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    type="password"
                  />
                </div>
              )}

              {authMethod === 'cert' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Client Certificate (base64)</label>
                    <Input
                      placeholder="Client certificate data"
                      value={clientCert}
                      onChange={(e) => setClientCert(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Client Key (base64)</label>
                    <Input
                      placeholder="Client key data"
                      value={clientKey}
                      onChange={(e) => setClientKey(e.target.value)}
                      type="password"
                    />
                  </div>
                </>
              )}

              {authMethod === 'exec' && (
                <p className="text-xs text-muted-foreground">
                  Exec-based auth should be configured by editing the kubeconfig YAML directly
                  or merging from an external kubeconfig file.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
