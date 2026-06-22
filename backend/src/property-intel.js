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

const BASE = 'https://maps2.dcgis.dc.gov/dcgis/rest/services';
const OPEN_DATA = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA';

// ArcGIS layer IDs — verified against DC Open Data portal June 2026
const LAYERS = {
  // Real Property Assessment (CAMA residential)
  realProperty: `${OPEN_DATA}/Property_and_Zoning_WebMercator/MapServer/56/query`,
  // DCRA Vacant and Blighted Buildings
  vacantBlighted: `${OPEN_DATA}/Property_and_Zoning_WebMercator/MapServer/54/query`,
  // DCRA Open Code Violations
  codeViolations: `${OPEN_DATA}/Inspection_and_Enforcement_WebMercator/MapServer/6/query`,
};

export async function fetchWithRetry(url, options = {}, retries = 2) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 1000));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllPages(layerUrl, where, outFields) {
  const records = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const params = new URLSearchParams({
      where,
      outFields,
      f: 'json',
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
    });
    const data = await fetchWithRetry(`${layerUrl}?${params}`);
    const features = data.features ?? [];
    records.push(...features.map((f) => f.attributes));
    if (features.length < pageSize) break;
    offset += pageSize;
  }
  return records;
}

export async function fetchPropertyOwnership() {
  const rows = await fetchAllPages(
    LAYERS.realProperty,
    "PROPTYPE='R'",
    'SSL,PREMISEADD,WARD,OWNERNAME,OWNERADDRESS,OWNERCITY,OWNERSTATE,OWNERZIPCODE,ASSESSED_VAL,TAX_DELINQUENT',
  );
  return rows.map((r) => ({
    parcelId: String(r.SSL ?? '').trim(),
    address: String(r.PREMISEADD ?? '').trim(),
    ward: String(r.WARD ?? '').trim(),
    ownerName: String(r.OWNERNAME ?? '').trim(),
    ownerAddress: [r.OWNERADDRESS, r.OWNERCITY, r.OWNERSTATE, r.OWNERZIPCODE]
      .filter(Boolean).join(', ').trim(),
    ownerState: String(r.OWNERSTATE ?? '').trim(),
    assessedValue: Number(r.ASSESSED_VAL) || 0,
    taxDelinquent: Boolean(r.TAX_DELINQUENT),
  })).filter((r) => r.parcelId && r.address);
}

export async function fetchVacantBlighted() {
  const rows = await fetchAllPages(
    LAYERS.vacantBlighted,
    '1=1',
    'SSL',
  );
  return new Set(rows.map((r) => String(r.SSL ?? '').trim()).filter(Boolean));
}

export async function fetchCodeViolations() {
  const rows = await fetchAllPages(
    LAYERS.codeViolations,
    "STATUS='OPEN'",
    'SSL',
  );
  return new Set(rows.map((r) => String(r.SSL ?? '').trim()).filter(Boolean));
}

export function buildSignals(property, vacantSet, violationsSet) {
  const signals = [];
  if (property.taxDelinquent) signals.push('tax_delinquent');
  if (isAbsentee(property.ownerAddress, property.address)) {
    signals.push('absentee_owner');
    if (isOutOfState(property.ownerState)) signals.push('out_of_state');
  }
  if (vacantSet.has(property.parcelId)) signals.push('vacant');
  if (violationsSet.has(property.parcelId)) signals.push('code_violation');
  return signals;
}

export function deduplicateByParcelId(records) {
  const map = new Map();
  for (const r of records) map.set(r.parcelId, r);
  return map;
}
