import type {
  MoneyRange,
  PopulationUnit,
  SpendMethod,
} from '../../lib/market-value';
export interface SpendInput {
  populationUnit: PopulationUnit;
  spendUnit: PopulationUnit;
  direct?: { amount: number; period: 'monthly' | 'weekly' | 'annual' };
  observations?: {
    weight: number;
    amount: number;
    period: 'monthly' | 'weekly' | 'annual';
  }[];
  frequencyTicket?: {
    frequency: MoneyRange;
    ticket: MoneyRange;
    frequencyPeriod: 'monthly' | 'weekly' | 'annual';
  };
  baseline?: MoneyRange;
  intensity?: number;
  heuristic?: MoneyRange;
}
export const annualFactor = (period: 'monthly' | 'weekly' | 'annual') =>
  period === 'monthly' ? 12 : period === 'weekly' ? 52 : 1;
function validateRange(r: MoneyRange) {
  if (
    ![r.low, r.base, r.high].every((n) => Number.isFinite(n) && n >= 0) ||
    r.low > r.base ||
    r.base > r.high
  )
    throw Error('Invalid spend range');
  return r;
}
export function selectSpendMethod(
  input: SpendInput,
): { method: SpendMethod; spend: MoneyRange } | null {
  if (input.populationUnit !== input.spendUnit)
    throw Error('Population/spend unit mismatch');
  if (input.direct) {
    const n = input.direct.amount * annualFactor(input.direct.period);
    return {
      method: 'direct_spend',
      spend: validateRange({ low: n, base: n, high: n }),
    };
  }
  if (input.observations?.length) {
    if (
      input.observations.some(
        (o) =>
          !Number.isFinite(o.weight) ||
          o.weight < 0 ||
          !Number.isFinite(o.amount) ||
          o.amount < 0,
      )
    )
      throw Error('Invalid weighted spend');
    const w = input.observations.reduce((n, o) => n + o.weight, 0);
    if (!w) return null;
    const n =
      input.observations.reduce(
        (n, o) => n + o.weight * o.amount * annualFactor(o.period),
        0,
      ) / w;
    return { method: 'weighted_spend', spend: { low: n, base: n, high: n } };
  }
  if (input.frequencyTicket) {
    const f = input.frequencyTicket;
    validateRange(f.frequency);
    validateRange(f.ticket);
    const a = annualFactor(f.frequencyPeriod);
    return {
      method: 'frequency_ticket',
      spend: validateRange({
        low: f.frequency.low * f.ticket.low * a,
        base: f.frequency.base * f.ticket.base * a,
        high: f.frequency.high * f.ticket.high * a,
      }),
    };
  }
  if (input.baseline) {
    validateRange(input.baseline);
    const m = input.intensity ?? 1;
    if (!Number.isFinite(m) || m < 0) throw Error('Invalid spend intensity');
    return {
      method:
        input.intensity === undefined
          ? 'calibrated_baseline'
          : 'consumption_proxy',
      spend: validateRange({
        low: input.baseline.low * m,
        base: input.baseline.base * m,
        high: input.baseline.high * m,
      }),
    };
  }
  if (input.heuristic)
    return { method: 'heuristic_range', spend: validateRange(input.heuristic) };
  return null;
}
export function annualPool(population: number, spend: MoneyRange) {
  if (!Number.isFinite(population) || population < 0)
    throw Error('Invalid population');
  validateRange(spend);
  return {
    low: population * spend.low,
    base: population * spend.base,
    high: population * spend.high,
  };
}
