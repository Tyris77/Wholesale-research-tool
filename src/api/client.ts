import type {
  Market, Comp, Seller, NewSeller, Buyer, NewBuyer,
  DealInputs, DealAnalysisResult, SellerScoreInput, SellerScoreResult,
  MarketTrend, Neighborhood, GeocodeResult, Health,
  DealInputFields, Deal, ArvEstimate, DealMatches, Insights,
  Activity, OutreachResult,
} from './types';

const DEFAULT_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5000';

export class ApiError extends Error {
  status: number;
  details?: Array<{ path: string; message: string }>;
  constructor(message: string, status: number, details?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

// Low-level fetch wrapper. fetchImpl/baseUrl are injectable for testing.
export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<T> {
  const res = await fetchImpl(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data && data.details);
  }
  return data as T;
}

const jsonBody = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const getHealth = () => apiFetch<Health>('/api/health');
export const getMarkets = () => apiFetch<Market[]>('/api/markets');

export const getComps = (city?: string, state?: string) => {
  const params = new URLSearchParams();
  if (city) params.append('city', city);
  if (state) params.append('state', state);
  const qs = params.toString();
  return apiFetch<Comp[]>(`/api/comps${qs ? `?${qs}` : ''}`);
};

export const getSellers = () => apiFetch<Seller[]>('/api/sellers');
export const createSeller = (body: NewSeller) => apiFetch<Seller>('/api/sellers', jsonBody(body));
export const updateSeller = (id: string, body: Partial<Seller>) =>
  apiFetch<{ success: boolean }>(`/api/sellers/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const getBuyers = () => apiFetch<Buyer[]>('/api/buyers');
export const createBuyer = (body: NewBuyer) => apiFetch<Buyer>('/api/buyers', jsonBody(body));

export const analyzeDeal = (body: DealInputs) => apiFetch<DealAnalysisResult>('/api/analyze-deal', jsonBody(body));
export const scoreSeller = (body: SellerScoreInput) => apiFetch<SellerScoreResult>('/api/score-seller', jsonBody(body));

export const getMarketTrends = (metro: string) => apiFetch<MarketTrend>(`/api/market-trends/${encodeURIComponent(metro)}`);
export const getNeighborhood = (zip: string) => apiFetch<Neighborhood>(`/api/neighborhood/${encodeURIComponent(zip)}`);
export const geocode = (address: string, city: string, state: string) => {
  const params = new URLSearchParams({ address, city, state });
  return apiFetch<GeocodeResult>(`/api/geocode?${params.toString()}`);
};

export const getDeals = () => apiFetch<Deal[]>('/api/deals');
export const getDeal = (id: string) => apiFetch<Deal>(`/api/deals/${id}`);
export const createDeal = (body: DealInputFields) => apiFetch<Deal>('/api/deals', jsonBody(body));
export const updateDeal = (id: string, body: DealInputFields) =>
  apiFetch<{ success: boolean; profit: number; roi: number }>(`/api/deals/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const deleteDeal = (id: string) => apiFetch<{ success: boolean }>(`/api/deals/${id}`, { method: 'DELETE' });

export const estimateArv = (city: string, state: string, sqft: number) => {
  const params = new URLSearchParams();
  if (city) params.append('city', city);
  if (state) params.append('state', state);
  params.append('sqft', String(sqft));
  return apiFetch<ArvEstimate>(`/api/arv?${params.toString()}`);
};

export const getDealMatches = (id: string) => apiFetch<DealMatches>(`/api/deals/${id}/matches`);

export const getInsights = () => apiFetch<Insights>('/api/insights');

export const emailMatchedBuyers = (dealId: string) =>
  apiFetch<OutreachResult>(`/api/deals/${dealId}/email-buyers`, { method: 'POST' });
export const getDealActivities = (dealId: string) => apiFetch<Activity[]>(`/api/deals/${dealId}/activities`);
export const getActivities = () => apiFetch<Activity[]>('/api/activities');
export const getFollowUps = () => apiFetch<Seller[]>('/api/follow-ups');
export const logContact = (sellerId: string, body: { note?: string; next_follow_up?: string }) =>
  apiFetch<{ success: boolean }>(`/api/sellers/${sellerId}/log-contact`, jsonBody(body));
