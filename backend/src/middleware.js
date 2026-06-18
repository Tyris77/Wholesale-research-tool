// Wraps an async route handler so a rejected promise is forwarded to Express's
// error handler instead of becoming an unhandled rejection / hung request.
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Validates req.body against a zod schema. On failure responds 400 with a
// structured error; on success replaces req.body with the parsed (stripped) data.
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}

// Catch-all error handler. Must be registered AFTER all routes.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
}
