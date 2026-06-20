import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuid } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'wholesale.db');

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Database error:', err);
  else console.log('Connected to SQLite database');
});

db.configure('busyTimeout', 5000);

export function initDb() {
  db.serialize(() => {
    // Markets table
    db.run(`
      CREATE TABLE IF NOT EXISTS markets (
        id TEXT PRIMARY KEY,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        heat_score INTEGER,
        trend TEXT,
        avg_rent REAL,
        avg_home_price REAL,
        days_on_market REAL,
        inventory_level TEXT
      )
    `);

    // Properties table
    db.run(`
      CREATE TABLE IF NOT EXISTS properties (
        id TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        city TEXT,
        state TEXT,
        zip TEXT,
        price REAL,
        beds INTEGER,
        baths REAL,
        sqft INTEGER,
        year_built INTEGER,
        arv REAL,
        condition TEXT,
        list_date TEXT,
        sold_date TEXT,
        days_on_market INTEGER,
        type TEXT
      )
    `);

    // Sellers table
    db.run(`
      CREATE TABLE IF NOT EXISTS sellers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        property_address TEXT,
        property_city TEXT,
        property_state TEXT,
        motivation TEXT,
        status TEXT,
        created_at TEXT,
        last_contacted TEXT
      )
    `);

    // Buyers table
    db.run(`
      CREATE TABLE IF NOT EXISTS buyers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        cash_available REAL,
        deal_types TEXT,
        preferred_areas TEXT,
        avg_deal_size REAL,
        status TEXT,
        created_at TEXT,
        last_contacted TEXT
      )
    `);

    // Comps table
    db.run(`
      CREATE TABLE IF NOT EXISTS comps (
        id TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        city TEXT,
        state TEXT,
        zip TEXT,
        price REAL,
        beds INTEGER,
        baths REAL,
        sqft INTEGER,
        sold_date TEXT,
        price_per_sqft REAL,
        days_on_market INTEGER
      )
    `, () => {
      seedData();
    });

    // Deals table
    db.run(`
      CREATE TABLE IF NOT EXISTS deals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        property_address TEXT,
        city TEXT,
        state TEXT,
        purchase_price REAL,
        repair_budget REAL,
        arv REAL,
        selling_costs REAL,
        holding_costs REAL,
        wholesale_fee REAL,
        deal_type TEXT,
        profit REAL,
        roi REAL,
        status TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);
    // Migrate deals tables created before deal_type existed. The error callback
    // swallows the "duplicate column name" error on DBs that already have it.
    db.run('ALTER TABLE deals ADD COLUMN deal_type TEXT', () => {});

    // Activities table (outreach + follow-up log)
    db.run(`
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        deal_id TEXT,
        contact_type TEXT,
        contact_id TEXT,
        contact_name TEXT,
        channel TEXT,
        subject TEXT,
        status TEXT,
        detail TEXT,
        created_at TEXT
      )
    `);
    // Follow-up date for sellers (migration for pre-existing DBs).
    db.run('ALTER TABLE sellers ADD COLUMN next_follow_up TEXT', () => {});

    // Campaigns (automated outreach) + their timed steps
    db.run(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        deal_id TEXT,
        name TEXT,
        status TEXT,
        created_at TEXT
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS campaign_steps (
        id TEXT PRIMARY KEY,
        campaign_id TEXT,
        step_no INTEGER,
        run_at TEXT,
        status TEXT,
        created_at TEXT
      )
    `);
    // Key/value app state (e.g. last digest date)
    db.run(`
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  });
}

function seedData() {
  db.get('SELECT COUNT(*) as count FROM markets', (err, row) => {
    if (err || row.count > 0) return;

    const markets = [
      { city: 'Atlanta', state: 'GA', heat_score: 86, trend: 'Rising', avg_rent: 1800, avg_home_price: 350000, days_on_market: 28, inventory_level: 'Low' },
      { city: 'Phoenix', state: 'AZ', heat_score: 82, trend: 'Strong', avg_rent: 1650, avg_home_price: 420000, days_on_market: 32, inventory_level: 'Medium' },
      { city: 'Charlotte', state: 'NC', heat_score: 79, trend: 'Heating', avg_rent: 1700, avg_home_price: 320000, days_on_market: 30, inventory_level: 'Low' },
      { city: 'Tampa', state: 'FL', heat_score: 77, trend: 'Growing', avg_rent: 1750, avg_home_price: 380000, days_on_market: 35, inventory_level: 'Medium' },
      { city: 'Dallas', state: 'TX', heat_score: 81, trend: 'Stable', avg_rent: 1900, avg_home_price: 380000, days_on_market: 29, inventory_level: 'Medium' },
      { city: 'Austin', state: 'TX', heat_score: 75, trend: 'Cooling', avg_rent: 2100, avg_home_price: 520000, days_on_market: 40, inventory_level: 'High' },
      { city: 'Denver', state: 'CO', heat_score: 72, trend: 'Stable', avg_rent: 1850, avg_home_price: 480000, days_on_market: 38, inventory_level: 'Medium' },
      { city: 'Nashville', state: 'TN', heat_score: 80, trend: 'Rising', avg_rent: 1650, avg_home_price: 360000, days_on_market: 27, inventory_level: 'Low' },
    ];

    const insertMarket = db.prepare(`
      INSERT INTO markets (id, city, state, heat_score, trend, avg_rent, avg_home_price, days_on_market, inventory_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    markets.forEach(m => {
      db.run('INSERT INTO markets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
        [uuid(), m.city, m.state, m.heat_score, m.trend, m.avg_rent, m.avg_home_price, m.days_on_market, m.inventory_level]);
    });

    const comps = [
      { address: '4812 Maple St, Atlanta, GA', city: 'Atlanta', state: 'GA', zip: '30303', price: 285000, beds: 3, baths: 2, sqft: 1800, sold_date: '2024-05-15', price_per_sqft: 158, days_on_market: 30 },
      { address: '1528 Oak Ave, Atlanta, GA', city: 'Atlanta', state: 'GA', zip: '30303', price: 299900, beds: 4, baths: 2, sqft: 2100, sold_date: '2024-05-22', price_per_sqft: 143, days_on_market: 24 },
      { address: '2371 Birch Rd, Atlanta, GA', city: 'Atlanta', state: 'GA', zip: '30303', price: 275000, beds: 3, baths: 2, sqft: 1750, sold_date: '2024-05-30', price_per_sqft: 157, days_on_market: 18 },
    ];

    comps.forEach(c => {
      db.run('INSERT INTO comps VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid(), c.address, c.city, c.state, c.zip, c.price, c.beds, c.baths, c.sqft, c.sold_date, c.price_per_sqft, c.days_on_market]);
    });

    console.log('Database initialized with seed data');
  });
}

export function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));
}
export function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
}
export function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) { return err ? reject(err) : resolve(this); }));
}
