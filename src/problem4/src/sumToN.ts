/**
 * Problem 4 - three unique implementations of `sum_to_n`.
 *
 * Contract (the brief says `n` is "any integer" but leaves negatives
 * undefined, so the symmetric reading is declared here and in the README):
 *
 *   n > 0  ->  1 + 2 + ... + n
 *   n = 0  ->  0
 *   n < 0  ->  (-1) + (-2) + ... + n      e.g. sum_to_n(-5) === -15
 *   input that is not a safe integer  ->  TypeError
 *
 * All three implementations return identical results - including the sign of
 * zero - on every input where all three are defined, and reject invalid input
 * through the same guard with the same error type.
 */

/**
 * Shared input guard for all three implementations.
 *
 * Why one guard: the brief guarantees the result fits in a float64, and the
 * cheapest way to keep that guarantee auditable is a single place where "is
 * this a usable integer at all" is decided. `Number.isSafeInteger` rejects
 * NaN, +/-Infinity, non-integers and integers beyond 2^53-1 in one call, so
 * the three functions cannot drift apart on validation.
 */
function assertValidN(n: number): void {
  if (!Number.isSafeInteger(n)) {
    throw new TypeError('n must be a safe integer');
  }
}

/**
 * Iterative accumulation, with an explicit branch per sign.
 *
 * Complexity: O(|n|) time - one addition per term - and O(1) space.
 * Efficiency: linear in |n|, so unlike `sum_to_n_b` its cost is visible to the
 * caller, but also the one that needs no proof: it literally performs the
 * summation the brief describes. Chosen for readability over cleverness, as
 * the reference the other two are checked against.
 */
export function sum_to_n_a(n: number): number {
  assertValidN(n);

  let total = 0;

  if (n < 0) {
    for (let term = -1; term >= n; term -= 1) {
      total += term;
    }
    return total;
  }

  for (let term = 1; term <= n; term += 1) {
    total += term;
  }
  return total;
}

/**
 * Closed-form Gauss summation. The production choice.
 *
 * Complexity: O(1) time - a fixed number of arithmetic operations regardless
 * of n - and O(1) space. Efficiency: constant work, no loop and no stack
 * growth, so it is the only one of the three that is safe across the whole
 * legal domain (|n| <= 134_217_727).
 *
 * Precision: within this problem's domain (|result| < 2^53) the intermediate
 * product s*(s+1) stays below 2^54 and is a product of two consecutive
 * integers, hence even, and every even integer below 2^54 is exactly
 * representable in float64 - so nothing is rounded. Full proof: README,
 * section "Precision".
 */
export function sum_to_n_b(n: number): number {
  assertValidN(n);

  // NOT Math.sign: Math.sign(-0) === -0, which would make this return -0 while
  // the iterative and recursive versions return +0. Object.is(-0, 0) is false,
  // so that divergence is observable and would break the equivalence invariant.
  const sign = n < 0 ? -1 : 1;
  const magnitude = Math.abs(n);

  return sign * ((magnitude * (magnitude + 1)) / 2);
}

/**
 * Natural recursion, stepping one term at a time towards zero.
 *
 * Complexity: O(|n|) time and O(|n|) space - the space is call-stack depth,
 * not heap, which is what makes this the least efficient of the three.
 * Efficiency: intentionally illustrative. It expresses the recurrence
 * sum(n) = n + sum(n -/+ 1) directly, but V8 performs no tail-call
 * optimisation, so the stack grows with |n| and large inputs overflow it.
 * Use `sum_to_n_b` in production; see README, section "Known limits".
 */
export function sum_to_n_c(n: number): number {
  assertValidN(n);
  return sumTowardsZero(n);
}

/**
 * The recurrence itself, split out so the guard runs once at the boundary
 * rather than once per frame.
 */
function sumTowardsZero(n: number): number {
  // Also the -0 case: -0 === 0 is true, so this returns +0 like the others.
  if (n === 0) {
    return 0;
  }
  return n < 0 ? n + sumTowardsZero(n + 1) : n + sumTowardsZero(n - 1);
}
