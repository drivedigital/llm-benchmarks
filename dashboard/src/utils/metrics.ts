/** Missing measurements are not zero-valued observations. */
export function measuredValues(values: (number | undefined)[]): number[] {
  return values.filter(
    (value): value is number => value !== undefined && Number.isFinite(value),
  );
}

export function average(values: (number | undefined)[]): number | undefined {
  const measured = measuredValues(values);
  return measured.length
    ? measured.reduce((sum, value) => sum + value, 0) / measured.length
    : undefined;
}
