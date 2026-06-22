import type {
  Market, Comp, Seller, NewSeller, Buyer, NewBuyer,
  DealInputs, DealAnalysisResult, SellerScoreInput, SellerScoreResult,
  MarketTrend, Neighborhood, GeocodeResult, Health,
  DealInputFields, Deal, ArvEstimate, DealMatches, Insights,
  Activity, OutreachResult, Campaign, CampaignStats, AssistantMessage, AssistantReply,
  PublicDeal, InquiryBody, DealLinkResult, PropertyLead, CashBuyer,
} from './types';

const DEFAULT_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

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

export const createCampaign = (dealId: string, body: { name?: string; offsets_days: number[] }) =>
  apiFetch<Campaign>(`/api/deals/${dealId}/campaigns`, jsonBody(body));
export const getCampaigns = () => apiFetch<Campaign[]>('/api/campaigns');
export const getDealCampaigns = (dealId: string) => apiFetch<Campaign[]>(`/api/deals/${dealId}/campaigns`);
export const pauseCampaign = (id: string) => apiFetch<{ success: boolean }>(`/api/campaigns/${id}/pause`, { method: 'POST' });
export const resumeCampaign = (id: string) => apiFetch<{ success: boolean }>(`/api/campaigns/${id}/resume`, { method: 'POST' });
export const cancelCampaign = (id: string) => apiFetch<{ success: boolean }>(`/api/campaigns/${id}/cancel`, { method: 'POST' });
export const runScheduler = () =>
  apiFetch<{ success: boolean; stepsProcessed: number; digestSent: boolean }>('/api/scheduler/run', { method: 'POST' });
export const getCampaignStats = (id: string) => apiFetch<CampaignStats>(`/api/campaigns/${id}/stats`);

export const askAssistant = (messages: AssistantMessage[]) =>
  apiFetch<AssistantReply>('/api/assistant', jsonBody({ messages }));

export const createDealLink = (id: string) =>
  apiFetch<DealLinkResult>(`/api/deals/${id}/link`, { method: 'POST' });

export const revokeDealLink = (id: string) =>
  apiFetch<{ success: boolean }>(`/api/deals/${id}/link`, { method: 'DELETE' });

export const getDealLink = (id: string) =>
  apiFetch<{ slug: string } | null>(`/api/deals/${id}/link`);

export const getPublicDeal = (slug: string) =>
  apiFetch<PublicDeal>(`/api/public/deals/${slug}`);

export const submitInquiry = (slug: string, body: InquiryBody) =>
  apiFetch<{ success: boolean }>(`/api/public/deals/${slug}/inquire`, jsonBody(body));

export async function getPropertyLeads(
  filters: { ward?: string; minScore?: number; status?: string } = {},
): Promise<PropertyLead[]> {
  const params = new URLSearchParams();
  if (filters.ward) params.set('ward', filters.ward);
  if (filters.minScore !== undefined) params.set('minScore', String(filters.minScore));
  if (filters.status) params.set('status', filters.status);
  const qs = params.toString();
  return apiFetch<PropertyLead[]>(`/api/property-leads${qs ? `?${qs}` : ''}`);
}

export async function getPropertyLead(parcelId: string): Promise<PropertyLead> {
  return apiFetch<PropertyLead>(`/api/property-leads/${encodeURIComponent(parcelId)}`);
}

export async function promotePropertyLead(
  parcelId: string,
): Promise<{ success: boolean; sellerId: string }> {
  return apiFetch(`/api/property-leads/${encodeURIComponent(parcelId)}/promote`, { method: 'POST' });
}

export async function dismissPropertyLead(
  parcelId: string,
): Promise<{ success: boolean }> {
  return apiFetch(`/api/property-leads/${encodeURIComponent(parcelId)}/dismiss`, { method: 'POST' });
}

export async function runPropertyIntelScan(): Promise<{ success: boolean; message: string }> {
  return apiFetch('/api/property-intel/run', { method: 'POST' });
}

export async function getCashBuyers(
  filters: { minPurchases?: number; saved?: boolean } = {},
): Promise<CashBuyer[]> {
  const params = new URLSearchParams();
  if (filters.minPurchases !== undefined) params.set('minPurchases', String(filters.minPurchases));
  if (filters.saved) params.set('saved', 'true');
  const qs = params.toString();
  return apiFetch<CashBuyer[]>(`/api/cash-buyers${qs ? `?${qs}` : ''}`);
}

export async function findCashBuyers(): Promise<{ success: boolean; message: string }> {
  return apiFetch('/api/cash-buyers/find', { method: 'POST' });
}

export async function saveCashBuyer(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/cash-buyers/${encodeURIComponent(id)}/save`, { method: 'POST' });
}
