import { Download, FileIcon, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CommentAttachment {
  id: string;
  title: string;
  url: string;
  type?: unknown; // Can be string, object, null, or undefined (App attachments)
  size?: number;
}

interface CommentAttachmentsProps {
  attachments: CommentAttachment[];
  isFromPortal?: boolean; // If true, show all attachment types; if false, only show cloud links
  className?: string;
}

// Attachment kind classification
type AttachmentKind = 'image' | 'pdf' | 'file' | 'link';

// External provider detection
interface ExternalProvider {
  name: string;
  pattern: RegExp;
}

const EXTERNAL_PROVIDERS: ExternalProvider[] = [
  { name: 'Google Drive', pattern: /drive\.google\.com|docs\.google\.com/i },
  { name: 'Dropbox', pattern: /dropbox\.com/i },
  { name: 'OneDrive', pattern: /onedrive\.live\.com|sharepoint\.com/i },
  { name: 'Box', pattern: /box\.com/i },
];

/**
 * Detect if URL belongs to an external document provider
 */
function detectExternalProvider(url: string): ExternalProvider | null {
  for (const provider of EXTERNAL_PROVIDERS) {
    if (provider.pattern.test(url)) {
      return provider;
    }
  }
  return null;
}

/**
 * Safely get MIME type as string (handles object/null/undefined)
 */
function getSafeMimeType(type: unknown): string | null {
  if (typeof type === 'string' && type.length > 0) {
    return type;
  }
  return null;
}

/**
 * Classify attachment into logical kind
 */
function classifyAttachment(attachment: CommentAttachment): AttachmentKind {
  // First check if it's an external provider link
  const externalProvider = detectExternalProvider(attachment.url);
  if (externalProvider) {
    return 'link';
  }
  
  const mimeType = getSafeMimeType(attachment.type);
  const url = attachment.url.toLowerCase();
  
  // Check for image by MIME type or URL extension
  if (mimeType?.startsWith('image/')) {
    return 'image';
  }
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  if (imageExtensions.some(ext => url.includes(ext))) {
    return 'image';
  }
  
  // Check for PDF by MIME type or URL extension
  if (mimeType === 'application/pdf' || mimeType === 'pdf' || url.includes('.pdf')) {
    return 'pdf';
  }
  
  // Default to file for anything else with a valid URL
  return 'file';
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CommentAttachments({ 
  attachments, 
  isFromPortal = false, // Default: treat as ClickUp comment (links only)
  className 
}: CommentAttachmentsProps) {
  if (!attachments || attachments.length === 0) return null;

  // Classify all attachments
  const classified = attachments.map(att => ({
    ...att,
    kind: classifyAttachment(att),
    provider: detectExternalProvider(att.url),
  }));

  // For non-portal comments: only show cloud links (no files/images from ClickUp - can't guarantee binding)
  const links = classified.filter(a => a.kind === 'link');
  
  if (!isFromPortal) {
    // ClickUp comments: Only render external cloud links (safe - URL pattern based)
    if (links.length === 0) return null;
    
    return (
      <div className={cn('space-y-2', className)}>
        <div className="flex flex-wrap gap-2">
          {links.map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-md px-2 py-1.5 transition-colors border border-primary/20"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="max-w-[150px] truncate">{attachment.title}</span>
              {attachment.provider && (
                <span className="text-primary/70 text-[10px]">
                  ({attachment.provider.name})
                </span>
              )}
            </a>
          ))}
        </div>
      </div>
    );
  }

  // Portal comments: show everything (images, files, PDFs, links) - we control these
  const images = classified.filter(a => a.kind === 'image');
  const files = classified.filter(a => a.kind === 'file' || a.kind === 'pdf');

  return (
    <div className={cn('space-y-2', className)}>
      {/* Image thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative group block"
            >
              <img
                src={attachment.url}
                alt={attachment.title}
                className="h-20 w-20 object-cover rounded-md border border-border hover:border-primary transition-colors"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                <span className="text-xs font-medium text-foreground">View</span>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* File chips (regular files and PDFs) */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs bg-muted hover:bg-muted/80 rounded-md px-2 py-1.5 transition-colors"
            >
              <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="max-w-[150px] truncate">{attachment.title}</span>
              {attachment.size && (
                <span className="text-muted-foreground">({formatFileSize(attachment.size)})</span>
              )}
              <Download className="h-3 w-3 text-muted-foreground" />
            </a>
          ))}
        </div>
      )}

      {/* External document links (Google Drive, Box, OneDrive, Dropbox) */}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-md px-2 py-1.5 transition-colors border border-primary/20"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="max-w-[150px] truncate">{attachment.title}</span>
              {attachment.provider && (
                <span className="text-primary/70 text-[10px]">
                  ({attachment.provider.name})
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
