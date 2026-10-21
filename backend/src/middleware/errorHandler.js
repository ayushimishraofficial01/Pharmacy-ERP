// Merged from Phase 1 (safe messaging, no stack leaks) and Phase 3
// (Mongoose duplicate-key + validation error handling).
function notFound(req, res, next) {
  res.status(404);
  next(new Error(`Route not found: ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(`[Error] ${req.method} ${req.originalUrl} -> ${err.message}`);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  let statusCode = (res.statusCode && res.statusCode !== 200 ? res.statusCode : err.statusCode) || 500;
  let message = err.isOperational !== false ? err.message : 'Internal server error. Please try again later.';

  if (err.code === 11000) {
    statusCode = 409;
    const fields = Object.keys(err.keyPattern || {});
    if (fields.length > 1) {
      message = `Duplicate value for combination of ${fields.map((f) => `'${f}'`).join(', ')} — must be unique.`;
    } else {
      const field = fields[0] || 'field';
      message = `Duplicate value for '${field}' — must be unique.`;
    }
  }

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  }

  if (statusCode >= 500) {
    message = process.env.NODE_ENV === 'production' ? 'Internal server error. Please try again later.' : message;
  }

  res.status(statusCode).json({ success: false, message, errors: null });
}

module.exports = { notFound, errorHandler };
