import { useMemo, Fragment } from 'react';

/**
 * Regex to match URLs in text:
 * - https?:// URLs
 * - www. URLs (will be prefixed with https://)
 * - Email addresses (optional mailto: prefix)
 */
const URL_REGEX = /(?:(?:https?:\/\/)|(?:www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)|(?:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

/**
 * Allowed protocols for security - blocks javascript:, data:, etc.
 */
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];

/**
 * Check if a URL has a safe protocol
 */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    // If URL parsing fails, it might be a relative URL or malformed
    return false;
  }
}

/**
 * Normalize a matched URL string to a proper href
 */
function normalizeUrl(match: string): string {
  // Email address detection
  if (match.includes('@') && !match.includes('://')) {
    return `mailto:${match}`;
  }
  
  // www. URLs need https:// prefix
  if (match.toLowerCase().startsWith('www.')) {
    return `https://${match}`;
  }
  
  return match;
}

interface LinkifiedTextProps {
  /** The text content to linkify */
  text: string;
  /** Additional className for the wrapper */
  className?: string;
}

/**
 * Component that converts URLs and email addresses in text into clickable links.
 * 
 * Security features:
 * - Only allows http, https, and mailto protocols
 * - Opens in new tab with noopener noreferrer
 * - Uses React fragments, no dangerouslySetInnerHTML
 * 
 * Supports:
 * - https://example.com
 * - http://example.com
 * - www.example.com
 * - user@example.com
 */
export function LinkifiedText({ text, className }: LinkifiedTextProps) {
  const parts = useMemo(() => {
    if (!text) return [];
    
    const result: Array<{ type: 'text' | 'link'; content: string; href?: string }> = [];
    let lastIndex = 0;
    
    // Reset regex lastIndex
    URL_REGEX.lastIndex = 0;
    
    let match: RegExpExecArray | null;
    while ((match = URL_REGEX.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        result.push({
          type: 'text',
          content: text.slice(lastIndex, match.index),
        });
      }
      
      const matchedUrl = match[0];
      const href = normalizeUrl(matchedUrl);
      
      // Only add as link if it's safe
      if (isSafeUrl(href)) {
        result.push({
          type: 'link',
          content: matchedUrl,
          href,
        });
      } else {
        // Treat as plain text if URL is not safe
        result.push({
          type: 'text',
          content: matchedUrl,
        });
      }
      
      lastIndex = match.index + matchedUrl.length;
    }
    
    // Add remaining text after last match
    if (lastIndex < text.length) {
      result.push({
        type: 'text',
        content: text.slice(lastIndex),
      });
    }
    
    return result;
  }, [text]);

  // If no links found, return plain text
  if (parts.length === 0) {
    return <span className={className}>{text}</span>;
  }

  // If only one text part (no links), return plain text
  if (parts.length === 1 && parts[0].type === 'text') {
    return <span className={className}>{parts[0].content}</span>;
  }

  return (
    <span className={className}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part.type === 'link' ? (
            <a
              href={part.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-primary hover:underline break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part.content}
            </a>
          ) : (
            part.content
          )}
        </Fragment>
      ))}
    </span>
  );
}
