/**
 * Template engine for extracting and rendering {{variable}} patterns in YAML templates.
 */

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Extract unique variable names from a YAML template string.
 * Matches {{varName}} patterns and returns unique names.
 */
export function extractVariables(yaml: string): string[] {
  const matches = yaml.matchAll(VARIABLE_PATTERN);
  const names = new Set<string>();
  for (const match of matches) {
    names.add(match[1]);
  }
  return Array.from(names);
}

/**
 * Replace {{varName}} placeholders with provided values.
 * Variables without a matching value are left as-is.
 */
export function renderTemplate(yaml: string, values: Record<string, string>): string {
  return yaml.replace(VARIABLE_PATTERN, (match, varName) => {
    return varName in values ? values[varName] : match;
  });
}

/**
 * Clean a Kubernetes resource object for use as a template.
 * Removes auto-generated metadata fields and the status block.
 */
export function cleanResourceForTemplate(resource: Record<string, unknown>): Record<string, unknown> {
  if (!resource || typeof resource !== 'object') return resource;

  const cleaned = JSON.parse(JSON.stringify(resource));

  // Remove auto-generated metadata fields
  if (cleaned.metadata) {
    delete cleaned.metadata.uid;
    delete cleaned.metadata.resourceVersion;
    delete cleaned.metadata.creationTimestamp;
    delete cleaned.metadata.generation;
    delete cleaned.metadata.managedFields;
    delete cleaned.metadata.selfLink;
  }

  // Remove status block
  delete cleaned.status;

  return cleaned;
}
