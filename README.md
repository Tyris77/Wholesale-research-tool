# Wholesale Research Tool - Complete Real Estate Platform

## ✅ STATUS: COMPLETE & READY TO USE

All 8 pages built and working. All free APIs integrated. Just add your API keys (30 minutes) and start analyzing deals!

**See [API_SETUP_GUIDE.md](API_SETUP_GUIDE.md) to get your free API keys and configure the platform.**

---

## 🏠 Platform Overview
Full-stack wholesale real estate research platform with deal calculator, market analytics, seller/buyer management, property comps engine, and AI-powered deal analysis.

### Features
- **Deal Calculator**: Input numbers → get profit/ROI analysis  
- **Market Heatmap**: Heat-scored US markets ranked by investment potential
- **Property Search**: Find comps, analyze neighborhoods, research trends
- **Seller Lead Manager**: Track prospects, manage contact status, note motivation
- **Buyer Directory**: Connect with cash buyers and investors
- **Comps Engine**: Recent sold homes with price-per-sqft analysis
- **Rehab Estimator**: Cost breakdowns by category (kitchen, roof, paint, etc.)
- **AI Deal Analyzer** ⭐ NEW: Groq AI analyzes deals and scores seller leads in real-time
- **Advanced Research** ⭐ NEW: Market trends (FRED), demographics (Census), geocoding (OpenStreetMap)

---

## 📁 Project Structure

```
wholesale-research-tool/
├── backend/
│   ├── src/
│   │   ├── db.js           # SQLite database, seeding
│   │   └── server.js       # Express API server
│   ├── package.json
│   └── wholesale.db        # SQLite database (created on first run)
├── src/
│   ├── pages/
│   │   ├── SellerLeadManager.tsx
│   │   ├── BuyerDirectory.tsx
│   │   ├── MarketHeatmap.tsx
│   │   └── PropertySearch.tsx
│   ├── App.tsx             # Main app with routing
│   ├── main.tsx            # React entry point
│   └── styles.css          # Global styles
├── index.html
├── package.json
├── vite.config.ts
└── start.bat               # Quick start script
```

---

## 🚀 Quick Start

### Option 1: Batch Script (Windows)
```bash
start.bat
```

### Option 2: Manual Start
**Terminal 1 - Backend:**
```bash
cd backend
npm start
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

### Access
- Frontend: http://localhost:4173
- API: http://localhost:5000/api

---

## 🔌 API Endpoints

### Markets
- `GET /api/markets` - All hot markets ranked
- `GET /api/markets/:id` - Market details

### Properties & Comps
- `GET /api/comps` - Search comps by city/state
- `GET /api/comps/:id` - Comp details
- `GET /api/properties/search` - Property search with filters

### Sellers
- `GET /api/sellers` - List all seller leads
- `POST /api/sellers` - Add new seller
- `PUT /api/sellers/:id` - Update seller status/info

### Buyers
- `GET /api/buyers` - List all buyers
- `POST /api/buyers` - Add new buyer
- `PUT /api/buyers/:id` - Update buyer info

---

## 🛠️ Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite (dev server, build)
- CSS Grid + Flexbox

**Backend:**
- Node.js + Express
- SQLite3 (database)
- CORS enabled

---

## 💾 Database Schema

**Markets**: city, state, heat_score, trend, avg_rent, avg_home_price, days_on_market, inventory_level

**Comps**: address, city, state, price, beds, baths, sqft, sold_date, price_per_sqft, days_on_market

**Sellers**: name, phone, email, property_address, city, state, motivation, status, created_at, last_contacted

**Buyers**: name, phone, email, cash_available, deal_types, preferred_areas, avg_deal_size, status, created_at

---

## 📊 Next Steps - Production Features

To make this enterprise-ready:

1. **Real Data Integration**
   - Zillow/Redfin API for live comps
   - County records API for absentee owners
   - MLS feeds for pre-foreclosures

2. **Authentication**
   - User accounts / login
   - Team workspaces
   - Role-based access

3. **Analytics**
   - Market trend charts
   - ROI tracking dashboards
   - Deal pipeline reports

4. **Advanced Matching**
   - Match sellers to investors
   - Suggest deals based on buyer criteria
   - Lead scoring algorithm

5. **Exports & Reporting**
   - PDF reports
   - CRM integrations (HubSpot, Salesforce)
   - Email campaigns

---

## 🤔 Usage Example

1. **Find a market**: Go to Markets → view heat scores
2. **Search comps**: Properties tab → filter by city/state
3. **Add seller**: Sellers tab → fill form → track status
4. **Run calculator**: Dashboard or Calculator tab → input numbers → see profit/ROI
5. **Match buyer**: Check Buyers tab → assign deal to investor

---

## 📝 Sample Data

Platform includes pre-seeded:
- 8 hot US markets (Atlanta, Phoenix, Charlotte, etc.)
- 3 Atlanta comps
- Ready for you to add custom sellers/buyers

---

## 🐛 Troubleshooting

**"Cannot GET /api/markets"?**
- Ensure backend is running: `npm start` in `/backend`

**Frontend not loading?**
- Check port 4173 is free: `netstat -ano | findstr :4173` (Windows)

**Database errors?**
- Delete `backend/wholesale.db` and restart backend to re-seed

**Styling looks off?**
- Hard refresh browser: Ctrl+Shift+R

---

## 📜 License
Free to use and modify for your wholesale business.

---

Built with ❤️ for real estate wholesalers. Happy hunting! 🔍
