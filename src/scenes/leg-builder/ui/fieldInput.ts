export const clampInteger = (value: string, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Number.parseInt(value, 10) || minimum));

export const clampStepInteger = (
  value: string,
  minimum: number,
  maximum: number,
  step: number
) => {
  const clamped = clampInteger(value, minimum, maximum);
  const snapped = minimum + Math.round((clamped - minimum) / step) * step;

  return Math.min(maximum, Math.max(minimum, snapped));
};
