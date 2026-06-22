// Test isolation: blank the external-API env vars BEFORE dotenv loads the
// developer's real .env (dotenv does not override variables already present in
// process.env). This guarantees the test suite never calls a real external API
// (Resend email or Groq AI), even when real keys are configured for the running app.
process.env.RESEND_API_KEY = '';
process.env.EMAIL_FROM = '';
process.env.GROQ_API_KEY = '';
process.env.BATCHDATA_API_KEY = '';
