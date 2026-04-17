import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import type { AppContext } from "../../types/index.js";
import type { JobDispatcher, JobName } from "./types.js";

type JobHandler = (payload: unknown) => Promise<void>;

export class InlineJobDispatcher implements JobDispatcher {
  constructor(public handlers: Partial<Record<JobName, JobHandler>>) {}

  async enqueue<TPayload>(name: JobName, payload: TPayload) {
    const handler = this.handlers[name];
    if (!handler) {
      throw new Error(`No inline handler registered for job ${name}`);
    }

    await handler(payload);
  }
}

export class BullMqDispatcher implements JobDispatcher {
  private readonly queue: any;

  constructor(redisUrl: string, queueName: string) {
    this.queue = new Queue(queueName, {
      connection: new (Redis as any)(redisUrl, { maxRetriesPerRequest: null })
    });
  }

  async enqueue<TPayload>(name: JobName, payload: TPayload, idempotencyKey: string) {
    await this.queue.add(name, payload, {
      jobId: idempotencyKey,
      removeOnComplete: 100,
      removeOnFail: 100
    });
  }
}

export function registerWorker(
  context: AppContext,
  queueName: string,
  handlers: Partial<Record<JobName, JobHandler>>
) {
  if (context.env.QUEUE_MODE !== "bullmq") {
    return null;
  }

  const connection = new (Redis as any)(context.env.REDIS_URL, {
    maxRetriesPerRequest: null
  });

  return new Worker(
    queueName,
    async (job: { name: string; data: unknown }) => {
      const handler = handlers[job.name as JobName];
      if (!handler) {
        throw new Error(`No worker handler registered for ${job.name}`);
      }

      await handler(job.data);
    },
    { connection }
  );
}
