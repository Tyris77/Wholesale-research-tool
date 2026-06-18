# Free APIs Setup Guide

## 🚀 Get Your Free API Keys (30 Minutes)

All of these APIs have **generous free tiers** or are completely free. No credit card required for most.

---

## 1️⃣ Groq API (AI Deal Analysis) ⭐ RECOMMENDED

**Why:** Fastest free AI (500+ tokens/sec), 14,400 requests/day free

**Setup:**
1. Go to: https://console.groq.com
2. Click "Sign Up" (free)
3. Verify email
4. Go to "API Keys" section
5. Click "Create API Key"
6. Copy the key
7. Paste in `backend/.env`:
   ```
   GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
   ```

**Usage:** Instant AI analysis of deals and seller leads

**Free tier:** 14,400 requests/day (enough for 1,000s of analyses)

---

## 2️⃣ FRED API (Federal Reserve Market Data) ⭐ RECOMMENDED

**Why:** Unlimited free, official government housing data

**Setup:**
1. Go to: https://fred.stlouisfed.org
2. Click "Register" (top right)
3. Fill in email + password
4. Verify email
5. Go to "Account" → "API Keys"
6. Request an API key (instant)
7. Copy the key
8. Paste in `backend/.env`:
   ```
   FRED_API_KEY=abcdef1234567890abcdef1234567890
   ```

**Usage:** Market trends, home price index, economic indicators

**Free tier:** Unlimited

---

## 3️⃣ Census Bureau API (Demographics) ⭐ RECOMMENDED

**Why:** Unlimited free, official US census data

**Setup:**
1. Go to: https://api.census.gov/data/key_signup.html
2. Enter your email
3. Click "Sign Up"
4. Check email for API key
5. Copy it
6. Paste in `backend/.env`:
   ```
   CENSUS_API_KEY=census_api_key_here
   ```

**Usage:** Population, income, poverty by ZIP code

**Free tier:** Unlimited

---

## 4️⃣ Google Maps API (Property Location Maps)

**Why:** $200/month free credit, maps and location services

**Setup:**
1. Go to: https://console.cloud.google.com
2. Create a new project
3. Enable "Maps JavaScript API"
4. Enable "Geocoding API"
5. Go to "Credentials" → "Create Credential" → "API Key"
6. Copy the key
7. Paste in `backend/.env`:
   ```
   GOOGLE_MAPS_API_KEY=AIzaSyD_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

**Usage:** Property location maps, address verification

**Free tier:** $200/month credit (covers millions of requests)

---

## 5️⃣ RealtyMole API (Live Comps)

**Why:** Live property data with free tier

**Setup:**
1. Go to: https://www.realtymole.com
2. Sign up for free account
3. Go to "API" section
4. Create API key
5. Paste in `backend/.env`:
   ```
   REALTYMOLE_API_KEY=your_api_key_here
   ```

**Usage:** Live comparable sales, property details

**Free tier:** Limited (check site for current limits)

---

## 6️⃣ OpenAI API (Backup AI - Optional)

**Why:** Excellent AI but paid after free credit

**Setup:**
1. Go to: https://platform.openai.com
2. Sign up
3. Go to "API Keys"
4. Click "Create new secret key"
5. Copy it
6. Paste in `backend/.env`:
   ```
   OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

**Usage:** Backup AI analysis (if Groq is down)

**Free tier:** $5 credit (expires 3 months after signup)

---

## 🔧 Setting Up Your .env File

**Location:** `C:\Users\tyris\Desktop\wholesale-research-tool\backend\.env`

**Step by step:**

1. Open the `.env` file (already exists)
2. Fill in your API keys:

```env
# Your actual API keys go here:
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
FRED_API_KEY=abcdef1234567890
CENSUS_API_KEY=your_census_key_here
GOOGLE_MAPS_API_KEY=AIzaSyD_xxxxxxx
REALTYMOLE_API_KEY=your_realtymole_key
OPENAI_API_KEY=sk-proj-xxxxxx (optional)

# Don't change these:
NODE_ENV=development
PORT=5000
CORS_ORIGIN=http://localhost:4173
DATABASE_URL=./wholesale.db
```

3. Save the file
4. Restart the backend server

---

## ✅ Verify Setup Works

1. Start backend: `cd backend && npm start`
2. Open http://localhost:4173
3. Go to "AI Analyzer" tab
4. Click "Analyze Deal with AI"
5. If it works, your Groq API key is valid! ✓

---

## 🎯 Estimated Costs (Monthly)

| API | Free Tier | After Free |
|-----|-----------|-----------|
| Groq | 14,400 req/day | $0.50 per million tokens |
| FRED | Unlimited | Free forever |
| Census | Unlimited | Free forever |
| Google Maps | $200 credit | $0.50-7.00 per 1000 requests |
| RealtyMole | Limited | $29-99/month |
| OpenAI | $5 credit | $0.50-15 per 1M tokens |

**Total monthly cost at scale:** $0-100 (mostly optional APIs)

---

## 🆘 Troubleshooting

**"API key not configured" error?**
- Make sure API key is in `backend/.env`
- Restart backend after saving `.env`
- Check for typos

**"API returned error"?**
- Free tier might be exceeded (check API dashboard)
- Try a different metro/zipcode
- Some APIs require verification emails

**"GROQ_API_KEY is undefined"?**
- You haven't added it to `.env` yet
- Go get the key from console.groq.com
- Paste it in `.env`
- Restart backend

---

## 🚀 Features After Setup

| Feature | API | Status |
|---------|-----|--------|
| AI deal analysis | Groq | ✅ Real-time |
| Seller lead scoring | Groq | ✅ Real-time |
| Market trends | FRED | ✅ Quarterly data |
| Neighborhood demographics | Census | ✅ By ZIP code |
| Geocoding | OpenStreetMap | ✅ Free/unlimited |
| Live comps | RealtyMole | ✅ Real listings |
| Property maps | Google Maps | ✅ Interactive maps |

---

## 📝 Quick Reference

**Free APIs (No Cost):**
- FRED (market data)
- Census (demographics)
- OpenStreetMap (geocoding)

**Paid with Free Tier:**
- Groq: 14,400 free/day
- Google Maps: $200/month credit
- RealtyMole: Limited free tier
- OpenAI: $5 one-time credit

---

## Next Steps

1. ✅ Get Groq API key → AI deal analysis works
2. ✅ Get FRED API key → Market trends work
3. ✅ Get Census API key → Demographics work
4. ✅ Add to `.env` file
5. ✅ Restart backend
6. ✅ Test each feature

**Estimated time:** 20-30 minutes for all APIs

---

## Still Need Help?

Each API has:
- Detailed documentation at their site
- 24/7 customer support
- Free tier with generous limits
- Quick approval (usually instant)

**You're doing great!** In 30 minutes you'll have a professional-grade real estate research platform with live data and AI. 🎉
