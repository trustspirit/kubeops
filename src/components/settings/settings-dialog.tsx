'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePodWatcherStore } from '@/stores/pod-watcher-store';
import { useAlertStore } from '@/stores/alert-store';
import { useSettingsStore } from '@/stores/settings-store';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertRulesTab } from './alert-rules-tab';
import { AlertHistory } from './alert-history';
import { AuthProvidersTab } from './auth-providers-tab';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SettingsDialogContent({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const { notificationsEnabled, setNotificationsEnabled } = usePodWatcherStore();
  const alertUnread = useAlertStore((s) => s.history.filter((a) => !a.read).length);

  const autoLoginOnLaunch = useSettingsStore((s) => s.autoLoginOnLaunch);
  const setAutoLoginOnLaunch = useSettingsStore((s) => s.setAutoLoginOnLaunch);

  // Settings apply as soon as they are changed: a switch that also needed
  // "Save" left it unclear whether flipping it had done anything.
  const handleNotificationsChange = (next: boolean) => {
    if (next && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
    setNotificationsEnabled(next);
  };

  return (
    <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Settings</DialogTitle>
      </DialogHeader>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="auth">Authentication</TabsTrigger>
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
          <div className="divide-y rounded-md border">
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="space-y-1">
                <label htmlFor="setting-notifications" className="text-sm font-medium">Desktop notifications</label>
                <p className="text-xs text-muted-foreground">
                  Show a system notification when an alert rule fires or a watched pod restarts.
                </p>
              </div>
              <Switch
                id="setting-notifications"
                checked={notificationsEnabled}
                onCheckedChange={handleNotificationsChange}
              />
            </div>

            <div className="flex items-start justify-between gap-4 p-4">
              <div className="space-y-1">
                <label htmlFor="setting-auto-login" className="text-sm font-medium">Sign in automatically on launch</label>
                <p className="text-xs text-muted-foreground">
                  Opens your browser to sign in as soon as KubeOps starts. When off,
                  use the provider button in the header instead.
                </p>
              </div>
              <Switch
                id="setting-auto-login"
                checked={autoLoginOnLaunch}
                onCheckedChange={setAutoLoginOnLaunch}
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </TabsContent>

        <TabsContent value="auth" className="mt-4">
          <AuthProvidersTab />
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
