const { validationResult } = require('express-validator');

// Runs after any validation chain — if any rule failed, respond with 400
// and a clean list of field-level messages. Otherwise, pass through.
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: errors.array()[0].msg, // first error, matches existing frontend error-box pattern
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg }))
    });
  }

  next();
}

module.exports = { handleValidationErrors };
