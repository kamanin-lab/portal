import React from 'react';

const URL_REGEX = /(https?:\/\/[^\s<>)"']+|www\.[^\s<>)"']+)/gi;

export function linkifyText(text: string): React.ReactNode {
  const parts = text.split(URL_REGEX);
  if (parts.length === 1) return text;

  return (
    <>
      {parts.map((part, i) => {
        if (URL_REGEX.lastIndex = 0, URL_REGEX.test(part)) {
          const href = part.startsWith('http') ? part : `https://${part}`;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'underline' }}
            >
              {part}
            </a>
          );
        }
        return part;
      })}
    </>
  );
}
