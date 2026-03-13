import { linkifyText } from '@/shared/lib/linkify';

interface MessageBubbleProps {
  role: 'team' | 'client';
  content: string;
  senderName: string;
  // Either an ISO timestamp (auto-formatted) or a pre-formatted label
  timestamp?: string;
  timeLabel?: string;
  // 'solid' = full accent bg + white text (projects style)
  // 'light' = accent-light bg + accent text (tickets style, default)
  clientBubbleStyle?: 'solid' | 'light';
  // Show avatar circle with sender initial
  showAvatar?: boolean;
}

export function MessageBubble({
  role,
  content,
  senderName,
  timestamp,
  timeLabel,
  clientBubbleStyle = 'light',
  showAvatar = false,
}: MessageBubbleProps) {
  const isClient = role === 'client';

  const displayTime = timeLabel
    ?? (timestamp
      ? new Date(timestamp).toLocaleString('de-AT', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        })
      : '');

  const bubbleBg = isClient
    ? (clientBubbleStyle === 'solid' ? 'var(--accent)' : 'var(--accent-light)')
    : 'var(--surface-active)';

  const bubbleColor = isClient
    ? (clientBubbleStyle === 'solid' ? '#fff' : 'var(--accent)')
    : 'var(--text-primary)';

  const bubbleBorderRadius = isClient ? '14px 4px 14px 14px' : '4px 14px 14px 14px';

  return (
    <div
      style={{
        display: 'flex',
        gap: '10px',
        flexDirection: isClient ? 'row-reverse' : 'row',
      }}
    >
      {showAvatar && (
        <div
          style={{
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            fontSize: '10px',
            fontWeight: 700,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            background: isClient ? '#7C3AED' : 'var(--accent)',
          }}
        >
          {senderName.charAt(0).toUpperCase()}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isClient ? 'flex-end' : 'flex-start',
          maxWidth: '70%',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '6px',
            marginBottom: '4px',
            flexDirection: isClient ? 'row-reverse' : 'row',
          }}
        >
          <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {senderName}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
            {displayTime}
          </span>
        </div>
        <div
          style={{
            padding: '8px 12px',
            borderRadius: bubbleBorderRadius,
            background: bubbleBg,
            color: bubbleColor,
            fontSize: '13px',
            lineHeight: '1.5',
            wordBreak: 'break-word',
          }}
        >
          {linkifyText(content)}
        </div>
      </div>
    </div>
  );
}
