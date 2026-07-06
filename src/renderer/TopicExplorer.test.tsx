// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TopicNode } from '../shared/contracts';
import { TopicExplorer } from './TopicExplorer';

const tree: TopicNode[] = [
  {
    segment: 'factory',
    fullTopic: 'factory',
    messageCount: 3,
    latestTimestamp: 30,
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
  },
  {
    segment: 'devices',
    fullTopic: 'devices',
    messageCount: 1,
    latestTimestamp: 10,
    retained: false,
    children: [
      {
        segment: 'sensor-1',
        fullTopic: 'devices/sensor-1',
        messageCount: 1,
        latestTimestamp: 10,
        retained: false,
        children: []
      }
    ]
  }
];

describe('TopicExplorer', () => {
  it('opens with only first-level topics visible and expands branches on demand', () => {
    render(<TopicExplorer tree={tree} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'factory' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'factory/line-1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices/sensor-1' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle factory' }));

    expect(screen.getByRole('button', { name: 'factory/line-1' })).toBeInTheDocument();
  });

  it('reveals matching nested topics while searching', () => {
    render(<TopicExplorer tree={tree} onSelect={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Filter topics'), {
      target: { value: 'temperature' }
    });

    expect(screen.getByRole('button', { name: 'factory/line-1/temperature' })).toBeInTheDocument();
  });

  it('pulses the collapsed parent when a hidden descendant receives a message', () => {
    render(
      <TopicExplorer
        tree={tree}
        onSelect={vi.fn()}
        pulseTopic="factory/line-1/temperature"
        pulseKey="message-1"
      />
    );

    expect(screen.getByRole('button', { name: 'factory' }).closest('.topic-row')).toHaveClass(
      'message-pulse'
    );
    expect(screen.getByRole('button', { name: 'devices' }).closest('.topic-row')).not.toHaveClass(
      'message-pulse'
    );
  });

  it('pulses the deepest visible ancestor when a branch is expanded', () => {
    const { rerender } = render(<TopicExplorer tree={tree} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle factory' }));
    rerender(
      <TopicExplorer
        tree={tree}
        onSelect={vi.fn()}
        pulseTopic="factory/line-1/temperature"
        pulseKey="message-2"
      />
    );

    expect(screen.getByRole('button', { name: 'factory/line-1' }).closest('.topic-row')).toHaveClass(
      'message-pulse'
    );
    expect(screen.getByRole('button', { name: 'factory' }).closest('.topic-row')).not.toHaveClass(
      'message-pulse'
    );
  });

  it('pulses the closest visible branch while search is filtering the tree', () => {
    const { rerender } = render(<TopicExplorer tree={tree} onSelect={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Filter topics'), {
      target: { value: 'temperature' }
    });

    rerender(
      <TopicExplorer
        tree={tree}
        onSelect={vi.fn()}
        pulseTopic="factory/line-1/pressure"
        pulseKey="message-3"
      />
    );

    expect(screen.getByRole('button', { name: 'factory/line-1' }).closest('.topic-row')).toHaveClass(
      'message-pulse'
    );
  });
});
