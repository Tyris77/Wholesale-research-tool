import { v4 as uuid } from 'uuid';
import { dbRun, dbGet, dbAll } from './db.js';
import { sendEmail } from './email-service.js';
import { config } from './config.js';

const SIGNAL_POINTS = {
  tax_delinquent: 40,
  absentee_owner: 20,
  out_of_state: 15,
  vacant: 25,
  long_ownership: 15,
};

const DC_MD_VA = new Set(['DC', 'MD', 'VA']);

// "Long ownership" = held 25+ years. DC does not publish code violations as a
// parcel-joinable dataset, so this fills that signal slot with an equally
// strong, available motivation indicator (high equity, aging/tired owner,
// likely inherited) computed from ITSPE's last-sale date.
const LONG_OWNERSHIP_MS = 25 * 365.25 * 24 * 60 * 60 * 1000;

let scanRunning = false;

export function scoreProperty(signals) {
  const total = signals.reduce((sum, s) => sum + (SIGNAL_POINTS[s] ?? 0), 0);
  return Math.min(total, 100);
}

export function classifyLead(score) {
  if (score >= 75) return 'hot';
  if (score >= 50) return 'warm';
  return 'cold';
}

// Absentee = the property's address does not begin with the owner's mailing
// street. DC's ITSPE stores the full property address in PREMISEADD
// ("25 BUCHANAN ST NE WASHINGTON DC 20011") and the owner's mailing street in
// ADDRESS1 ("25 BUCHANAN ST NE"), so an owner-occupant's property address
// starts with their mailing street; an absentee owner's does not.
export function isAbsentee(ownerAddress, propertyAddress) {
  if (!ownerAddress || !propertyAddress) return false;
  const owner = ownerAddress.trim().toUpperCase();
  const property = propertyAddress.trim().toUpperCase();
  if (!owner || !property) return false;
  return !property.startsWith(owner);
}

export function isOutOfState(ownerState) {
  if (!ownerState) return false;
  return !DC_MD_VA.has(ownerState.trim().toUpperCase());
}

// Extract the 2-letter state from an ITSPE CITYSTZIP value such as
// "WASHINGTON DC 20011-6717" or "ALEXANDRIA VA 22310-2633".
export function parseState(cityStZip) {
  if (!cityStZip) return '';
  const m = String(cityStZip).toUpperCase().match(/\b([A-Z]{2})\s+\d{5}/);
  return m ? m[1] : '';
}

// True when the last recorded sale (epoch ms) is 25+ years before `now`.
// A missing/zero sale date does NOT fire — it usually means missing data, and
// a false motivation signal is worse than a missed one.
export function isLongOwnership(saleDateMs, now = Date.now()) {
  if (!saleDateMs || saleDateMs <= 0) return false;
  return now - saleDateMs >= LONG_OWNERSHIP_MS;
}

// Verified working DC endpoints (checked 2026-06-21).
//
// ITSPE (Integrated Tax System Public Extract) is the master tax-roll table:
// one row per parcel with owner name, mailing address, assessed value, and
// back-taxes owed. DC rotates the feature-service name with a monthly date
// suffix (e.g. OCFO_ITSPE_view_05212026), so we discover the current service
// at runtime via the ArcGIS item search rather than hardcoding the URL.
const ITSPE_SEARCH = 'https://www.arcgis.com/sharing/rest/search?q=title%3AITSPE&f=json&num=25';
// DC Office of Buildings "Vacant and Blighted Building Addresses" layer.
const VACANT_BLIGHTED =
  'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/MapServer/82/query';
// DC Master Address Repository "Address Points" — the SSL→Ward source (ITSPE
// itself has no ward field).
const ADDRESS_POINTS =
  'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Location_WebMercator/MapServer/0/query';

// SSL (Square-Suffix-Lot) values carry internal padding that differs between
// sources ("3160    0805"); strip whitespace so the ITSPE↔vacant join is exact.
function normalizeSsl(ssl) {
  return String(ssl ?? '').replace(/\s+/g, '').toUpperCase();
}

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

// Resolve the current ITSPE query endpoint. Returns e.g.
// ".../OCFO_ITSPE_view_05212026/FeatureServer/53/query". The ITSPE data lives
// in a *table* (not layer 0), so we look it up by name.
export async function discoverItspeQueryUrl() {
  const search = await fetchWithRetry(ITSPE_SEARCH);
  const svc = (search.results || []).find(
    (r) => r.type === 'Feature Service' && /OCFO_ITSPE_view/i.test(r.url || ''),
  );
  if (!svc) throw new Error('Could not discover current ITSPE feature service');
  const meta = await fetchWithRetry(`${svc.url}?f=json`);
  const table = (meta.tables || []).find((t) => t.name === 'ITSPE');
  if (!table) throw new Error('ITSPE table not found in feature service');
  return `${svc.url}/${table.id}/query`;
}

