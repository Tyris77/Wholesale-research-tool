import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'url';
import { config, integrationStatus } from './config.js';
import { initDb, db, dbAll, dbGet, dbRun } from './db.js';
import { v4 as uuid } from 'uuid';
import { analyzeDealWithAI, scoreSeller } from './ai-service.js';
import { getMarketTrends, getNeighborhoodDemographics, geocodeAddress, getLiveComps } from './api-services.js';
import { computeDeal } from './deal-math.js';
import { estimateArv, medianPricePerSqft, matchBuyers } from './analytics.js';
import { summarizeDeals, profitByMonth, leadFunnel, matchedDealCount, topMarkets } from './insights.js';
import { sendEmail } from './email-service.js';
import { emailMatchedBuyers, dueSellers } from './outreach.js';
import { campaignRunAts, dueSteps, buildFollowUpDigest, shouldSendDigest } from './scheduling.js';
import { isConfigured } from './config.js';
import { asyncHandler, errorHandler, validateBody } from './middleware.js';
import {
  sellerCreateSchema,
  sellerUpdateSchema,
  buyerCreateSchema,
  buyerUpdateSchema,
  dealAnalysisSchema,
  sellerScoreSchema,
  dealCreateSchema,
  dealUpdateSchema,
  logContactSchema,
  campaignCreateSchema,
} from './schemas.js';

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

initDb();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', integrations: integrationStatus() });
});

// Markets endpoints
app.get('/api/markets', (req, res) => {
  db.all('SELECT * FROM markets ORDER BY heat_score DESC', (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/markets/:id', (req, res) => {
  db.get('SELECT * FROM markets WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json(row);
  });
});

// Properties/Comps endpoints
app.get('/api/comps', (req, res) => {
  const { city, state } = req.query;
  let query = 'SELECT * FROM comps';
  const params = [];
  
  if (city) {
    query += ' WHERE city = ?';
    params.push(city);
  }
  if (state) {
    query += (params.length > 0 ? ' AND' : ' WHERE') + ' state = ?';
    params.push(state);
  }
  query += ' ORDER BY sold_date DESC LIMIT 20';
  
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/comps/:id', (req, res) => {
  db.get('SELECT * FROM comps WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json(row);
  });
});

// Sellers endpoints
app.get('/api/sellers', (req, res) => {
  db.all('SELECT * FROM sellers ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/sellers', validateBody(sellerCreateSchema), (req, res) => {
  const { name, phone, email, property_address, property_city, property_state, motivation } = req.body;
  const id = uuid();
  const created_at = new Date().toISOString();
  
  db.run(
    `INSERT INTO sellers (id, name, phone, email, property_address, property_city, property_state, motivation, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, phone, email, property_address, property_city, property_state, motivation, 'new', created_at],
    function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ id, name, phone, email, property_address, property_city, property_state, motivation, status: 'new', created_at });
    }
  );
});

app.put('/api/sellers/:id', validateBody(sellerUpdateSchema), (req, res) => {
  const { name, phone, email, status, motivation, next_follow_up } = req.body;
  const last_contacted = new Date().toISOString();

  db.run(
    `UPDATE sellers SET name = ?, phone = ?, email = ?, status = ?, motivation = ?, next_follow_up = ?, last_contacted = ? WHERE id = ?`,
    [name, phone, email, status, motivation, next_follow_up || null, last_contacted, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true });
    }
  );
});

// Buyers endpoints
app.get('/api/buyers', (req, res) => {
  db.all('SELECT * FROM buyers ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/buyers', validateBody(buyerCreateSchema), (req, res) => {
  const { name, phone, email, cash_available, deal_types, preferred_areas, avg_deal_size } = req.body;
  const id = uuid();
  const created_at = new Date().toISOString();
  
  db.run(
    `INSERT INTO buyers (id, name, phone, email, cash_available, deal_types, preferred_areas, avg_deal_size, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, phone, email, cash_available, deal_types, preferred_areas, avg_deal_size, 'active', created_at],
    function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ id, name, phone, email, cash_available, deal_types, preferred_areas, avg_deal_size, status: 'active', created_at });
    }
  );
});

