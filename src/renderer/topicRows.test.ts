import { describe, expect, it } from 'vitest';
import type { TopicNode } from '../shared/contracts';
import { flattenTopicTree } from './topicRows';

const tree: TopicNode[] = [
  {
    segment: 'factory',
    fullTopic: 'factory',
    messageCount: 2,
    latestTimestamp: 20,
    retained: false,
    children: [
      {
        segment: 'line-1',
        fullTopic: 'factory/line-1',
        messageCount: 2,
        latestTimestamp: 20,
        retained: false,
        children: [
          {
            segment: 'temperature',
            fullTopic: 'factory/line-1/temperature',
            messageCount: 2,
            latestTimestamp: 20,
            retained: true,
            children: []
          }
        ]
      }
    ]
  }
];

describe('flattenTopicTree', () => {
  it('creates indented rows for expanded folders', () => {
    expect(flattenTopicTree(tree, new Set())).toEqual([
      expect.objectContaining({ topic: 'factory', depth: 0, hasChildren: true }),
      expect.objectContaining({ topic: 'factory/line-1', depth: 1, hasChildren: true }),
      expect.objectContaining({
        topic: 'factory/line-1/temperature',
        depth: 2,
        retained: true
      })
    ]);
  });

  it('hides descendants of collapsed folders', () => {
    expect(flattenTopicTree(tree, new Set(['factory']))).toEqual([
      expect.objectContaining({ topic: 'factory', depth: 0 })
    ]);
  });
});
