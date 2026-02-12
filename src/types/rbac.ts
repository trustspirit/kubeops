export interface RBACEntry {
  subject: { kind: string; name: string; namespace?: string };
  role: { kind: string; name: string };
  namespace: string;
  rules: Array<{ apiGroups: string[]; resources: string[]; verbs: string[] }>;
  bindingName: string;
  bindingKind: string;
}

export interface RBACSummaryResponse {
  entries: RBACEntry[];
}

export interface AccessReviewResult {
  allowed: boolean;
  reason?: string;
  evaluationError?: string;
}

export const COMMON_VERBS = [
  'get', 'list', 'watch', 'create', 'update', 'patch', 'delete', 'deletecollection', '*',
] as const;

export const SUBJECT_KINDS = ['User', 'Group', 'ServiceAccount'] as const;

export const SUBJECT_KIND_COLORS: Record<string, string> = {
  User: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  Group: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
  ServiceAccount: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
};

export const VERB_COLORS: Record<string, string> = {
  get: 'bg-green-500/10 text-green-700 dark:text-green-400',
  list: 'bg-green-500/10 text-green-700 dark:text-green-400',
  watch: 'bg-green-500/10 text-green-700 dark:text-green-400',
  create: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  update: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  patch: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  delete: 'bg-red-500/10 text-red-700 dark:text-red-400',
  deletecollection: 'bg-red-500/10 text-red-700 dark:text-red-400',
  '*': 'bg-red-500/10 text-red-700 dark:text-red-400',
};
