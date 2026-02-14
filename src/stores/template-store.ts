import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { builtInTemplates } from '@/lib/built-in-templates';

export interface TemplateVariable {
  name: string;
  defaultValue?: string;
  description?: string;
}

export interface ResourceTemplate {
  id: string;
  name: string;
  description?: string;
  resourceType: string;
  yaml: string;
  variables: TemplateVariable[];
  builtIn: boolean;
  createdAt: number;
}

interface TemplateState {
  templates: ResourceTemplate[];
  addTemplate: (template: Omit<ResourceTemplate, 'id' | 'createdAt' | 'builtIn'>) => void;
  updateTemplate: (id: string, updates: Partial<Omit<ResourceTemplate, 'id' | 'builtIn' | 'createdAt'>>) => void;
  deleteTemplate: (id: string) => void;
  getTemplate: (id: string) => ResourceTemplate | undefined;
  getTemplatesByType: (resourceType: string) => ResourceTemplate[];
}

export const useTemplateStore = create<TemplateState>()(
  persist(
    (set, get) => ({
      templates: builtInTemplates,
      addTemplate: (template) => {
        set((state) => ({
          templates: [
            ...state.templates,
            {
              ...template,
              id: crypto.randomUUID(),
              builtIn: false,
              createdAt: Date.now(),
            },
          ],
        }));
      },
      updateTemplate: (id, updates) => {
        const template = get().templates.find((t) => t.id === id);
        if (!template) return;
        // Built-in templates can be updated (name, description, etc.) but not deleted
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        }));
      },
      deleteTemplate: (id) => {
        const template = get().templates.find((t) => t.id === id);
        if (!template || template.builtIn) return;
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id),
        }));
      },
      getTemplate: (id) => {
        return get().templates.find((t) => t.id === id);
      },
      getTemplatesByType: (resourceType) => {
        return get().templates.filter((t) => t.resourceType === resourceType);
      },
    }),
    {
      name: 'kubeops-templates',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const persistedState = persisted as TemplateState | undefined;
        if (!persistedState) return current;
        // Ensure built-in templates are always present
        const existingBuiltInIds = new Set(
          (persistedState.templates || []).filter((t) => t.builtIn).map((t) => t.id)
        );
        const missingBuiltIns = builtInTemplates.filter(
          (t) => !existingBuiltInIds.has(t.id)
        );
        return {
          ...current,
          ...persistedState,
          templates: [...(persistedState.templates || []), ...missingBuiltIns],
        };
      },
    }
  )
);
