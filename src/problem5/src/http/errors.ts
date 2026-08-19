// The complete error vocabulary of the service. One `as const` list feeds both
// the union type and the status table, so a new code cannot be added without a
// status for it.
export const ERROR_CODES = [
  'validation_error',
  'not_found',
  'conflict',
  'version_conflict',
  'internal_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const STATUS_BY_ERROR_CODE: Readonly<Record<ErrorCode, number>> = {
  validation_error: 400,
  not_found: 404,
  // Duplicate campaign name within a brand.
  conflict: 409,
  // Stale `version` on PATCH - optimistic concurrency.
  version_conflict: 409,
  internal_error: 500,
};

/**
 * Key order matches the error envelope specified for Problem 6, and `details`
 * stays optional there too: a key that is sometimes `null` tells a client
 * nothing, so it is omitted when there is nothing to say. `requestId` is the
 * opposite case - required, because a correlation id a client cannot rely on
 * being present is a correlation id they will not build tooling around.
 */
export interface ErrorResponseBody {
  error: ErrorCode;
  requestId: string;
  details?: unknown;
}

/**
 * The only error type routes and services are expected to throw. Everything
 * else reaching the handler is unexpected and becomes a 500.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_ERROR_CODE[code];
    this.details = details;
  }
}

export function notFound(details?: unknown): AppError {
  return new AppError('not_found', 'resource not found', details);
}

export function validationError(details?: unknown): AppError {
  return new AppError('validation_error', 'request validation failed', details);
}

export function versionConflict(details?: unknown): AppError {
  return new AppError('version_conflict', 'stale version', details);
}
