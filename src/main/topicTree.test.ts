import { describe, expect, it } from 'vitest';
import { TopicTree } from './topicTree';

describe('TopicTree', () => {
  it('splits observed topics into a folder hierarchy and aggregates activity', () => {
    const tree = new TopicTree();
    tree.observe('factory/line-1/temperature', {
      timestamp: 100,
      retained: false
    });
    tree.observe('factory/line-1/pressure', {
      timestamp: 200,
      retained: true
    });

    expect(tree.snapshot()).toEqual([
      expect.objectContaining({
        segment: 'factory',
        fullTopic: 'factory',
        messageCount: 2,
        latestTimestamp: 200,
        children: [
          expect.objectContaining({
            segment: 'line-1',
            children: [
              expect.objectContaining({ segment: 'pressure', retained: true }),
              expect.objectContaining({ segment: 'temperature', retained: false })
            ]
          })
        ]
      })
    ]);
  });

  it('searches by full topic while preserving matching ancestors', () => {
    const tree = new TopicTree();
    tree.observe('factory/line-1/temperature', { timestamp: 100, retained: false });
    tree.observe('building/floor-1/humidity', { timestamp: 200, retained: false });

    expect(tree.search('temperature')).toEqual([
      expect.objectContaining({
        segment: 'factory',
        children: [
          expect.objectContaining({
            segment: 'line-1',
            children: [expect.objectContaining({ fullTopic: 'factory/line-1/temperature' })]
          })
        ]
      })
    ]);
  });

  it('prunes inactive leaves and empty ancestors', () => {
    const tree = new TopicTree();
    tree.observe('temporary/device/status', { timestamp: 100, retained: false });
    tree.observe('active/device/status', { timestamp: 900, retained: false });

    tree.pruneBefore(500);

    expect(tree.snapshot().map((node) => node.segment)).toEqual(['active']);
  });
});
