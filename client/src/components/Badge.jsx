import { STATUS_LABELS, STATUS_TONE, PRIORITY_LABELS, PRIORITY_TONE, TYPE_LABELS } from '../lib/format';

export function Badge({ children, tone = 'gray', dot = false }) {
  return <span className={`badge ${tone}${dot ? ' dot' : ''}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || 'gray'} dot>{STATUS_LABELS[status] || status}</Badge>;
}

export function PriorityBadge({ priority }) {
  if (!priority || priority === 'normal') return null;
  return <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}

export function TypeBadge({ type }) {
  return <Badge tone="blue">{TYPE_LABELS[type] || type}</Badge>;
}
