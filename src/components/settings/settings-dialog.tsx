'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSettingsStore } from '@/stores/settings-store';
import { usePodWatcherStore } from '@/stores/pod-watcher-store';
import { useAlertStore } from '@/stores/alert-store';
import { Bell, BellOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AlertRulesTab } from './alert-rules-tab';
import { AlertHistory } from './alert-history';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SettingsDialogContent({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const { tshProxyUrl, tshAuthType, setTshProxyUrl, setTshAuthType } = useSettingsStore();
  const { notificationsEnabled, setNotificationsEnabled } = usePodWatcherStore();
  const unreadCount = useAlertStore((s) => s.unreadCount);

  const [proxyUrl, setProxyUrl] = useState(tshProxyUrl);
  const [authType, setAuthType] = useState(tshAuthType);
  const [notifEnabled, setNotifEnabled] = useState(notificationsEnabled);

  const handleSave = () => {
    setTshProxyUrl(proxyUrl);
    setTshAuthType(authType);
    setNotificationsEnabled(notifEnabled);
    onOpenChange(false);
  };

  const handleToggleNotifications = () => {
    const next = !notifEnabled;
    if (next && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    setNotifEnabled(next);
  };

  const alertUnread = unreadCount();

  return (
    <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Settings</DialogTitle>
      </DialogHeader>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="alert-rules" className="gap-1">
            Alert Rules
          </TabsTrigger>
          <TabsTrigger value="alert-history" className="gap-1">
            Alert History
            {alertUnread > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">
                {alertUnread}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <div className="space-y-4">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Teleport (tsh)</h4>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Proxy URL</label>
                <Input
                  placeholder="teleport.example.com:443"
                  value={proxyUrl}
                  onChange={(e) => setProxyUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Auth Type</label>
                <Input
                  placeholder="e.g. github, saml, oidc"
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Notifications</h4>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleToggleNotifications}
              >
                {notifEnabled ? (
                  <><Bell className="h-4 w-4" />Desktop Notifications Enabled</>
                ) : (
                  <><BellOff className="h-4 w-4" />Desktop Notifications Disabled</>
                )}
              </Button>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </TabsContent>

        <TabsContent value="alert-rules" className="mt-4">
          <AlertRulesTab />
        </TabsContent>

        <TabsContent value="alert-history" className="mt-4">
          <AlertHistory />
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <SettingsDialogContent onOpenChange={onOpenChange} />}
    </Dialog>
  );
}