app.put('/api/buyers/:id', validateBody(buyerUpdateSchema), (req, res) => {
  const { name, phone, email, cash_available, deal_types, preferred_areas, status } = req.body;
  const last_contacted = new Date().toISOString();
  
  db.run(
    `UPDATE buyers SET name = ?, phone = ?, email = ?, cash_available = ?, deal_types = ?, preferred_areas = ?, status = ?, last_contacted = ? WHERE id = ?`,
    [name, phone, email, cash_available, deal_types, preferred_areas, status, last_contacted, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true });
    }
  );
});

// Properties search endpoint
app.get('/api/properties/search', (req, res) => {
  const { city, state, maxPrice, minBeds } = req.query;
  let query = 'SELECT * FROM properties WHERE 1=1';
  const params = [];
  
  if (city) {
    query += ' AND city = ?';
    params.push(city);
  }
  if (state) {
    query += ' AND state = ?';
    params.push(state);
  }
  if (maxPrice) {
    query += ' AND price <= ?';
    params.push(Number(maxPrice));
  }
  if (minBeds) {
    query += ' AND beds >= ?';
    params.push(Number(minBeds));
  }
  query += ' LIMIT 50';
  
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json(rows || []);
  });
});


// ========== AI ANALYSIS ENDPOINTS ==========

app.post('/api/analyze-deal', validateBody(dealAnalysisSchema), asyncHandler(async (req, res) => {
  const result = await analyzeDealWithAI(req.body);
  res.json(result);
}));

app.post('/api/score-seller', validateBody(sellerScoreSchema), asyncHandler(async (req, res) => {
  const result = await scoreSeller(req.body);
  res.json(result);
}));

// ========== MARKET DATA ENDPOINTS ==========

app.get('/api/market-trends/:metro', asyncHandler(async (req, res) => {
  const { metro } = req.params;
  const result = await getMarketTrends(metro);
  res.json(result);
}));

app.get('/api/neighborhood/:zipCode', asyncHandler(async (req, res) => {
  const { zipCode } = req.params;
  const result = await getNeighborhoodDemographics(zipCode);
  res.json(result);
}));

// ========== GEOCODING ENDPOINTS ==========

app.get('/api/geocode', asyncHandler(async (req, res) => {
  const { address, city, state } = req.query;
  const fullAddress = `${address} ${city} ${state}`.trim();
  const result = await geocodeAddress(fullAddress);
  res.json(result);
}));

// ========== LIVE COMPS ENDPOINTS ==========

app.get('/api/live-comps', asyncHandler(async (req, res) => {
  const { address, city, state } = req.query;
  if (!address || !city || !state) {
    return res.status(400).json({ success: false, error: 'Missing address, city, or state' });
  }
  const result = await getLiveComps(address, city, state);
  res.json(result);
}));

// ========== DEALS ENDPOINTS ==========

app.get('/api/deals', asyncHandler(async (req, res) => {
  const rows = await dbAll('SELECT * FROM deals ORDER BY created_at DESC');
  res.json(rows);
}));

