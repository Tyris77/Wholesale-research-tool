// FRED API - Federal Reserve Economic Data
export async function getMarketTrends(metroArea = 'Atlanta') {
  try {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) return { error: 'FRED API key not configured' };

    // Series IDs for different metros
    const seriesMap = {
      'Atlanta': 'ATNHPI', // Atlanta Home Price Index
      'Phoenix': 'PHXHPI',
      'Dallas': 'DALSXR', // Dallas sales
      'Denver': 'DENHPI',
      'Tampa': 'BPSMNRNSA', // National (fallback)
    };

    const seriesId = seriesMap[metroArea] || 'MMNRNSA'; // National median home price

    const response = await fetch(
      `https://api.stlouisfed.org/fred/series/data?series_id=${seriesId}&units=pch&frequency=q&api_key=${apiKey}&file_type=json&limit=12`
    );

    if (!response.ok) throw new Error(`FRED API error: ${response.status}`);

    const data = await response.json();

    return {
      success: true,
      metro: metroArea,
      series_id: seriesId,
      observations: data.observations || [],
      last_update: data.observations?.[0]?.date || 'N/A',
    };
  } catch (error) {
    console.error('FRED API error:', error.message);
    return { error: error.message };
  }
}

// Census Bureau API - Demographics & Neighborhood Data
export async function getNeighborhoodDemographics(zipCode) {
  try {
    const apiKey = process.env.CENSUS_API_KEY;
    if (!apiKey) return { error: 'Census API key not configured' };

    const response = await fetch(
      `https://api.census.gov/data/2021/acs/acs5?get=NAME,B01003_001E,B19013_001E,B17001_002E&for=zip%20code%20tabulation%20area:${zipCode}&key=${apiKey}`
    );

    if (!response.ok) throw new Error(`Census API error: ${response.status}`);

    const data = await response.json();

    if (data.length > 1) {
      return {
        success: true,
        zipCode,
        population: data[1][2] || 'N/A',
        medianIncome: data[1][3] || 'N/A',
        povertyRate: data[1][4] || 'N/A',
      };
    }

    return { error: 'No data found for this zip code' };
  } catch (error) {
    console.error('Census API error:', error.message);
    return { error: error.message };
  }
}

// Nominatim (OpenStreetMap) - Free Geocoding
export async function geocodeAddress(address) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`
    );

    if (!response.ok) throw new Error(`Geocoding error: ${response.status}`);

    const data = await response.json();

    if (data.length > 0) {
      const result = data[0];
      return {
        success: true,
        address: result.display_name,
        latitude: result.lat,
        longitude: result.lon,
        boundingBox: result.boundingbox,
      };
    }

    return { error: 'Address not found' };
  } catch (error) {
    console.error('Geocoding error:', error.message);
    return { error: error.message };
  }
}

// RealtyMole API - Live Comps (requires API key)
export async function getLiveComps(address, city, state) {
  try {
    const apiKey = process.env.REALTYMOLE_API_KEY;
    if (!apiKey) return { error: 'RealtyMole API key not configured' };

    // Search for properties
    const searchResponse = await fetch('https://api.realtymole.com/api/v1/properties', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        address,
        city,
        state,
        includeForeclosures: true,
        includeSoldListings: true,
      }),
    });

    if (!searchResponse.ok) throw new Error(`RealtyMole error: ${searchResponse.status}`);

    const comps = await searchResponse.json();

    return {
      success: true,
      comps: comps.properties || [],
      count: comps.properties?.length || 0,
    };
  } catch (error) {
    console.error('RealtyMole API error:', error.message);
    return { error: error.message };
  }
}
