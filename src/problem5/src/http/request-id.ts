import { randomUUID } from 'node:crypto';

import type { RequestHandler, Response } from 'express';

/**
 * Correlation id. One value per request, echoed to the caller in the
 * `X-Request-Id` response header and repeated in the body of every error, so a
 * client can quote one string when reporting a problem. The same contract is
 * specified for Problem 6, and the two deliverables share it deliberately.
 */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Only the part of `res.locals` this module owns. */
interface RequestIdLocals {
  requestId?: string;
}

/**
 * A client-supplied id is either accepted VERBATIM or replaced outright - it is
 * never trimmed or rewritten, because a half-corrected id is worse than an
 * honest new one: the caller would be quoting a value the service never saw.
 *
 * Accepted shape is visible ASCII, bounded at 128 characters. Two concrete
 * reasons, not caution for its own sake. A value carrying a control character
 * makes `res.setHeader` throw `ERR_INVALID_CHAR` - synchronously, in
 * middleware, which is a 500 handed to the caller for their own malformed
 * header. And an unbounded value is echoed into every error body, so the length
 * cap is what stops a caller deciding how large this service's responses are.
 */
const ACCEPTABLE_REQUEST_ID = /^[\x20-\x7E]{1,128}$/;

/**
 * Total by construction: it returns a well-formed id even for a response that
 * never passed through the middleware - a route mounted too early, or a future
 * refactor - because `requestId: undefined` in a JSON envelope is a worse
 * failure than a fresh id. The generated value is stored, so repeated calls on
 * one response agree with each other and with the header.
 */
export function requestIdOf(res: Response): string {
  const locals: RequestIdLocals = res.locals;

  if (locals.requestId !== undefined) {
    return locals.requestId;
  }

  const generated = randomUUID();
  locals.requestId = generated;
  return generated;
}

/**
 * Mounted BEFORE `express.json()`. That ordering is load-bearing: the body
 * parser is what rejects malformed JSON, an oversized body and an unsupported
 * `Content-Encoding`, and a middleware mounted after it never runs for those
 * three - they would be the responses least able to carry a correlation id and
 * the ones a caller is most likely to quote.
 */
export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const supplied = req.header(REQUEST_ID_HEADER);
  const id =
    supplied !== undefined && ACCEPTABLE_REQUEST_ID.test(supplied) ? supplied : randomUUID();

  const locals: RequestIdLocals = res.locals;
  locals.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);

  next();
};