app.get('/api/deals/:id', asyncHandler(async (req, res) => {
  const row = await dbGet('SELECT * FROM deals WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ success: false, error: 'Deal not found' });
  res.json(row);
}));

app.post('/api/deals', validateBody(dealCreateSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const { profit, roi } = computeDeal(b);
  const id = uuid();
  const now = new Date().toISOString();
  const deal = {
    id, name: b.name, property_address: b.property_address || '', city: b.city || '', state: b.state || '',
    purchase_price: b.purchase_price, repair_budget: b.repair_budget, arv: b.arv,
    selling_costs: b.selling_costs, holding_costs: b.holding_costs, wholesale_fee: b.wholesale_fee,
    deal_type: b.deal_type || 'wholesale',
    profit, roi, status: b.status || 'analyzing', created_at: now, updated_at: now,
  };
  await dbRun(
    `INSERT INTO deals (id, name, property_address, city, state, purchase_price, repair_budget, arv, selling_costs, holding_costs, wholesale_fee, deal_type, profit, roi, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [deal.id, deal.name, deal.property_address, deal.city, deal.state, deal.purchase_price, deal.repair_budget, deal.arv, deal.selling_costs, deal.holding_costs, deal.wholesale_fee, deal.deal_type, deal.profit, deal.roi, deal.status, deal.created_at, deal.updated_at],
  );
  res.json(deal);
}));

app.put('/api/deals/:id', validateBody(dealUpdateSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const { profit, roi } = computeDeal(b);
  const now = new Date().toISOString();
  await dbRun(
    `UPDATE deals SET name = ?, property_address = ?, city = ?, state = ?, purchase_price = ?, repair_budget = ?, arv = ?, selling_costs = ?, holding_costs = ?, wholesale_fee = ?, deal_type = ?, profit = ?, roi = ?, status = ?, updated_at = ? WHERE id = ?`,
    [b.name, b.property_address || '', b.city || '', b.state || '', b.purchase_price, b.repair_budget, b.arv, b.selling_costs, b.holding_costs, b.wholesale_fee, b.deal_type || 'wholesale', profit, roi, b.status || 'analyzing', now, req.params.id],
  );
  res.json({ success: true, profit, roi });
}));

app.delete('/api/deals/:id', asyncHandler(async (req, res) => {
  await dbRun('DELETE FROM deals WHERE id = ?', [req.params.id]);
  res.json({ success: true });
}));

// ========== ARV ESTIMATE FROM COMPS ==========

app.get('/api/arv', asyncHandler(async (req, res) => {
  const { city, state } = req.query;
  const sqft = Number(req.query.sqft);
  if (!sqft || sqft <= 0) return res.status(400).json({ success: false, error: 'A valid sqft is required' });

  let sql = 'SELECT * FROM comps';
  const params = [];
  const conds = [];
  if (city) { conds.push('city = ?'); params.push(city); }
  if (state) { conds.push('state = ?'); params.push(state); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');

  const comps = await dbAll(sql, params);
  const estimatedArv = estimateArv(comps, sqft);
  if (estimatedArv == null) {
    return res.json({ success: false, error: 'No comparable sales found for these filters' });
  }
  res.json({ success: true, estimatedArv, medianPricePerSqft: medianPricePerSqft(comps), compCount: comps.length, sqft });
}));

// ========== BUYER MATCHES FOR A DEAL ==========

app.get('/api/deals/:id/matches', asyncHandler(async (req, res) => {
  const deal = await dbGet('SELECT * FROM deals WHERE id = ?', [req.params.id]);
  if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
  const buyers = await dbAll('SELECT * FROM buyers');
  res.json({ success: true, matches: matchBuyers(deal, buyers) });
}));

// ========== INSIGHTS / ANALYTICS ==========

app.get('/api/insights', asyncHandler(async (req, res) => {
  const [deals, sellers, buyers, markets] = await Promise.all([
    dbAll('SELECT * FROM deals'),
    dbAll('SELECT * FROM sellers'),
    dbAll('SELECT * FROM buyers'),
    dbAll('SELECT * FROM markets'),
  ]);

  res.json({
    deals: {
      ...summarizeDeals(deals),
      matchedCount: matchedDealCount(deals, buyers),
      profitByMonth: profitByMonth(deals),
    },
    leads: leadFunnel(sellers, buyers),
    markets: { top: topMarkets(markets, 5) },
  });
}));

// ========== OUTREACH & FOLLOW-UP ==========

function emailConfigured() {
  return isConfigured(config.keys.resend) && Boolean(config.emailFrom);
}

async function recordActivities(dealId, activities) {
  const now = new Date().toISOString();
  for (const a of activities) {
    await dbRun(
      `INSERT INTO activities (id, deal_id, contact_type, contact_id, contact_name, channel, subject, status, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), dealId, a.contact_type, a.contact_id, a.contact_name, a.channel, a.subject, a.status, a.detail, now],
    );
  }
}

