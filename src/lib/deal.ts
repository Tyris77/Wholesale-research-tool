export interface DealInputs {
  purchasePrice: number;
  repairBudget: number;
  arv: number;
  sellingCosts: number;
  holdingCosts: number;
  wholesaleFee: number;
}

export interface DealResult {
  totalInvestment: number;
  exitNet: number;
  profit: number;
  roi: number;
}

export function calculateWholesaleDeal(inputs: DealInputs): DealResult {
  const { purchasePrice, repairBudget, arv, sellingCosts, holdingCosts, wholesaleFee } = inputs;
  const totalInvestment = purchasePrice + repairBudget + holdingCosts + sellingCosts;
  const exitNet = arv - sellingCosts - wholesaleFee;
  const profit = exitNet - totalInvestment;
  const roi = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0;
  return { totalInvestment, exitNet, profit, roi };
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}
