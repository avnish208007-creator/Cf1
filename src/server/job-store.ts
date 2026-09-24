import { Job } from '../types';

class ServerJobStore {
  private jobs: Map<string, Job> = new Map();

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  set(job: Job): void {
    this.jobs.set(job.id, job);
  }

  update(id: string, updates: Partial<Job>): Job {
    const existing = this.jobs.get(id);
    if (!existing) {
      throw new Error(`Job ${id} not found in server store.`);
    }
    const updated: Job = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(id, updated);
    return updated;
  }

  list(): Job[] {
    return Array.from(this.jobs.values());
  }
}

export const serverJobStore = new ServerJobStore();