// Page through an ArcGIS query endpoint. Uses the server's own
// `exceededTransferLimit` flag (rather than a fixed page size) so it works
// whether the service caps results at 1000, 2000, or anything else.
export async function fetchAllPages(queryUrl, where, outFields) {
  const records = [];
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({
      where,
      outFields,
      returnGeometry: 'false',
      f: 'json',
      resultOffset: String(offset),
      resultRecordCount: '2000',
    });
    const data = await fetchWithRetry(`${queryUrl}?${params}`);
    if (data.error) throw new Error(`ArcGIS error: ${JSON.stringify(data.error)}`);
    const features = data.features ?? [];
    records.push(...features.map((f) => f.attributes));
    if (!data.exceededTransferLimit || features.length === 0) break;
    offset += features.length;
  }
  return records;
}

// We scan the tax-delinquent residential pool (~11k parcels) rather than all
// ~188k residential parcels. A lead only reaches the warm tier (score ≥ 50)
// with two stacked signals, and tax delinquency (+40) is the dominant one — so
// every meaningful lead is in this pool. Pulling 11k instead of 188k keeps the
// scan fast and well within memory, and avoids the all-or-nothing failure mode
// of fetching the entire roll. (Non-delinquent vacant+absentee leads are a
// documented fast-follow.)
export async function fetchPropertyOwnership() {
  const queryUrl = await discoverItspeQueryUrl();
  const rows = await fetchAllPages(
    queryUrl,
    "PROPTYPE LIKE 'Residential%' AND TOTBALAMT > 0",
    'SSL,PREMISEADD,OWNERNAME,ADDRESS1,CITYSTZIP,ASSESSMENT,TOTBALAMT,SALEDATE',
  );
  return rows.map((r) => {
    const ownerStreet = String(r.ADDRESS1 ?? '').trim();
    const cityStZip = String(r.CITYSTZIP ?? '').trim();
    return {
      parcelId: normalizeSsl(r.SSL),
      address: String(r.PREMISEADD ?? '').trim(),
      ward: null, // enriched from the Address Points ward map during the scan
      ownerName: String(r.OWNERNAME ?? '').trim(),
      // ownerAddress is the mailing STREET, used for the absentee comparison
      // against the property address. ownerMailing is the full string we store.
      ownerAddress: ownerStreet,
      ownerMailing: [ownerStreet, cityStZip].filter(Boolean).join(', '),
      ownerState: parseState(cityStZip),
      assessedValue: Number(r.ASSESSMENT) || 0,
      taxDelinquent: Number(r.TOTBALAMT) > 0,
      longOwnership: isLongOwnership(Number(r.SALEDATE) || 0),
    };
  }).filter((r) => r.parcelId && r.address);
}

export async function fetchVacantBlighted() {
  const rows = await fetchAllPages(VACANT_BLIGHTED, "STATUS='ACTIVE'", 'SSL');
  return new Set(rows.map((r) => normalizeSsl(r.SSL)).filter(Boolean));
}

// Build an SSL→Ward lookup from the Master Address Repository (~144k rows).
export async function fetchWardMap() {
  const rows = await fetchAllPages(ADDRESS_POINTS, 'SSL IS NOT NULL', 'SSL,WARD');
  const map = new Map();
  for (const r of rows) {
    const ssl = normalizeSsl(r.SSL);
    if (ssl && r.WARD) map.set(ssl, String(r.WARD).trim());
  }
  return map;
}

