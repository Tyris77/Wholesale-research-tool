// Test isolation: blank the email env vars BEFORE dotenv loads the developer's
// real .env (dotenv does not override variables already present in process.env).
// This guarantees the test suite never sends real email via Resend, even when a
// real RESEND_API_KEY is configured for the running app.
process.env.RESEND_API_KEY = '';
process.env.EMAIL_FROM = '';
