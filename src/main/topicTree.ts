import type { TopicNode } from '../shared/contracts';

interface MutableTopicNode {
  segment: string;
  fullTopic: string;
  messageCount: number;
  latestTimestamp: number;
  retained: boolean;
  children: Map<string, MutableTopicNode>;
}

export interface TopicObservation {
  timestamp: number;
  retained: boolean;
}

export class TopicTree {
  private readonly roots = new Map<string, MutableTopicNode>();

  observe(topic: string, observation: TopicObservation): void {
    const segments = topic.split('/');
    let children = this.roots;
    let fullTopic = '';

    segments.forEach((segment, index) => {
      fullTopic = index === 0 ? segment : `${fullTopic}/${segment}`;
      let node = children.get(segment);
      if (!node) {
        node = {
          segment,
          fullTopic,
          messageCount: 0,
          latestTimestamp: 0,
          retained: false,
          children: new Map()
        };
        children.set(segment, node);
      }

      node.messageCount += 1;
      node.latestTimestamp = Math.max(node.latestTimestamp, observation.timestamp);
      if (index === segments.length - 1) {
        node.retained = observation.retained;
      }
      children = node.children;
    });
  }

  snapshot(): TopicNode[] {
    return this.toSnapshot(this.roots);
  }

  search(query: string): TopicNode[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return this.snapshot();

    const filterNodes = (nodes: Map<string, MutableTopicNode>): TopicNode[] =>
      [...nodes.values()]
        .sort((left, right) => left.segment.localeCompare(right.segment))
        .flatMap((node) => {
          const children = filterNodes(node.children);
          if (!node.fullTopic.toLocaleLowerCase().includes(normalizedQuery) && children.length === 0) {
            return [];
          }
          return [{ ...this.copyNode(node), children }];
        });

    return filterNodes(this.roots);
  }

  pruneBefore(timestamp: number): void {
    const prune = (nodes: Map<string, MutableTopicNode>): void => {
      for (const [segment, node] of nodes) {
        prune(node.children);
        if (node.latestTimestamp < timestamp && node.children.size === 0) {
          nodes.delete(segment);
        }
      }
    };
    prune(this.roots);
  }

  private toSnapshot(nodes: Map<string, MutableTopicNode>): TopicNode[] {
    return [...nodes.values()]
      .sort((left, right) => left.segment.localeCompare(right.segment))
      .map((node) => ({
        ...this.copyNode(node),
        children: this.toSnapshot(node.children)
      }));
  }

  private copyNode(node: MutableTopicNode): Omit<TopicNode, 'children'> {
    return {
      segment: node.segment,
      fullTopic: node.fullTopic,
      messageCount: node.messageCount,
      latestTimestamp: node.latestTimestamp,
      retained: node.retained
    };
  }
}
