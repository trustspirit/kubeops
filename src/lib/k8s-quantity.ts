const K8S_QUANTITY = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+|[numkKMGTPE]|[KMGTPE]i)?$/;

const QUANTITY_MULTIPLIERS: Record<string, number> = {
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
};

export function isValidK8sQuantity(value: string): boolean {
  return value.length > 0 && K8S_QUANTITY.test(value);
}

export function parseK8sQuantity(quantity: string): number {
  const normalizedQuantity = quantity.trim();
  if (!isValidK8sQuantity(normalizedQuantity)) return NaN;

  const suffixMatch = /(?:[numkKMGTPE]|[KMGTPE]i)$/.exec(normalizedQuantity);
  const suffix = suffixMatch?.[0];
  const numberPart = suffix
    ? normalizedQuantity.slice(0, -suffix.length)
    : normalizedQuantity;
  return Number(numberPart) * (suffix ? QUANTITY_MULTIPLIERS[suffix] : 1);
}
