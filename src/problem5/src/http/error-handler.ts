import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { BaseError, UniqueConstraintError } from 'sequelize';
import { ZodError } from 'zod';

import { AppError } from './errors';
import type { ErrorCode, ErrorResponseBody } from './errors';
import { STATUS_BY_ERROR_CODE } from './errors';
import { requestIdOf } from './request-id';

/**
 * The database is the source of truth for cross-field rules that a partial
 * PATCH cannot express, so its named constraints are mapped back to the HTTP
 * vocabulary here - without this table such a violation surfaces as a 500.
 * Why the database rather than zod: see "Errors" in README.md.
 */
const ERROR_CODE_BY_CONSTRAINT: Readonly<Record<string, ErrorCode>> = {
  ck_campaign_window: 'validation_error',
  ck_amounts: 'validation_error',
  ck_campaign_type: 'validation_error',
  ck_campaign_status: 'validation_error',
  uq_campaign_brand_name: 'conflict',
};

/** pg surfaces the violated constraint on the driver error, not on the Sequelize wrapper. */
function constraintNameOf(error: BaseError): string | undefined {
  const parent: unknown = (error as { parent?: unknown }).parent;
  if (typeof parent !== 'object' || parent === null) {
    return undefined;
  }
  const constraint: unknown = (parent as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : undefined;
}

/**
 * `express.json()` rejects a bad request body with an `http-errors` object that
 * matches none of the branches below, so without this one every such request
 * gets a 500 for its own mistake. Malformed JSON is only the common case: the
 * same parser raises `entity.too.large` (413), `encoding.unsupported` and
 * `charset.unsupported` (415) and `request.aborted` (400).
 *
 * Recognised by the parser's own marker set - a `type` string, `expose: true`,
 * a 4xx `statusCode` - so a genuine server-side `SyntaxError` still becomes a
 * 500. The status is the parser's, because 413 and 415 are more accurate than a
 * flat 400; the error *code* stays `validation_error` so `errors.ts` remains the
 * whole vocabulary.
 *
 * `details` is the parser's `type`, never its `message`: the message quotes a
 * slice of the caller's own payload back at them and its wording is V8's, so it
 * would change with the Node version. The `type` is stable and self-describing.
 */
interface ClientBodyError {
  statusCode: number;
  type: string;
}

function asClientBodyError(error: unknown): ClientBodyError | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const candidate = error as Error & {
    type?: unknown;
    expose?: unknown;
    statusCode?: unknown;
  };

  if (typeof candidate.type !== 'string' || candidate.expose !== true) {
    return undefined;
  }
  if (
    typeof candidate.statusCode !== 'number' ||
    candidate.statusCode < 400 ||
    candidate.statusCode > 499
  ) {
    return undefined;
  }

  return { statusCode: candidate.statusCode, type: candidate.type };
}

function zodDetails(error: ZodError): unknown {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * The single exit for every error response, so the envelope is assembled in one
 * place. Six call sites reaching for `res.status().json()` themselves would be
 * six chances for one of them to forget the correlation id.
 *
 * `status` is a parameter rather than derived from `code`, because two of the
 * callers know a more precise status than the code implies: the body parser's
 * 413 and 415 are both reported as `validation_error`.
 */
function sendError(res: Response, status: number, code: ErrorCode, details?: unknown): void {
  const body: ErrorResponseBody = { error: code, requestId: requestIdOf(res) };
  if (details !== undefined) {
    body.details = details;
  }
  res.status(status).json(body);
}

/** Unmatched route. Kept identical in shape to every other error response. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  sendError(res, STATUS_BY_ERROR_CODE.not_found, 'not_found');
};

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof AppError) {
    sendError(res, err.status, err.code, err.details);
    return;
  }

  const bodyError = asClientBodyError(err);
  if (bodyError !== undefined) {
    sendError(res, bodyError.statusCode, 'validation_error', bodyError.type);
    return;
  }

  if (err instanceof ZodError) {
    sendError(res, STATUS_BY_ERROR_CODE.validation_error, 'validation_error', zodDetails(err));
    return;
  }

  if (err instanceof BaseError) {
    const constraint = constraintNameOf(err);
    const mapped = constraint === undefined ? undefined : ERROR_CODE_BY_CONSTRAINT[constraint];
    const code: ErrorCode | undefined =
      mapped ?? (err instanceof UniqueConstraintError ? 'conflict' : undefined);

    if (code !== undefined) {
      sendError(res, STATUS_BY_ERROR_CODE[code], code, { constraint });
      return;
    }
  }

  // Unexpected: the message is never sent to the client, but losing it entirely
  // would make the 500 undiagnosable. Structured logging is out of scope here.
  // eslint-disable-next-line no-console -- see "Known limits" in README.md
  console.error('unhandled error', err);
  sendError(res, STATUS_BY_ERROR_CODE.internal_error, 'internal_error');
};
