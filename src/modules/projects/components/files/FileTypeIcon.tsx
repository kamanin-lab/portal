import { FileText, Image, File, FileSpreadsheet, FileArchive, Film } from 'lucide-react';

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
  const Icon = cfg.Icon;

  return (
    <div
      className="w-[28px] h-[28px] rounded-[6px] flex items-center justify-center flex-shrink-0"
      style={{ background: `var(${cfg.bgVar})`, color: `var(${cfg.colorVar})` }}
    >
      <Icon size={13} />
    </div>
  );
}

interface IconConfig {
  bgVar: string;
  colorVar: string;
  Icon: typeof FileText;
}

function resolveIcon(mime?: string, ext?: string): IconConfig {
  // PDF
  if (mime?.includes('pdf') || ext === 'pdf') {
    return { bgVar: '--file-pdf-bg', colorVar: '--file-pdf', Icon: FileText };
  }
  // SVG (specific icon before generic images)
  if (ext === 'svg') {
    return { bgVar: '--file-svg-bg', colorVar: '--file-svg', Icon: Image };
  }
  // Images
  if (mime?.startsWith('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'].includes(ext ?? '')) {
    return { bgVar: '--file-image-bg', colorVar: '--file-image', Icon: Image };
  }
  // Spreadsheets
  if (mime?.includes('spreadsheet') || mime?.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext ?? '')) {
    return { bgVar: '--file-spreadsheet-bg', colorVar: '--file-spreadsheet', Icon: FileSpreadsheet };
  }
  // Documents (Word, text)
  if (mime?.includes('word') || mime?.includes('document') || mime === 'text/plain' || ['doc', 'docx', 'txt', 'md', 'rtf'].includes(ext ?? '')) {
    return { bgVar: '--file-document-bg', colorVar: '--file-document', Icon: FileText };
  }
  // Video
  if (mime?.startsWith('video') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext ?? '')) {
    return { bgVar: '--file-video-bg', colorVar: '--file-video', Icon: Film };
  }
  // Archives
  if (mime?.includes('zip') || mime?.includes('archive') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext ?? '')) {
    return { bgVar: '--file-archive-bg', colorVar: '--file-archive', Icon: FileArchive };
  }
  // Fallback
  return { bgVar: '--file-default-bg', colorVar: '--file-default', Icon: File };
}
