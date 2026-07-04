import { describe, expect, it, vi } from 'vitest';
import { EventBatcher } from './eventBatcher';

describe('EventBatcher', () => {
  it('coalesces rapid events into one timed delivery', () => {
    vi.useFakeTimers();
    const deliver = vi.fn();
    const batcher = new EventBatcher<number>(100, deliver);

    batcher.push(1);
    batcher.push(2);
    batcher.push(3);
    expect(deliver).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(deliver).toHaveBeenCalledWith([1, 2, 3]);
    vi.useRealTimers();
  });

  it('flushes pending events immediately on disposal', () => {
    const deliver = vi.fn();
    const batcher = new EventBatcher<string>(100, deliver);
    batcher.push('message');

    batcher.dispose();

    expect(deliver).toHaveBeenCalledWith(['message']);
  });
});
