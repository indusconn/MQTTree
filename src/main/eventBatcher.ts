export class EventBatcher<T> {
  private items: T[] = [];
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly intervalMs: number,
    private readonly deliver: (items: T[]) => void
  ) {}

  push(item: T): void {
    this.items.push(item);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.intervalMs);
    }
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.items.length === 0) return;
    const pending = this.items;
    this.items = [];
    this.deliver(pending);
  }

  dispose(): void {
    this.flush();
  }
}
