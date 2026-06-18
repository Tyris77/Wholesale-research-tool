// FRED API - Federal Reserve Economic Data (FHFA All-Transactions House Price Index)
const FRED_SERIES_BY_METRO = {
  Atlanta: 'ATNHPIUS12060Q',
  Phoenix: 'ATNHPIUS38060Q',
  Dallas: 'ATNHPIUS19100Q',
  Denver: 'ATNHPIUS19740Q',
  Tampa: 'ATNHPIUS45300Q',
  Charlotte: 'ATNHPIUS16740Q',
  Austin: 'ATNHPIUS12420Q',
  Nashville: 'ATNHPIUS34980Q',
};
const FRED_NATIONAL_SERIES = 'USSTHPI';

export async function getMarketTrends(metroArea = 'Atlanta', { apiKey = process.env.FRED_API_KEY, fetchFn = fetch } = {}) {
  try {
    if (!apiKey) return { success: false, error: 'FRED API key not configured' };

    const seriesId = FRED_SERIES_BY_METRO[metroArea] || FRED_NATIONAL_SERIES;
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}`
      + `&units=pch&frequency=q&sort_order=desc&limit=12&api_key=${apiKey}&file_type=json`;

    const response = await fetchFn(url);
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
    return { success: false, error: error.message };
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

// Nominatim (OpenStreetMap) - Free Geocoding (requires a User-Agent per usage policy)
export async function geocodeAddress(address, { fetchFn = fetch } = {}) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const response = await fetchFn(url, {
      headers: { 'User-Agent': 'WholesaleResearchTool/1.0 (https://github.com/local/wholesale-research-tool)' },
    });
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

// RentCast API - property value estimate + comparable sales
export async function getLiveComps(address, city, state, { apiKey = process.env.RENTCAST_API_KEY, fetchFn = fetch } = {}) {
  try {
    if (!apiKey) return { success: false, error: 'RENTCAST_API_KEY not configured' };

    const fullAddress = `${address}, ${city}, ${state}`;
    const url = `https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(fullAddress)}`;

    const response = await fetchFn(url, {
      headers: { 'X-Api-Key': apiKey, accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`RentCast error: ${response.status}`);

    const data = await response.json();
    const comps = data.comparables || [];
    return {
      success: true,
      estimatedValue: data.price ?? null,
      valueRange: { low: data.priceRangeLow ?? null, high: data.priceRangeHigh ?? null },
      comps,
      count: comps.length,
    };
  } catch (error) {
    console.error('RentCast API error:', error.message);
    return { success: false, error: error.message };
  }
}
