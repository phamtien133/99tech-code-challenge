# Problem 4 - Three ways to sum to n

Three unique TypeScript implementations of `sum_to_n`, each carrying a complexity/efficiency comment in the source, plus a deterministic Jest suite that proves they agree with one another and with the declared contract.

- Implementations: [`src/sumToN.ts`](src/sumToN.ts)
- Tests: [`test/sumToN.test.ts`](test/sumToN.test.ts)

## Contract

The brief specifies `n` as "any integer" and gives the example `sum_to_n(5) === 1 + 2 + 3 + 4 + 5 === 15`, but it does not define what a negative `n` means. Rather than leave that undefined - or reject it, which would contradict "any integer" - the function is extended symmetrically: summation runs from `1` towards `n`, in whichever direction `n` lies.

| Input | Result | Example |
|---|---|---|
| `n > 0` | `1 + 2 + ... + n` | `sum_to_n(5) === 15` |
| `n === 0` | `0` | `sum_to_n(0) === 0` |
| `n < 0` | `(-1) + (-2) + ... + n` | `sum_to_n(-5) === -15` |
| `n === -0` | `+0`, never `-0` | `Object.is(sum_to_n(-0), 0) === true` |
| not a safe integer | throws `TypeError` | `sum_to_n(1.5)`, `sum_to_n(NaN)`, `sum_to_n(Infinity)`, `sum_to_n(2 ** 53)` |

Two invariants follow, and both are tested:

1. **Equivalence.** The three implementations return identical results - including the sign of zero - on every input where all three are defined.
2. **One guard.** A single `assertValidN` built on `Number.isSafeInteger` is called by all three, so every invalid input produces the same `TypeError` from every implementation.

### Assumption: the guarantee applies to the magnitude

For negative inputs, I interpret the brief's safe-integer guarantee as applying to the magnitude of the result: `Math.abs(result) < Number.MAX_SAFE_INTEGER`. This is the minimum additional assumption required for numerical correctness of the extended contract.

The reason: the brief guarantees the result is "lesser than `Number.MAX_SAFE_INTEGER`". Read as a literal signed comparison, every negative result satisfies it trivially, including results far below `-2^53` where float64 can no longer represent consecutive integers - so the literal reading guarantees nothing at all once negatives are in scope. Reading it as a bound on the magnitude preserves exactly the property the brief was buying: the result is an exactly representable integer.

That assumption fixes the legal domain at `|n| <= 134_217_727`, where `|result| = 9_007_199_187_632_128 < 2^53 - 1`. Inputs outside the domain but still safe integers (say `n = 200_000_000`) are accepted by the guard and return a rounded result: they are outside what the brief guarantees, so no behaviour is promised for them.

## Implementations

| Function | Approach | Time | Space | When to use it |
|---|---|---|---|---|
| `sum_to_n_a` | Iterative accumulation, explicit branch per sign | `O(\|n\|)` | `O(1)` | The readable reference. Obviously correct by inspection - it performs the summation the brief describes - and used as the baseline the other two are checked against. |
| `sum_to_n_b` | Closed-form Gauss, `sign * (s * (s + 1) / 2)` | `O(1)` | `O(1)` | **The production choice.** Constant work for any `n`, no loop and no stack growth, and exact across the whole legal domain (see Precision). |
| `sum_to_n_c` | Natural recursion on `sum(n) = n + sum(n -/+ 1)` | `O(\|n\|)` | `O(\|n\|)` stack | Illustrative only. Expresses the recurrence directly and reads well for small `n`; unsuitable for large `n` (see Known limits). |

All three call the same guard first, so the comparison above is about the summation strategy only.

## Precision

`sum_to_n_b` computes `s * (s + 1) / 2` where `s = Math.abs(n)`. The obvious worry is the intermediate product: it is roughly twice the size of the result, so it could plausibly land beyond `2^53` and be rounded before the halving recovers it. Within the domain the brief guarantees, it cannot be. The proof:

1. **The operands are exact and the intermediate stays below `2^54`.** The guard makes `s` a safe integer, so `s <= 2^53 - 1` and `s + 1 <= 2^53`: both operands are themselves exactly representable. The declared domain is `|result| < 2^53`, and `|result| = s(s + 1) / 2`, so `s(s + 1) < 2^54`.
2. **The intermediate is even.** `s` and `s + 1` are consecutive integers, so exactly one of them is even, and their product is therefore even.
3. **Every even integer below `2^54` is exact in float64.** Integers in `[0, 2^53]` are all representable. In the binade `[2^53, 2^54)` the exponent is one greater, so the spacing between representable values is exactly `2` - every even integer in that range is representable, and only the odd ones are not. By (1) and (2) the intermediate lies in `[0, 2^54)` and is even, so it is representable exactly - and since IEEE-754 multiplication is correctly rounded, that exact product is what the operation returns.
4. **The halving is exact.** Dividing by `2` only decrements the exponent, and `s(s + 1) / 2 <= 2^53 - 1` by (1), so the final value is an exactly representable integer. The sign multiply flips one bit.

Therefore `sum_to_n_b` returns the mathematically exact sum for every `n` in the legal domain - not an approximation that happens to be close. The boundary case is asserted directly in the suite: `sum_to_n_b(134_217_727) === 9_007_199_187_632_128`, where the intermediate product is `18_014_398_375_264_256`, comfortably above `2^53` and still exact.

## Known limits

`sum_to_n_c` is intentionally illustrative. Its O(|n|) call-stack usage makes it unsuitable for large inputs (V8 stack depth is engine- and frame-size- dependent and is not part of the JS spec; V8 has no tail-call optimization, so tail recursion does not help). Production code should use `sum_to_n_b`.

No depth guard is implemented, because no constant is correct across engines.

Other limits, stated so they are not mistaken for oversights:

- **Outside the guaranteed domain** (`|n| > 134_217_727`), `sum_to_n_b` returns a rounded value and `sum_to_n_a` returns an accumulated one; neither is guaranteed, per the assumption above.
- **`sum_to_n_a` is linear**, so it is slow near the top of the domain - about 1.3e8 iterations - even where it remains correct. `sum_to_n_c` overflows the stack long before that.
- **No BigInt anywhere.** The brief guarantees the result fits in a float64; adding arbitrary-precision arithmetic would contradict the specification rather than harden it.

## How to run

Developed and tested on Node.js 24 (see `.nvmrc`); supported from Node 20.

```bash
cd src/problem4

nvm use          # reads .nvmrc -> Node 24
npm ci           # install dev dependencies from the lockfile
npm test         # Jest, TZ=UTC, --runInBand
npm run typecheck   # tsc --noEmit, strict
```

`tsconfig.json` sets `strict: true` alongside `noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals`/`noUnusedParameters` and `useUnknownInCatchVariables`. It also sets `erasableSyntaxOnly`, so the sources stay free of enums, namespaces and parameter properties and can be executed directly by a runtime that only strips types, with no build step.

`npm test` runs the whole suite: the contract examples across all three implementations, the `-0` normalisation checked with `Object.is`, the shared `TypeError` guard, the exhaustive equivalence loop over `[-500, 500]`, and the domain boundary for `sum_to_n_a` and `sum_to_n_b`.
