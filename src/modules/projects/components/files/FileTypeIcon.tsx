import { FileText, Image, File, FileSpreadsheet, FileArchive, Film } from 'lucide-react';

interface FileTypeIconProps {
  mimeType?: string;
  name?: string;
}

/**
 * Returns an icon with background color based on MIME type or file extension.
 */
export function FileTypeIcon({ mimeType, name }: FileTypeIconProps) {
  const ext = name?.split('.').pop()?.toLowerCase() ?? '';
  const cfg = resolveIcon(mimeType, ext);
  const Icon = cfg.Icon;

  return (
    <div
      className="w-[28px] h-[28px] rounded-[6px] flex items-center justify-center flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <Icon size={13} />
    </div>
  );
}

function resolveIcon(mime?: string, ext?: string) {
  // PDF
  if (mime?.includes('pdf') || ext === 'pdf') {
    return { bg: '#FEE2E2', color: '#DC2626', Icon: FileText };
  }
  // Images
  if (mime?.startsWith('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff'].includes(ext ?? '')) {
    return { bg: '#DBEAFE', color: '#2563EB', Icon: Image };
  }
  // Spreadsheets
  if (mime?.includes('spreadsheet') || mime?.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext ?? '')) {
    return { bg: '#D1FAE5', color: '#059669', Icon: FileSpreadsheet };
  }
  // Documents (Word, text)
  if (mime?.includes('word') || mime?.includes('document') || mime === 'text/plain' || ['doc', 'docx', 'txt', 'md', 'rtf'].includes(ext ?? '')) {
    return { bg: '#DBEAFE', color: '#1D4ED8', Icon: FileText };
  }
  // Video
  if (mime?.startsWith('video') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext ?? '')) {
    return { bg: '#FEF3C7', color: '#D97706', Icon: Film };
  }
  // Archives
  if (mime?.includes('zip') || mime?.includes('archive') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext ?? '')) {
    return { bg: '#E0E7FF', color: '#4338CA', Icon: FileArchive };
  }
  // Fallback
  return { bg: '#F3F4F6', color: '#6B7280', Icon: File };
}
