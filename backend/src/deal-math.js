// Mirror of the frontend src/lib/deal.ts formula, using snake_case DB column names.
export function computeDeal({ purchase_price, repair_budget, arv, selling_costs, holding_costs, wholesale_fee }) {
  const totalInvestment = purchase_price + repair_budget + holding_costs + selling_costs;
  const exitNet = arv - selling_costs - wholesale_fee;
  const profit = exitNet - totalInvestment;
  const roi = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0;
  return { profit, roi: Math.round(roi * 100) / 100 };
}
