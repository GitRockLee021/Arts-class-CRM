/** Wrap an async Express route handler so rejected promises go to the error middleware. */
export function ah(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}