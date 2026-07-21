export function toggleNamespaceSelection(
  selected: string[],
  namespace: string,
): string[] {
  return selected.includes(namespace)
    ? selected.filter((item) => item !== namespace)
    : [...selected, namespace];
}
