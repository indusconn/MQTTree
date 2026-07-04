import type { ButtonHTMLAttributes } from 'react';

type IconAction = 'connect' | 'edit' | 'delete';
type IconTone = 'default' | 'danger';

interface IconActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconAction;
  label: string;
  tooltip: string;
  tone?: IconTone;
}

function Icon({ icon }: { icon: IconAction }): React.JSX.Element {
  if (icon === 'connect') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
      </svg>
    );
  }

  if (icon === 'edit') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

export function IconActionButton({
  icon,
  label,
  tooltip,
  tone = 'default',
  className = '',
  type = 'button',
  ...props
}: IconActionButtonProps): React.JSX.Element {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      className={`icon-action ${tone === 'danger' ? 'danger' : ''} ${className}`.trim()}
      data-icon-action={icon}
      data-tooltip={tooltip}
    >
      <Icon icon={icon} />
    </button>
  );
}
