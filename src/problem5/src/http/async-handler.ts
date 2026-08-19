import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 does not forward a rejected promise to `next`, so an unwrapped
 * async route hangs the request and never reaches the central error handler.
 *
 * Body types are `unknown` rather than Express's `any`: a route cannot touch
 * `req.body` without parsing it with zod first.
 */
type AsyncRequest = Request<Request['params'], unknown, unknown, Request['query']>;

export function asyncHandler(
  fn: (req: AsyncRequest, res: Response<unknown>, next: NextFunction) => Promise<unknown>,
): RequestHandler<Request['params'], unknown, unknown, Request['query']> {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}
