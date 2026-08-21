import { AutomationRule } from '../types';
import { projectStore } from './projectStore';

function nextOccurrence(rule: AutomationRule, from = new Date()) {
  const [hour, minute] = (rule.run_at || '09:00').split(':').map(Number);
  const candidate = new Date(from); candidate.setHours(hour || 0, minute || 0, 0, 0);
  const interval = rule.frequency === 'Daily' ? 1 : rule.frequency === 'Twice Weekly' ? 3 : 7;
  if (candidate <= from) candidate.setDate(candidate.getDate() + interval);
  return candidate.toISOString();
}

class AutomationScheduler {
  private timer?: NodeJS.Timeout;
  constructor(private readonly run: (rule: AutomationRule) => void) {}
  start() {
    for (const rule of projectStore.getAllAutomations()) {
      if (!rule.next_run) { rule.next_run = nextOccurrence(rule); projectStore.saveAutomation(rule); }
    }
    this.timer = setInterval(() => this.tick(), 15_000); this.timer.unref(); this.tick();
  }
  stop() { if (this.timer) clearInterval(this.timer); }
  schedule(rule: AutomationRule) { rule.next_run = nextOccurrence(rule); return projectStore.saveAutomation(rule); }
  runNow(rule: AutomationRule) {
    // Advance the schedule before dispatching. A synchronous failure must not
    // leave next_run in the past and retrigger the same rule every 15 seconds.
    rule.last_run = new Date().toISOString();
    rule.next_run = nextOccurrence(rule);
    try {
      this.run(rule);
      rule.last_error = undefined;
    } catch (error) {
      rule.last_error = (error as Error).message;
    } finally {
      projectStore.saveAutomation(rule);
    }
  }
  private tick() {
    const now = new Date().toISOString();
    for (const rule of projectStore.getAllAutomations()) if (rule.status === 'Active' && rule.next_run && rule.next_run <= now) this.runNow(rule);
  }
}

export { AutomationScheduler, nextOccurrence };