app.post('/api/deals/:id/email-buyers', asyncHandler(async (req, res) => {
  const deal = await dbGet('SELECT * FROM deals WHERE id = ?', [req.params.id]);
  if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
  if (!emailConfigured()) {
    return res.json({ success: false, error: 'Email is not configured (set RESEND_API_KEY and EMAIL_FROM)' });
  }
  const buyers = await dbAll('SELECT * FROM buyers');
  const matches = matchBuyers(deal, buyers);
  const outcome = await emailMatchedBuyers(deal, matches, (msg) => sendEmail(msg));
  await recordActivities(deal.id, outcome.activities);
  res.json({ success: true, sent: outcome.sent, failed: outcome.failed, skipped: outcome.skipped, results: outcome.results });
}));

app.get('/api/deals/:id/activities', asyncHandler(async (req, res) => {
  const rows = await dbAll('SELECT * FROM activities WHERE deal_id = ? ORDER BY created_at DESC', [req.params.id]);
  res.json(rows);
}));

app.get('/api/activities', asyncHandler(async (req, res) => {
  const rows = await dbAll('SELECT * FROM activities ORDER BY created_at DESC LIMIT 50');
  res.json(rows);
}));

app.get('/api/follow-ups', asyncHandler(async (req, res) => {
  const sellers = await dbAll('SELECT * FROM sellers');
  const today = new Date().toISOString().slice(0, 10);
  res.json(dueSellers(sellers, today));
}));

app.post('/api/sellers/:id/log-contact', validateBody(logContactSchema), asyncHandler(async (req, res) => {
  const seller = await dbGet('SELECT * FROM sellers WHERE id = ?', [req.params.id]);
  if (!seller) return res.status(404).json({ success: false, error: 'Seller not found' });
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO activities (id, deal_id, contact_type, contact_id, contact_name, channel, subject, status, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), null, 'seller', seller.id, seller.name, 'note', 'Follow-up contact', 'logged', req.body.note || '', now],
  );
  await dbRun(
    'UPDATE sellers SET last_contacted = ?, next_follow_up = ? WHERE id = ?',
    [now, req.body.next_follow_up || null, seller.id],
  );
  res.json({ success: true });
}));

// ========== AUTOMATED CAMPAIGNS ==========

async function loadCampaigns(where = '', params = []) {
  const campaigns = await dbAll(`SELECT * FROM campaigns ${where} ORDER BY created_at DESC`, params);
  for (const c of campaigns) {
    c.steps = await dbAll('SELECT * FROM campaign_steps WHERE campaign_id = ? ORDER BY step_no', [c.id]);
  }
  return campaigns;
}

app.post('/api/deals/:id/campaigns', validateBody(campaignCreateSchema), asyncHandler(async (req, res) => {
  const deal = await dbGet('SELECT * FROM deals WHERE id = ?', [req.params.id]);
  if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
  const now = new Date().toISOString();
  const id = uuid();
  const name = req.body.name || `${deal.name} outreach`;
  await dbRun(
    'INSERT INTO campaigns (id, deal_id, name, status, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, deal.id, name, 'active', now],
  );
  const runAts = campaignRunAts(now, req.body.offsets_days);
  for (let i = 0; i < runAts.length; i++) {
    await dbRun(
      'INSERT INTO campaign_steps (id, campaign_id, step_no, run_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), id, i + 1, runAts[i], 'pending', now],
    );
  }
  const [campaign] = await loadCampaigns('WHERE id = ?', [id]);
  res.json(campaign);
}));

app.get('/api/deals/:id/campaigns', asyncHandler(async (req, res) => {
  res.json(await loadCampaigns('WHERE deal_id = ?', [req.params.id]));
}));

app.get('/api/campaigns', asyncHandler(async (req, res) => {
  res.json(await loadCampaigns());
}));

function campaignStatusRoute(path, status) {
  app.post(path, asyncHandler(async (req, res) => {
    const campaign = await dbGet('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    await dbRun('UPDATE campaigns SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true });
  }));
}
campaignStatusRoute('/api/campaigns/:id/pause', 'paused');
campaignStatusRoute('/api/campaigns/:id/resume', 'active');
campaignStatusRoute('/api/campaigns/:id/cancel', 'cancelled');

app.use(errorHandler);

export default app;

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
  });
}
