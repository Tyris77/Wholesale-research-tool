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

export function buildDigestEmail(hotLeads) {
  if (!hotLeads || hotLeads.length === 0) return null;
  const top5 = hotLeads.slice(0, 5);
  const rows = top5.map((l) => {
    const sigs = Array.isArray(l.signals) ? l.signals : JSON.parse(l.signals ?? '[]');
    return `<tr>
      <td>${l.address}</td>
      <td>${l.ward ?? '—'}</td>
      <td><strong>${l.score}</strong></td>
      <td>${sigs.join(', ')}</td>
    </tr>`;
  }).join('');
  return {
    subject: `🏠 ${hotLeads.length} new hot lead${hotLeads.length === 1 ? '' : 's'} found in DC — ${new Date().toLocaleDateString('en-US')}`,
    html: `
      <h2>DC Property Intel — Daily Digest</h2>
      <p>${hotLeads.length} hot lead${hotLeads.length === 1 ? '' : 's'} found today (score ≥ 75).</p>
      <table border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>Address</th><th>Ward</th><th>Score</th><th>Signals</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>Log in to Lead Finder to review and promote leads to your Sellers list.</p>
    `,
  };
}

async function upsertLead(property, signals, score, now) {
  await dbRun(
    `INSERT INTO property_leads (parcel_id, address, ward, owner_name, owner_address, assessed_value, score, signals, status, last_scanned_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)
     ON CONFLICT(parcel_id) DO UPDATE SET
       score = excluded.score,
       signals = excluded.signals,
       owner_name = excluded.owner_name,
       owner_address = excluded.owner_address,
       assessed_value = excluded.assessed_value,
       last_scanned_at = excluded.last_scanned_at
     WHERE status != 'dismissed'`,
    [
      property.parcelId, property.address, property.ward,
      property.ownerName, property.ownerAddress, property.assessedValue,
      score, JSON.stringify(signals), now, now,
    ],
  );
  await dbRun('DELETE FROM lead_signals WHERE parcel_id = ? AND scanned_at = ?', [property.parcelId, now]);
  for (const signal of signals) {
    await dbRun(
      'INSERT INTO lead_signals (id, parcel_id, signal_type, signal_value, points_awarded, scanned_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), property.parcelId, signal, null, SIGNAL_POINTS[signal] ?? 0, now],
    );
  }
}

async function promoteHotLeads(hotParcelIds, now) {
  let promoted = 0;
  for (const parcelId of hotParcelIds) {
    const lead = await dbGet('SELECT * FROM property_leads WHERE parcel_id = ?', [parcelId]);
    if (!lead || lead.promoted_seller_id) continue;
    const arv = Math.round((lead.assessed_value ?? 0) * 1.2);
    const signals = JSON.parse(lead.signals ?? '[]');
    const sellerId = uuid();
    await dbRun(
      `INSERT INTO sellers (id, name, phone, email, property_address, property_city, property_state, motivation, status, created_at, last_contacted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
      [
        sellerId,
        lead.owner_name || 'Unknown Owner',
        null, null,
        lead.address, 'Washington', 'DC',
        `Score: ${lead.score}/100 — Signals: ${signals.join(', ')}. ARV est. $${arv.toLocaleString()}.`,
        now, null,
      ],
    );
    await dbRun(
      "UPDATE property_leads SET promoted_seller_id = ?, status = 'promoted' WHERE parcel_id = ?",
      [sellerId, parcelId],
    );
    promoted++;
  }
  return promoted;
}

export async function runPropertyIntelScan() {
  const now = new Date().toISOString();
  const counts = { total: 0, hot: 0, warm: 0, cold: 0, promoted: 0, errors: [] };

  let properties, vacantSet, violationsSet;
  try {
    [properties, vacantSet, violationsSet] = await Promise.all([
      fetchPropertyOwnership(),
      fetchVacantBlighted(),
      fetchCodeViolations(),
    ]);
  } catch (err) {
    counts.errors.push(`API fetch failed: ${err.message}`);
    console.error('property-intel: fetch failed', err);
    return counts;
  }

  const unique = deduplicateByParcelId(properties);
  counts.total = unique.size;

  const hotParcelIds = [];
  for (const property of unique.values()) {
    const signals = buildSignals(property, vacantSet, violationsSet);
    const score = scoreProperty(signals);
    const tier = classifyLead(score);
    if (tier === 'cold') { counts.cold++; continue; }
    try {
      await upsertLead(property, signals, score, now);
      if (tier === 'hot') { counts.hot++; hotParcelIds.push(property.parcelId); }
      else counts.warm++;
    } catch (err) {
      counts.errors.push(`upsert ${property.parcelId}: ${err.message}`);
    }
  }

  counts.promoted = await promoteHotLeads(hotParcelIds, now);

  if (hotParcelIds.length > 0 && config.notifyEmail) {
    const hotLeads = await dbAll(
      `SELECT * FROM property_leads WHERE parcel_id IN (${hotParcelIds.slice(0, 5).map(() => '?').join(',')}) ORDER BY score DESC`,
      hotParcelIds.slice(0, 5),
    );
    const email = buildDigestEmail(hotLeads);
    if (email) {
      await sendEmail({ to: config.notifyEmail, subject: email.subject, html: email.html })
        .catch((e) => console.error('digest email failed', e));
    }
  }

  console.log(`property-intel scan complete: ${JSON.stringify(counts)}`);
  return counts;
}
