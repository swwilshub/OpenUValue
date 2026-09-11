/**
 * The small amount of complex arithmetic the dynamic method needs.
 *
 * Not part of the public API: this exists because BS EN ISO 13786 works with complex
 * transfer matrices and the engine has no runtime dependencies to borrow one from. It is
 * not exported from index.ts, so it can change freely.
 *
 * Rectangular form throughout. Nothing here needs to be fast; it needs to be obviously
 * correct, because a sign error in a complex product is invisible in the output.
 */

export interface Complex {
  readonly re: number;
  readonly im: number;
}

export function complex(re: number, im: number): Complex {
  return { re, im };
}

export const ONE: Complex = { re: 1, im: 0 };
export const ZERO: Complex = { re: 0, im: 0 };

export function add(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function subtract(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function multiply(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

export function scale(a: Complex, factor: number): Complex {
  return { re: a.re * factor, im: a.im * factor };
}

export function divide(a: Complex, b: Complex): Complex {
  const denominator = b.re * b.re + b.im * b.im;
  return {
    re: (a.re * b.re + a.im * b.im) / denominator,
    im: (a.im * b.re - a.re * b.im) / denominator,
  };
}

export function modulus(a: Complex): number {
  return Math.hypot(a.re, a.im);
}

/** Argument in radians, in (-pi, pi]. */
export function argument(a: Complex): number {
  return Math.atan2(a.im, a.re);
}

export function isFinite(a: Complex): boolean {
  return Number.isFinite(a.re) && Number.isFinite(a.im);
}

/** A 2x2 complex matrix, row-major: [[m11, m12], [m21, m22]]. */
export interface Matrix2 {
  readonly m11: Complex;
  readonly m12: Complex;
  readonly m21: Complex;
  readonly m22: Complex;
}

export const IDENTITY: Matrix2 = { m11: ONE, m12: ZERO, m21: ZERO, m22: ONE };

/**
 * Matrix product a*b. Order matters and is the thing most easily got wrong here: if b
 * maps face 0 to face 1 and a maps face 1 to face 2, then a*b maps face 0 to face 2.
 */
export function multiplyMatrix(a: Matrix2, b: Matrix2): Matrix2 {
  return {
    m11: add(multiply(a.m11, b.m11), multiply(a.m12, b.m21)),
    m12: add(multiply(a.m11, b.m12), multiply(a.m12, b.m22)),
    m21: add(multiply(a.m21, b.m11), multiply(a.m22, b.m21)),
    m22: add(multiply(a.m21, b.m12), multiply(a.m22, b.m22)),
  };
}
