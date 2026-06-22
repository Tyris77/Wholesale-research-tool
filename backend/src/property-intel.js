import { v4 as uuid } from 'uuid';
import { dbRun, dbGet, dbAll } from './db.js';
import { sendEmail } from './email-service.js';
import { config } from './config.js';

const SIGNAL_POINTS = {
  tax_delinquent: 40,
  absentee_owner: 20,
  out_of_state: 15,
  vacant: 25,
  code_violation: 15,
};

const DC_MD_VA = new Set(['DC', 'MD', 'VA']);

export function scoreProperty(signals) {
  const total = signals.reduce((sum, s) => sum + (SIGNAL_POINTS[s] ?? 0), 0);
  return Math.min(total, 100);
}

export function classifyLead(score) {
  if (score >= 75) return 'hot';
  if (score >= 50) return 'warm';
  return 'cold';
}

export function isAbsentee(ownerAddress, propertyAddress) {
  if (!ownerAddress || !propertyAddress) return false;
  return ownerAddress.trim().toUpperCase() !== propertyAddress.trim().toUpperCase();
}

export function isOutOfState(ownerState) {
  if (!ownerState) return false;
  return !DC_MD_VA.has(ownerState.trim().toUpperCase());
}
