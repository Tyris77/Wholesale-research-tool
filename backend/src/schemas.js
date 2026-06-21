import { z } from 'zod';

// Email is optional but, when present, must be valid. Empty string is allowed
// because HTML forms submit "" for untouched fields.
const optionalEmail = z.string().email().optional().or(z.literal(''));
const money = z.number().nonnegative();

export const sellerCreateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: optionalEmail,
  property_address: z.string().optional(),
  property_city: z.string().optional(),
  property_state: z.string().optional(),
  motivation: z.string().optional(),
});

export const sellerUpdateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: optionalEmail,
  status: z.string().min(1),
  motivation: z.string().optional(),
  next_follow_up: z.string().optional(),
});

export const buyerCreateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: optionalEmail,
  cash_available: money.optional(),
  deal_types: z.string().optional(),
  preferred_areas: z.string().optional(),
  avg_deal_size: money.optional(),
});

export const buyerUpdateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: optionalEmail,
  cash_available: money.optional(),
  deal_types: z.string().optional(),
  preferred_areas: z.string().optional(),
  status: z.string().min(1),
});

export const dealAnalysisSchema = z.object({
  purchasePrice: money,
  repairBudget: money,
  arv: money,
  sellingCosts: money,
  holdingCosts: money,
  wholesaleFee: money,
});

export const sellerScoreSchema = z.object({
  name: z.string().min(1),
  property_address: z.string().optional(),
  property_city: z.string().optional(),
  property_state: z.string().optional(),
  motivation: z.string().optional(),
  status: z.string().optional(),
});

export const dealCreateSchema = z.object({
  name: z.string().min(1),
  property_address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  purchase_price: money,
  repair_budget: money,
  arv: money,
  selling_costs: money,
  holding_costs: money,
  wholesale_fee: money,
  deal_type: z.enum(['wholesale', 'flip', 'buy_hold']).optional(),
  status: z.string().optional(),
});

export const dealUpdateSchema = dealCreateSchema;

export const logContactSchema = z.object({
  note: z.string().optional(),
  next_follow_up: z.string().optional(),
});

export const campaignCreateSchema = z.object({
  name: z.string().optional(),
  offsets_days: z.array(z.number().int().nonnegative()).min(1).max(10),
});

export const assistantSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1),
  })).min(1).max(50),
});

export const inquirySchema = z.object({
  name:    z.string().min(1).max(100),
  email:   z.string().email().optional(),
  phone:   z.string().min(7).max(20).optional(),
  message: z.string().max(500).optional(),
}).refine((d) => d.email || d.phone, { message: 'email or phone required' });
