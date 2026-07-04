import type { CapturedMessage } from '../shared/contracts';

export class MessageStore {
  private readonly messages: CapturedMessage[] = [];
  private readonly byTopic = new Map<string, CapturedMessage[]>();
  private paused = false;
  evictedCount = 0;
  ignoredWhilePausedCount = 0;

  constructor(private readonly capacity = 10_000) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('Message store capacity must be a positive integer.');
    }
  }

  add(message: CapturedMessage): boolean {
    if (this.paused) {
      this.ignoredWhilePausedCount += 1;
      return false;
    }

    this.messages.push(message);
    const topicMessages = this.byTopic.get(message.topic) ?? [];
    topicMessages.push(message);
    this.byTopic.set(message.topic, topicMessages);

    if (this.messages.length > this.capacity) {
      const evicted = this.messages.shift();
      if (evicted) {
        const indexedMessages = this.byTopic.get(evicted.topic);
        if (indexedMessages) {
          const index = indexedMessages.findIndex((item) => item.id === evicted.id);
          if (index >= 0) indexedMessages.splice(index, 1);
          if (indexedMessages.length === 0) this.byTopic.delete(evicted.topic);
        }
        this.evictedCount += 1;
      }
    }
    return true;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get oldestTimestamp(): number | undefined {
    return this.messages[0]?.timestamp;
  }

  getRecent(limit = 100): CapturedMessage[] {
    return this.messages.slice(-limit).reverse();
  }

  getByTopic(topic: string, limit = 100): CapturedMessage[] {
    return (this.byTopic.get(topic) ?? []).slice(-limit).reverse();
  }
}
