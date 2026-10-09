export interface Bucket { name: string; n: number; other?: boolean }

/** The `limit` largest rows, with everything else summed into one "Other (k)" row at the end. */
export function bucketTop(rows: Array<[string, number]>, limit = 8): Bucket[] {
  const sorted = rows.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const top: Bucket[] = sorted.slice(0, limit).map(([name, n]) => ({ name, n }));
  const rest = sorted.slice(limit);
  if (rest.length) top.push({ name: `Other (${rest.length})`, n: rest.reduce((t, [, n]) => t + n, 0), other: true });
  return top;
}
