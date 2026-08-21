import { EventEmitter } from 'node:events';
import { GenerationJob } from '../types';
import { projectStore } from './projectStore';
import { exponentialBackoffDelay } from './retryPolicy';

export class NonRetryableJobError extends Error {}

export interface JobContext {
  job: GenerationJob;
  update: (progress: number, message?: string) => void;
}

type JobHandler = (context: JobContext) => Promise<void>;

class PersistentJobQueue {
  private handlers = new Map<GenerationJob['type'], JobHandler>();
  private running = new Set<string>();
  private timer?: NodeJS.Timeout;
  readonly events = new EventEmitter();
  private readonly concurrency = (() => {
    const configured = Number(process.env.JOB_QUEUE_CONCURRENCY || 2);
    return Number.isFinite(configured) ? Math.max(1, Math.min(16, Math.floor(configured))) : 2;
  })();

  register(type: GenerationJob['type'], handler: JobHandler) {
    this.handlers.set(type, handler);
  }

  enqueue(input: {
    projectId: string;
    sceneId?: string;
    type: GenerationJob['type'];
    payload?: Record<string, unknown>;
    maxAttempts?: number;
  }) {
    const job: GenerationJob = {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      project_id: input.projectId,
      scene_id: input.sceneId,
      type: input.type,
      status: 'PENDING',
      progress: 0,
      attempt_count: 0,
      max_attempts: input.maxAttempts ?? 3,
      payload: input.payload,
      started_at: new Date().toISOString(),
    };
    projectStore.saveJob(job);
    this.emit(job);
    void this.tick();
    return job;
  }

  start() {
    if (this.timer) return;
    projectStore.recoverInterruptedJobs();
    this.timer = setInterval(() => void this.tick(), 750);
    this.timer.unref();
    console.log(`[job-queue] started concurrency=${this.concurrency}`);
    void this.tick();
  }

  private async tick() {
    const availableSlots = Math.max(0, this.concurrency - this.running.size);
    if (!availableSlots) return;
    const jobs = projectStore.getRunnableJobs().slice(0, availableSlots);
    await Promise.all(jobs.map((job) => this.run(job)));
  }

  private async run(job: GenerationJob) {
    if (this.running.has(job.id)) return;
    const handler = this.handlers.get(job.type);
    if (!handler) return;
    this.running.add(job.id);
    job.status = 'RUNNING';
    job.attempt_count += 1;
    job.error_message = undefined;
    job.next_attempt_at = undefined;
    projectStore.saveJob(job);
    this.emit(job);

    const update = (progress: number, message?: string) => {
      job.progress = Math.max(0, Math.min(100, progress));
      if (message) job.payload = { ...(job.payload || {}), status_message: message };
      projectStore.saveJob(job);
      this.emit(job);
    };

    try {
      await handler({ job, update });
      job.status = 'COMPLETED';
      job.progress = 100;
      job.completed_at = new Date().toISOString();
    } catch (error) {
      const message = (error as Error).message || 'Job failed';
      job.error_message = message;
      if (!(error instanceof NonRetryableJobError) && job.attempt_count < job.max_attempts) {
        job.status = 'PENDING';
        const delayMs = exponentialBackoffDelay(
          job.attempt_count,
          Number(process.env.JOB_RETRY_BASE_DELAY_MS || 1000),
          Number(process.env.JOB_RETRY_MAX_DELAY_MS || 30_000),
        );
        job.next_attempt_at = new Date(Date.now() + delayMs).toISOString();
      } else {
        job.status = 'FAILED';
        job.completed_at = new Date().toISOString();
      }
    } finally {
      projectStore.saveJob(job);
      this.emit(job);
      this.running.delete(job.id);
    }
  }

  private emit(job: GenerationJob) {
    this.events.emit('job', { ...job });
  }

  stats() {
    return { running: this.running.size, concurrency: this.concurrency };
  }
}

export const jobQueue = new PersistentJobQueue();
