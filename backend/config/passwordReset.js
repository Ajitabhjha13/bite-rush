// Password reset rules in one place.
module.exports = {
  TOKEN_MINUTES: 30,   // how long a reset link works
  RESEND_SECONDS: 60   // asking again within this time does not send another email
};