export function buildSignals(property, vacantSet) {
  const signals = [];
  if (property.taxDelinquent) signals.push('tax_delinquent');
  if (isAbsentee(property.ownerAddress, property.address)) {
    signals.push('absentee_owner');
    if (isOutOfState(property.ownerState)) signals.push('out_of_state');
  }
  if (vacantSet.has(property.parcelId)) signals.push('vacant');
  if (property.longOwnership) signals.push('long_ownership');
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
      property.ownerName, property.ownerMailing ?? property.ownerAddress, property.assessedValue,
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
  if (scanRunning) return { total: 0, hot: 0, warm: 0, cold: 0, promoted: 0, errors: ['scan already in progress'] };
  scanRunning = true;
  const now = new Date().toISOString();
  const counts = { total: 0, hot: 0, warm: 0, cold: 0, promoted: 0, errors: [] };

  try {
    // The property roll is essential; if it fails, abort. The vacant layer is an
    // enhancement — if it fails, scan without the vacant signal rather than
    // losing the whole run.
    let properties;
    try {
      properties = await fetchPropertyOwnership();
    } catch (err) {
      counts.errors.push(`property fetch failed: ${err.message}`);
      console.error('property-intel: property fetch failed', err);
      return counts;
    }
    let vacantSet = new Set();
    try {
      vacantSet = await fetchVacantBlighted();
    } catch (err) {
      counts.errors.push(`vacant fetch failed (continuing without vacant signal): ${err.message}`);
      console.error('property-intel: vacant fetch failed, continuing', err);
    }
    // Ward enrichment is non-fatal — on failure leads simply have ward = null.
    let wardMap = new Map();
    try {
      wardMap = await fetchWardMap();
    } catch (err) {
      counts.errors.push(`ward fetch failed (continuing without ward): ${err.message}`);
      console.error('property-intel: ward fetch failed, continuing', err);
    }

    const unique = deduplicateByParcelId(properties);
    counts.total = unique.size;

    const hotParcelIds = [];   // score >= 75 — shown in the digest
    const promoteParcelIds = []; // score === 100 — auto-promoted to Sellers
    for (const property of unique.values()) {
      property.ward = wardMap.get(property.parcelId) ?? null;
      const signals = buildSignals(property, vacantSet);
      const score = scoreProperty(signals);
      const tier = classifyLead(score);
      if (tier === 'cold') { counts.cold++; continue; }
      try {
        await upsertLead(property, signals, score, now);
        if (tier === 'hot') {
          counts.hot++;
          hotParcelIds.push(property.parcelId);
          // Only the very strongest leads (all four signals = 100) are
          // auto-promoted to Sellers, to keep that list actionable. Every other
          // warm/hot lead lives in Lead Finder for manual review.
          if (score === 100) promoteParcelIds.push(property.parcelId);
        } else {
          counts.warm++;
        }
      } catch (err) {
        counts.errors.push(`upsert ${property.parcelId}: ${err.message}`);
      }
    }

    counts.promoted = await promoteHotLeads(promoteParcelIds, now);

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
  } finally {
    scanRunning = false;
  }
}

// Synchronous, step-by-step diagnostic so production failures are visible via a
// single HTTP call instead of only in server logs. Returns where the pipeline
// breaks (runtime, discovery, ITSPE fetch, vacant fetch, or DB write).
export async function diagnoseScan() {
  const report = {
    nodeVersion: process.version,
    hasFetch: typeof fetch === 'function',
    steps: {},
  };
  try {
    const url = await discoverItspeQueryUrl();
    report.steps.discoverItspe = { ok: true, url };
    try {
      const params = new URLSearchParams({
        where: "PROPTYPE LIKE 'Residential%' AND TOTBALAMT > 0",
        outFields: 'SSL,TOTBALAMT', returnGeometry: 'false', f: 'json', resultRecordCount: '5',
      });
      const data = await fetchWithRetry(`${url}?${params}`);
      report.steps.itspeFetch = { ok: true, sample: (data.features || []).length, exceededTransferLimit: !!data.exceededTransferLimit };
    } catch (e) { report.steps.itspeFetch = { ok: false, error: e.message }; }
  } catch (e) {
    report.steps.discoverItspe = { ok: false, error: e.message };
  }
  try {
    const params = new URLSearchParams({ where: "STATUS='ACTIVE'", outFields: 'SSL', returnGeometry: 'false', f: 'json', resultRecordCount: '5' });
    const data = await fetchWithRetry(`${VACANT_BLIGHTED}?${params}`);
    report.steps.vacantFetch = { ok: true, sample: (data.features || []).length };
  } catch (e) { report.steps.vacantFetch = { ok: false, error: e.message }; }
  try {
    const probe = '__diag_probe__';
    const ts = new Date().toISOString();
    await dbRun(
      `INSERT INTO property_leads (parcel_id, address, score, signals, status, last_scanned_at, created_at)
       VALUES (?, '1 DIAG ST', 0, '[]', 'new', ?, ?)
       ON CONFLICT(parcel_id) DO UPDATE SET last_scanned_at = excluded.last_scanned_at`,
      [probe, ts, ts],
    );
    const row = await dbGet('SELECT parcel_id FROM property_leads WHERE parcel_id = ?', [probe]);
    await dbRun('DELETE FROM property_leads WHERE parcel_id = ?', [probe]);
    report.steps.dbWrite = { ok: !!row };
  } catch (e) { report.steps.dbWrite = { ok: false, error: e.message }; }
  return report;
}
