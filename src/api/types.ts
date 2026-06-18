export interface Market {
  id: string;
  city: string;
  state: string;
  heat_score: number;
  trend: string;
  avg_rent: number;
  avg_home_price: number;
  days_on_market: number;
  inventory_level: string;
}

export interface Comp {
  id: string;
  address: string;
  city: string;
  state: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  sold_date: string;
  price_per_sqft: number;
  days_on_market: number;
}

export interface Seller {
  id: string;
  name: string;
  phone: string;
  email: string;
  property_address: string;
  property_city: string;
  property_state: string;
  motivation: string;
  status: string;
  created_at: string;
  last_contacted?: string;
}

export type NewSeller = Omit<Seller, 'id' | 'status' | 'created_at' | 'last_contacted'>;

export interface Buyer {
  id: string;
  name: string;
  phone: string;
  email: string;
  cash_available: number;
  deal_types: string;
  preferred_areas: string;
  avg_deal_size: number;
  status: string;
  created_at: string;
}

export type NewBuyer = Omit<Buyer, 'id' | 'status' | 'created_at'>;

export interface DealInputs {
  purchasePrice: number;
  repairBudget: number;
  arv: number;
  sellingCosts: number;
  holdingCosts: number;
  wholesaleFee: number;
}

export interface DealAnalysisResult {
  success: boolean;
  analysis?: string;
  model?: string;
  error?: string;
}

export interface SellerScoreInput {
  name: string;
  property_address?: string;
  property_city?: string;
  property_state?: string;
  motivation?: string;
  status?: string;
}

export interface SellerScoreResult {
  success: boolean;
  scoring?: string;
  error?: string;
}

export interface MarketTrend {
  success?: boolean;
  metro?: string;
  series_id?: string;
  observations?: Array<{ date: string; value: string }>;
  last_update?: string;
  error?: string;
}

export interface Neighborhood {
  success?: boolean;
  zipCode?: string;
  population?: number;
  medianIncome?: number;
  povertyRate?: number;
  error?: string;
}

export interface GeocodeResult {
  success?: boolean;
  address?: string;
  latitude?: string;
  longitude?: string;
  error?: string;
}

export interface Health {
  status: string;
  integrations: { groq: boolean; fred: boolean; census: boolean; rentcast: boolean };
}
