interface Job {
	key: unknown;
	run: () => Promise<void>;
	priority: number;
	started: boolean;
}

/** Small cancellable queue for speculative work; visible content bypasses it. */
export class PreloadQueue {
	private active = 0;
	private pending: Job[] = [];
	private jobs = new Map<unknown, Job>();

	constructor(
		private concurrency = 2,
		private capacity = 12
	) {}

	add(key: unknown, run: () => Promise<void>, priority = 0): () => void {
		const existing = this.jobs.get(key);
		if (existing) {
			existing.priority = Math.max(existing.priority, priority);
			this.pending.sort((a, b) => b.priority - a.priority);
			return () => this.cancel(existing);
		}
		const job: Job = { key, run, priority, started: false };
		this.jobs.set(key, job);
		this.pending.push(job);
		this.pending.sort((a, b) => b.priority - a.priority);
		if (this.pending.length > this.capacity) this.cancel(this.pending[this.pending.length - 1]);
		this.drain();
		return () => this.cancel(job);
	}

	private cancel(job: Job): void {
		if (job.started) return;
		this.pending = this.pending.filter((item) => item !== job);
		if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
	}

	private drain(): void {
		while (this.active < this.concurrency && this.pending.length) {
			const job = this.pending.shift()!;
			job.started = true;
			this.active++;
			Promise.resolve()
				.then(job.run)
				.catch(() => undefined)
				.finally(() => {
					this.active--;
					if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
					this.drain();
				});
		}
	}
}
