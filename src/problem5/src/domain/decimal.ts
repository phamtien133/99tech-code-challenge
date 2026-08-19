import { z } from 'zod';

/**
 * Lexical contract of DECIMAL(36,18): at most 18 integer digits, at most 18
 * fractional digits, no exponent, no sign, no leading zeros.
 *
 * WHY shape validation rather than a numeric check: the value is never used in
 * arithmetic here, only stored and echoed. A numeric parse would accept things
 * the storage contract rejects - `BigNumber('1e400').isFinite()` is true, and
 * `Number('0.1')` is already lossy. What `1e400` violates is the column, not
 * mathematics, so the column's shape is what we validate against.
 */
export const DECIMAL_36_18 = /^(0|[1-9]\d{0,17})(\.\d{1,18})?$/;

/**
 * Branded so a raw string cannot reach a service or repository without having
 * passed the regex: the invariant becomes the compiler's job, not the reader's.
 */
export const decimalString = z.string().regex(DECIMAL_36_18, 'invalid decimal').brand<'Decimal'>();

export type Decimal = z.infer<typeof decimalString>;
