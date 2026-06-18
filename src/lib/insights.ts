// Scales each value to a pixel height proportional to the largest value.
// Negative values clamp to 0; an all-zero or empty input yields zeros.
export function barHeights(values: number[], maxPx: number): number[] {
  const max = Math.max(0, ...values);
  if (max === 0) return values.map(() => 0);
  return values.map((v) => (v <= 0 ? 0 : Math.round((v / max) * maxPx)));
}
