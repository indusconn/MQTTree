import type { TopicNode } from '../shared/contracts';

export interface TopicRow {
  segment: string;
  topic: string;
  depth: number;
  hasChildren: boolean;
  messageCount: number;
  latestTimestamp: number;
  retained: boolean;
}

export function flattenTopicTree(
  nodes: TopicNode[],
  collapsedTopics: Set<string>,
  depth = 0
): TopicRow[] {
  return nodes.flatMap((node) => {
    const row: TopicRow = {
      segment: node.segment || '(empty level)',
      topic: node.fullTopic,
      depth,
      hasChildren: node.children.length > 0,
      messageCount: node.messageCount,
      latestTimestamp: node.latestTimestamp,
      retained: node.retained
    };
    if (collapsedTopics.has(node.fullTopic)) return [row];
    return [row, ...flattenTopicTree(node.children, collapsedTopics, depth + 1)];
  });
}

export function collectCollapsedBranchTopics(
  nodes: TopicNode[],
  expandedTopics: Set<string>
): Set<string> {
  const collapsed = new Set<string>();
  const visit = (node: TopicNode): void => {
    if (node.children.length > 0 && !expandedTopics.has(node.fullTopic)) {
      collapsed.add(node.fullTopic);
    }
    for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return collapsed;
}

export function filterTopicTree(nodes: TopicNode[], query: string): TopicNode[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return nodes;

  return nodes.flatMap((node) => {
    const children = filterTopicTree(node.children, query);
    if (!node.fullTopic.toLocaleLowerCase().includes(normalized) && children.length === 0) {
      return [];
    }
    return [{ ...node, children }];
  });
}
