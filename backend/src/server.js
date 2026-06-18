import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'url';
import { config, integrationStatus } from './config.js';
import { initDb, db } from './db.js';
import { v4 as uuid } from 'uuid';
import { analyzeDealWithAI, scoreSeller } from './ai-service.js';
import { getMarketTrends, getNeighborhoodDemographics, geocodeAddress, getLiveComps } from './api-services.js';

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
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/markets/:id', (req, res) => {
  db.get('SELECT * FROM markets WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
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
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/comps/:id', (req, res) => {
  db.get('SELECT * FROM comps WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

// Sellers endpoints
app.get('/api/sellers', (req, res) => {
  db.all('SELECT * FROM sellers ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/sellers', (req, res) => {
  const { name, phone, email, property_address, property_city, property_state, motivation } = req.body;
  const id = uuid();
  const created_at = new Date().toISOString();
  
  db.run(
    `INSERT INTO sellers (id, name, phone, email, property_address, property_city, property_state, motivation, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, phone, email, property_address, property_city, property_state, motivation, 'new', created_at],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id, name, phone, email, property_address, property_city, property_state, motivation, status: 'new', created_at });
    }
  );
});

app.put('/api/sellers/:id', (req, res) => {
  const { name, phone, email, status, motivation } = req.body;
  const last_contacted = new Date().toISOString();
  
  db.run(
    `UPDATE sellers SET name = ?, phone = ?, email = ?, status = ?, motivation = ?, last_contacted = ? WHERE id = ?`,
    [name, phone, email, status, motivation, last_contacted, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// Buyers endpoints
app.get('/api/buyers', (req, res) => {
  db.all('SELECT * FROM buyers ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/buyers', (req, res) => {
  const { name, phone, email, cash_available, deal_types, preferred_areas, avg_deal_size } = req.body;
  const id = uuid();
  const created_at = new Date().toISOString();
  
  db.run(
    `INSERT INTO buyers (id, name, phone, email, cash_available, deal_types, preferred_areas, avg_deal_size, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, phone, email, cash_available, deal_types, preferred_areas, avg_deal_size, 'active', created_at],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id, name, phone, email, cash_available, deal_types, preferred_areas, avg_deal_size, status: 'active', created_at });
    }
  );
});

app.put('/api/buyers/:id', (req, res) => {
  const { name, phone, email, cash_available, deal_types, preferred_areas, status } = req.body;
  const last_contacted = new Date().toISOString();
  
  db.run(
    `UPDATE buyers SET name = ?, phone = ?, email = ?, cash_available = ?, deal_types = ?, preferred_areas = ?, status = ?, last_contacted = ? WHERE id = ?`,
    [name, phone, email, cash_available, deal_types, preferred_areas, status, last_contacted, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
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
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});


// ========== AI ANALYSIS ENDPOINTS ==========

app.post('/api/analyze-deal', async (req, res) => {
  const dealData = req.body;
  const result = await analyzeDealWithAI(dealData);
  res.json(result);
});

app.post('/api/score-seller', async (req, res) => {
  const sellerData = req.body;
  const result = await scoreSeller(sellerData);
  res.json(result);
});

// ========== MARKET DATA ENDPOINTS ==========

app.get('/api/market-trends/:metro', async (req, res) => {
  const { metro } = req.params;
  const result = await getMarketTrends(metro);
  res.json(result);
});

app.get('/api/neighborhood/:zipCode', async (req, res) => {
  const { zipCode } = req.params;
  const result = await getNeighborhoodDemographics(zipCode);
  res.json(result);
});

// ========== GEOCODING ENDPOINTS ==========

app.get('/api/geocode', async (req, res) => {
  const { address, city, state } = req.query;
  const fullAddress = `${address} ${city} ${state}`.trim();
  const result = await geocodeAddress(fullAddress);
  res.json(result);
});

// ========== LIVE COMPS ENDPOINTS ==========

app.get('/api/live-comps', async (req, res) => {
  const { address, city, state } = req.query;
  if (!address || !city || !state) {
    return res.status(400).json({ error: 'Missing address, city, or state' });
  }
  const result = await getLiveComps(address, city, state);
  res.json(result);
});

export default app;

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
  });
}
