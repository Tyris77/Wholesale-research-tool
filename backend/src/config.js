import 'dotenv/config';

// A key counts as configured only if it is non-empty and not a leftover
// "your_..._here" placeholder from .env.example.
export function isConfigured(value) {
  return Boolean(value) && !String(value).startsWith('your_');
}

export const config = {
  port: Number(process.env.PORT) || 5000,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  nodeEnv: process.env.NODE_ENV || 'development',
  emailFrom: process.env.EMAIL_FROM || '',
  notifyEmail: process.env.NOTIFY_EMAIL || '',
  // Sender identity used in automated seller outreach (email footer is CAN-SPAM:
  // physical address + opt-out). Placeholders until set in Railway → Variables.
  outreach: {
    name: process.env.OUTREACH_NAME || 'Tyris Walker',
    phone: process.env.OUTREACH_PHONE || '[YOUR PHONE]',
    mailingAddress: process.env.OUTREACH_ADDRESS || '[YOUR MAILING ADDRESS], Washington, DC',
  },
  keys: {
    groq: process.env.GROQ_API_KEY || '',
    fred: process.env.FRED_API_KEY || '',
    census: process.env.CENSUS_API_KEY || '',
    rentcast: process.env.RENTCAST_API_KEY || '',
    resend: process.env.RESEND_API_KEY || '',
    tracerfy: process.env.TRACERFY_API_KEY || '',
  },
};

export function integrationStatus(keys = config.keys) {
  return {
    groq: isConfigured(keys.groq),
    fred: isConfigured(keys.fred),
    census: isConfigured(keys.census),
    rentcast: isConfigured(keys.rentcast),
    resend: isConfigured(keys.resend),
    tracerfy: isConfigured(keys.tracerfy),
  };
}
