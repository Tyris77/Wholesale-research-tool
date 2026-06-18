#!/usr/bin/env node

/**
 * Wholesale Research Tool - Deployment Guide
 * 
 * This file documents how to deploy the platform to production
 */

console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                WHOLESALE RESEARCH TOOL - DEPLOYMENT GUIDE                  ║
╚════════════════════════════════════════════════════════════════════════════╝

## DEVELOPMENT ENVIRONMENT

1. Prerequisites:
   ✓ Node.js 18+ 
   ✓ npm 8+
   ✓ Git

2. Installation:
   npm install
   cd backend && npm install && cd ..

3. Start Development:
   - Option A: Double-click start.bat (Windows)
   - Option B: Manual terminals:
     Terminal 1: cd backend && npm start
     Terminal 2: npm run dev

4. Access:
   - Frontend: http://localhost:4173
   - API: http://localhost:5000


## PRODUCTION DEPLOYMENT

### Backend (Node.js on VPS/AWS/DigitalOcean):

1. Upload backend folder to server
2. Install dependencies: npm install
3. Set environment variables:
   - NODE_ENV=production
   - DATABASE_URL=/path/to/wholesale.db
   - PORT=5000
   - CORS_ORIGIN=https://yourdomain.com

4. Start with PM2:
   npm install -g pm2
   pm2 start src/server.js --name wholesale-api
   pm2 save
   pm2 startup

5. Use Nginx as reverse proxy:
   location /api {
     proxy_pass http://localhost:5000;
     proxy_set_header Host $host;
     proxy_set_header X-Real-IP $remote_addr;
   }

### Frontend (Static Hosting on Vercel/Netlify):

1. Build production: npm run build
2. Output: dist/ folder
3. Deploy dist/ to Vercel/Netlify
4. Configure VITE environment for API URL

### Database (SQLite → Production):

For high traffic, consider:
- PostgreSQL hosted on AWS RDS
- Update db.js to use pg module instead of sqlite3

### Domain Setup:
- Point domain DNS to Netlify (frontend)
- Set up API subdomain (api.yourdomain.com) → VPS

### SSL/HTTPS:
- Use Let's Encrypt (certbot)
- Netlify/Vercel handle SSL automatically


## DATA SOURCES (To Connect Later)

1. **Market Data:**
   - Zillow API (paid)
   - Redfin API
   - CoreLogic
   
2. **Seller Leads:**
   - County records scraping
   - Pre-foreclosure APIs
   - Skip tracing services

3. **Buyer Database:**
   - Build from contacts
   - REI networks
   - Landlord databases

4. **Comps:**
   - MLS feeds (requires broker license)
   - Zillow/Redfin scraped data
   - County assessor records


## SCALE TO 10K USERS

1. Database:
   - Migrate to PostgreSQL
   - Add indexes on city, state, price
   - Implement caching (Redis)

2. API:
   - Add authentication (JWT)
   - Rate limiting per user
   - API versioning (/api/v1/)

3. Frontend:
   - Code splitting
   - Image optimization
   - Service worker (PWA)

4. Infrastructure:
   - Load balancing
   - CDN for assets
   - Monitoring (Sentry, DataDog)


## MONETIZATION OPTIONS

1. Freemium Model:
   - Free: 5 searches/day, basic calculator
   - Pro: $49/mo - unlimited searches, buyer network
   - Enterprise: $299/mo - API access, white-label

2. Commission Model:
   - Take % on deals matched through platform

3. Premium Data:
   - Sell access to aggregated market data

4. Training:
   - Wholesale education courses
   - Live market analysis webinars


## SUPPORT & MAINTENANCE

- Monitor error logs (Sentry)
- Weekly database backups
- Monthly feature releases
- Community forum (Discord)
- Email support tier


═══════════════════════════════════════════════════════════════════════════════

Questions? Check README.md or reach out to support.

Happy wholesaling! 🏠💰

═══════════════════════════════════════════════════════════════════════════════
`);
