// Risk: the three implementations silently diverge from the declared contract
// or from each other - on negatives, on the sign of zero, on invalid input, or
// at the top of the safe-integer domain where the closed form could round.
import { sum_to_n_a, sum_to_n_b, sum_to_n_c } from '../src/sumToN';

type SumToN = (n: number) => number;

const IMPLEMENTATIONS: Array<[string, SumToN]> = [
  ['sum_to_n_a', sum_to_n_a],
  ['sum_to_n_b', sum_to_n_b],
  ['sum_to_n_c', sum_to_n_c],
];

// Non-integers, non-finite values and integers past 2^53-1 all fail the one
// shared `Number.isSafeInteger` guard.
const INVALID_INPUTS: Array<[string, number]> = [
  ['a non-integer', 1.5],
  ['NaN', NaN],
  ['Infinity', Infinity],
  ['2**53 (past the safe-integer range)', 2 ** 53],
];

// Largest n whose result still satisfies |result| < Number.MAX_SAFE_INTEGER.
const DOMAIN_MAX = 134_217_727;
const DOMAIN_MAX_RESULT = 9_007_199_187_632_128;

describe.each(IMPLEMENTATIONS)('%s', (_name, sumToN) => {
  it('sums 1..5 to 15, the example given in the brief', () => {
    expect(sumToN(5)).toBe(15);
  });

  it('returns 1 for n = 1', () => {
    expect(sumToN(1)).toBe(1);
  });

  it('returns 0 for n = 0', () => {
    expect(sumToN(0)).toBe(0);
  });

  it('mirrors the positive case for n = -5, returning -15', () => {
    expect(sumToN(-5)).toBe(-15);
  });

  it('normalises -0 to +0', () => {
    // -0 === 0 is true, so an === check would hide a -0 leaking out of the
    // closed form; Object.is does not.
    expect(Object.is(sumToN(-0), 0)).toBe(true);
  });

  it.each(INVALID_INPUTS)('throws TypeError for %s', (_label, invalid) => {
    expect(() => sumToN(invalid)).toThrow(TypeError);
  });
});

describe('shared guard', () => {
  it.each(INVALID_INPUTS)(
    'rejects %s with the same error type in all three implementations',
    (_label, invalid) => {
      const errorTypes = IMPLEMENTATIONS.map(([, sumToN]) => {
        try {
          sumToN(invalid);
          return 'no error thrown';
        } catch (error) {
          return error instanceof Error ? error.constructor.name : typeof error;
        }
      });

      expect(errorTypes).toEqual(['TypeError', 'TypeError', 'TypeError']);
    },
  );
});

describe('equivalence of the three implementations', () => {
  it('agrees on every integer in [-500, 500]', () => {
    for (let n = -500; n <= 500; n += 1) {
      expect(sum_to_n_a(n)).toBe(sum_to_n_b(n));
      expect(sum_to_n_a(n)).toBe(sum_to_n_c(n));
    }
  });
});

describe('top of the legal domain', () => {
  // sum_to_n_c is excluded on purpose: at this magnitude it would exhaust the
  // call stack, which is a documented property of the recursive version and
  // not a defect worth asserting on.
  it.each<[string, SumToN]>([
    ['sum_to_n_a', sum_to_n_a],
    ['sum_to_n_b', sum_to_n_b],
  ])('%s is exact at n = 134_217_727', (_name, sumToN) => {
    expect(sumToN(DOMAIN_MAX)).toBe(DOMAIN_MAX_RESULT);
  });

  it('sum_to_n_b mirrors that result for the negative boundary', () => {
    expect(sum_to_n_b(-DOMAIN_MAX)).toBe(-DOMAIN_MAX_RESULT);
  });
});
