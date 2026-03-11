'use client';

import { useState, useEffect } from 'react';
import { useAuthProviders } from '@/hooks/use-auth-providers';
import { useSettingsStore } from '@/stores/settings-store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function AuthProvidersTab() {
  const { providers, isLoading } = useAuthProviders();
  const { authProviderConfigs, setAuthProviderConfig } = useSettingsStore();
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [editConfigs, setEditConfigs] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    setEditConfigs(authProviderConfigs);
  }, [authProviderConfigs]);

  const handleSave = (providerId: string) => {
    const config = editConfigs[providerId] || {};
    setAuthProviderConfig(providerId, config);
    toast.success(`${providerId} configuration saved`);
  };

  const updateField = (providerId: string, key: string, value: string) => {
    setEditConfigs((prev) => ({
      ...prev,
      [providerId]: { ...(prev[providerId] || {}), [key]: value },
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Detecting installed providers...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">
        Configure authentication providers for your Kubernetes clusters.
      </p>
      {providers.map((provider) => {
        const isExpanded = expandedProvider === provider.id;
        const config = editConfigs[provider.id] || {};

        return (
          <div key={provider.id} className="border rounded-md">
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
              onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span className="font-medium text-sm flex-1">{provider.name}</span>
              <Badge variant={provider.available ? 'default' : 'secondary'} className="text-[10px]">
                {provider.available ? (
                  <><Check className="h-3 w-3 mr-1" />Installed</>
                ) : (
                  <><X className="h-3 w-3 mr-1" />Not Found</>
                )}
              </Badge>
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 space-y-3 border-t pt-3">
                {!provider.available && (
                  <p className="text-xs text-muted-foreground">
                    CLI tool not found in PATH. Install it to use this provider.
                  </p>
                )}
                {provider.configFields.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      {field.label} {field.required && <span className="text-destructive">*</span>}
                    </label>
                    <Input
                      placeholder={field.placeholder}
                      value={config[field.key] || ''}
                      onChange={(e) => updateField(provider.id, field.key, e.target.value)}
                      disabled={!provider.available}
                    />
                  </div>
                ))}
                {provider.available && provider.configFields.length > 0 && (
                  <Button size="sm" onClick={() => handleSave(provider.id)}>
                    Save
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
