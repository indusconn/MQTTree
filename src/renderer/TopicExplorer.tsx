import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TopicNode } from '../shared/contracts';
import {
  collectCollapsedBranchTopics,
  filterTopicTree,
  flattenTopicTree,
  type TopicRow
} from './topicRows';

interface TopicExplorerProps {
  tree: TopicNode[];
  selectedTopic?: string;
  onSelect(topic: string): void;
}

export function TopicExplorer({
  tree,
  selectedTopic,
  onSelect
}: TopicExplorerProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const collapsed = useMemo(
    () => query.trim()
      ? new Set<string>()
      : collectCollapsedBranchTopics(tree, expanded),
    [tree, expanded, query]
  );
  const rows = useMemo(
    () => flattenTopicTree(filterTopicTree(tree, query), collapsed),
    [tree, query, collapsed]
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 12
  });

  const toggle = (topic: string): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  };

  const renderRow = (row: TopicRow): React.JSX.Element => (
    <div
      className={`topic-row ${selectedTopic === row.topic ? 'selected' : ''}`}
      style={{ paddingLeft: 10 + row.depth * 18 }}
    >
      <button
        className="tree-toggle"
        aria-label={row.hasChildren ? `Toggle ${row.topic}` : undefined}
        disabled={!row.hasChildren}
        onClick={() => toggle(row.topic)}
      >
        {row.hasChildren ? (collapsed.has(row.topic) ? '›' : '⌄') : '·'}
      </button>
      <button className="topic-name" aria-label={row.topic} onClick={() => onSelect(row.topic)}>
        <span>{row.segment}</span>
        {row.retained && <span className="retained-dot" title="Retained message" />}
      </button>
      <span className="topic-count">{row.messageCount}</span>
    </div>
  );

  return (
    <section className="topic-explorer" aria-label="Topic explorer">
      <div className="pane-heading">
        <div>
          <span className="eyebrow">Live hierarchy</span>
          <h2>Topics</h2>
        </div>
        <span className="count-badge">{rows.length}</span>
      </div>
      <label className="search-box">
        <span>⌕</span>
        <input
          aria-label="Filter topics"
          placeholder="Filter topics"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="topic-scroll" ref={scrollRef}>
        {rows.length === 0 ? (
          <div className="empty-tree">Waiting for matching messages…</div>
        ) : rows.length < 300 ? (
          rows.map((row) => <div key={row.topic}>{renderRow(row)}</div>)
        ) : (
          <div className="virtual-list" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => (
              <div
                key={rows[item.index].topic}
                className="virtual-row"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                {renderRow(rows[item.index])}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
