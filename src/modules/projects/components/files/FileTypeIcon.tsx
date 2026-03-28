import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import { File02Icon, Image01Icon, File01Icon, FileSpreadsheetIcon, FileArchiveIcon, Film01Icon } from '@hugeicons/core-free-icons';

interface FileTypeIconProps {
  mimeType?: string;
  name?: string;
}

/**
 * Returns an icon with background color based on MIME type or file extension.
 * Colors use CSS custom properties from tokens.css (--file-* tokens).
 */
export function FileTypeIcon({ mimeType, name }: FileTypeIconProps) {
  const ext = name?.split('.').pop()?.toLowerCase() ?? '';
  const cfg = resolveIcon(mimeType, ext);

  return (
    <div
      className="w-[28px] h-[28px] rounded-[6px] flex items-center justify-center flex-shrink-0"
      style={{ background: `var(${cfg.bgVar})`, color: `var(${cfg.colorVar})` }}
    >
      <HugeiconsIcon icon={cfg.Icon} size={13} />
    </div>
  );
}

interface IconConfig {
  bgVar: string;
  colorVar: string;
  Icon: IconSvgElement;
}

function resolveIcon(mime?: string, ext?: string): IconConfig {
  // PDF
  if (mime?.includes('pdf') || ext === 'pdf') {
    return { bgVar: '--file-pdf-bg', colorVar: '--file-pdf', Icon: File02Icon };
  }
  // SVG (specific icon before generic images)
  if (ext === 'svg') {
    return { bgVar: '--file-svg-bg', colorVar: '--file-svg', Icon: Image01Icon };
  }
  // Images
  if (mime?.startsWith('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'].includes(ext ?? '')) {
    return { bgVar: '--file-image-bg', colorVar: '--file-image', Icon: Image01Icon };
  }
  // Spreadsheets
  if (mime?.includes('spreadsheet') || mime?.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext ?? '')) {
    return { bgVar: '--file-spreadsheet-bg', colorVar: '--file-spreadsheet', Icon: FileSpreadsheetIcon };
  }
  // Documents (Word, text)
  if (mime?.includes('word') || mime?.includes('document') || mime === 'text/plain' || ['doc', 'docx', 'txt', 'md', 'rtf'].includes(ext ?? '')) {
    return { bgVar: '--file-document-bg', colorVar: '--file-document', Icon: File02Icon };
  }
  // Video
  if (mime?.startsWith('video') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext ?? '')) {
    return { bgVar: '--file-video-bg', colorVar: '--file-video', Icon: Film01Icon };
  }
  // Archives
  if (mime?.includes('zip') || mime?.includes('archive') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext ?? '')) {
    return { bgVar: '--file-archive-bg', colorVar: '--file-archive', Icon: FileArchiveIcon };
  }
  // Fallback
  return { bgVar: '--file-default-bg', colorVar: '--file-default', Icon: File01Icon };
}
