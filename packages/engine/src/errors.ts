/**
 * Invalid input throws; modelling limits return warnings (see warnings.ts).
 * The distinction matters: a negative thickness is a bug in the caller, whereas an
 * out-of-scope build-up is a legitimate thing for a user to have drawn.
 */
export class InvalidInputError extends Error {
  public readonly field: string;

  public constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = 'InvalidInputError';
    this.field = field;
  }
}

export function assertFiniteNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidInputError(field, `expected a finite number, received ${String(value)}`);
  }
}

export function assertPositive(value: number, field: string): void {
  assertFiniteNumber(value, field);
  if (value <= 0) {
    throw new InvalidInputError(field, `must be greater than zero, received ${value}`);
  }
}

export function assertNonNegative(value: number, field: string): void {
  assertFiniteNumber(value, field);
  if (value < 0) {
    throw new InvalidInputError(field, `must not be negative, received ${value}`);
  }
}

/** Area fractions are 0..1 inclusive. Percentages are a UI concept. */
export function assertFraction(value: number, field: string): void {
  assertFiniteNumber(value, field);
  if (value < 0 || value > 1) {
    throw new InvalidInputError(field, `must be a fraction in 0..1, received ${value}`);
  }
}
