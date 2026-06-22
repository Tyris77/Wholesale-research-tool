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
  next_follow_up?: string;
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
  integrations: { groq: boolean; fred: boolean; census: boolean; rentcast: boolean; resend: boolean };
}

export interface Activity {
  id: string;
  deal_id: string | null;
  contact_type: string;
  contact_id: string;
  contact_name: string;
  channel: string;
  subject: string;
  status: string;
  detail: string;
  created_at: string;
}

export interface OutreachResult {
  success: boolean;
  sent?: number;
  failed?: number;
  skipped?: number;
  results?: { buyer_id: string; name: string; status: string; error?: string }[];
  error?: string;
}

export interface CampaignStep {
  id: string;
  campaign_id: string;
  step_no: number;
  run_at: string;
  status: string;
}

export interface Campaign {
  id: string;
  deal_id: string;
  name: string;
  status: string;
  created_at: string;
  steps: CampaignStep[];
}

export interface CampaignStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantReply {
  success: boolean;
  reply?: string;
  error?: string;
}

export interface DealInputFields {
  name: string;
  property_address?: string;
  city?: string;
  state?: string;
  purchase_price: number;
  repair_budget: number;
  arv: number;
  selling_costs: number;
  holding_costs: number;
  wholesale_fee: number;
  deal_type?: string;
  status?: string;
}

export interface Deal extends DealInputFields {
  id: string;
  profit: number;
  roi: number;
  created_at: string;
  updated_at: string;
}

export interface ArvEstimate {
  success: boolean;
  estimatedArv?: number;
  medianPricePerSqft?: number;
  compCount?: number;
  error?: string;
}

export interface BuyerMatch {
  buyer: Buyer;
  score: number;
  reasons: string[];
}

export interface InsightDeal {
  id: string;
  name: string;
  profit: number;
  roi: number;
  status: string;
}

export interface InsightMarket {
  id: string;
  city: string;
  state: string;
  heat_score: number;
  trend: string;
}

export interface Insights {
  deals: {
    total: number;
    active: number;
    byStatus: Record<string, number>;
    pipelineValue: number;
    projectedProfit: number;
    avgRoi: number;
    matchedCount: number;
    profitByMonth: { month: string; profit: number; count: number }[];
    topByProfit: InsightDeal[];
  };
  leads: {
    sellers: number;
    buyers: number;
    sellersByStatus: Record<string, number>;
  };
  markets: { top: InsightMarket[] };
}

export interface DealMatches {
  success: boolean;
  matches: BuyerMatch[];
}

export interface PublicDeal {
  name: string;
  city: string;
  state: string;
  deal_type: string;
  purchase_price: number;
  arv: number;
  profit: number;
  roi: number;
}

export interface InquiryBody {
  name: string;
  email?: string;
  phone?: string;
  message?: string;
}

export interface DealLinkResult {
  slug: string;
  url: string;
}

export interface PropertyLead {
  parcel_id: string;
  address: string;
  ward: string | null;
  owner_name: string | null;
  owner_address: string | null;
  assessed_value: number | null;
  score: number;
  signals: string; // JSON array string
  status: 'new' | 'promoted' | 'dismissed';
  promoted_seller_id: string | null;
  phone: string | null;
  email: string | null;
  skip_traced_at: string | null;
  last_scanned_at: string;
  created_at: string;
  signal_details?: Array<{
    id: string;
    signal_type: string;
    signal_value: string | null;
    points_awarded: number;
  }>;
}

export interface CashBuyer {
  id: string;
  name: string;
  mailing_address: string | null;
  buyer_state: string | null;
  purchase_count: number;
  total_spend: number;
  avg_price: number;
  zips: string; // JSON array string of property ZIP codes
  last_purchase_date: string | null;
  saved: number; // 0 | 1
  last_seen_at: string;
  created_at: string;
}
