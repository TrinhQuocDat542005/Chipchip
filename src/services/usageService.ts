import { projectStore } from './projectStore';
import { UsageRecord, UsageSummary } from '../types';

const PRICE: Record<string, number> = {
  'gemini:script': 0.01,
  'gemini:image': 0.04,
  'placeholder:image': 0,
  'local-motion:video-second': 0,
  'vieneu:character': 0,
  'ffmpeg:render-second': 0,
};

export function recordUsage(input: Omit<UsageRecord, 'id' | 'created_at' | 'estimated_cost_usd'> & { estimated_cost_usd?: number }) {
  const rate = PRICE[`${input.provider}:${input.operation}`] || 0;
  return projectStore.saveUsage({
    ...input,
    id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    estimated_cost_usd: input.estimated_cost_usd ?? input.units * rate,
    created_at: new Date().toISOString(),
  });
}

export function getUsageSummary(month = new Date().toISOString().slice(0, 7)): UsageSummary {
  const records = projectStore.getUsageRecords().filter(item => item.created_at.startsWith(month));
  const total = records.reduce((sum, item) => sum + item.estimated_cost_usd, 0);
  const budget = Number(projectStore.getSetting('monthly_budget_usd') || process.env.MONTHLY_BUDGET_USD || 20);
  const byProvider: Record<string, number> = {};
  for (const item of records) byProvider[item.provider] = (byProvider[item.provider] || 0) + item.estimated_cost_usd;
  return { month, total_cost_usd: total, monthly_budget_usd: budget, remaining_usd: Math.max(0, budget - total), percent_used: budget ? Math.min(100, total / budget * 100) : 0, by_provider: byProvider, records };
}

export function assertBudgetAvailable() {
  const summary = getUsageSummary();
  if (summary.total_cost_usd >= summary.monthly_budget_usd) throw new Error('Monthly AI budget has been reached');
}
