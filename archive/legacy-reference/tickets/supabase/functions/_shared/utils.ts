/**
 * Shared utilities for Supabase Edge Functions
 */

/**
 * Parse timestamp from ClickUp (epoch-ms, epoch-s, or ISO string)
 * Handles all ClickUp date formats uniformly
 * 
 * @param value - Timestamp value from ClickUp (can be string, number, null, or undefined)
 * @returns Date object representing the timestamp
 */
export function parseClickUpTimestamp(value: string | number | undefined | null): Date {
  if (!value) return new Date();
  
  const strValue = String(value).trim();
  
  // Numeric string - determine epoch-ms or epoch-s
  if (/^\d+$/.test(strValue)) {
    const numValue = parseInt(strValue, 10);
    // 13+ digits = milliseconds (1707234567890)
    if (strValue.length >= 13) {
      return new Date(numValue);
    }
    // Strictly 10 digits = seconds (1707234567)
    if (strValue.length === 10) {
      return new Date(numValue * 1000);
    }
    // 11-12 digits: edge case - treat as ms (safer assumption)
    return new Date(numValue);
  }
  
  // Try parsing as ISO string or other date format
  const parsed = new Date(strValue);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Safely extract MIME type from ClickUp attachment.
 * Handles cases where type is an object (App attachments like Google Drive, Box, OneDrive),
 * null, or undefined. Returns string MIME type/extension or undefined.
 * 
 * @param att - Attachment object from ClickUp
 * @returns String type/extension or undefined for App attachments
 */
export function normalizeAttachmentType(att: {
  type?: unknown;
  extension?: string;
}): string | undefined {
  // If extension is a valid string (e.g., "png", "pdf"), use it
  if (typeof att.extension === 'string' && att.extension.length > 0) {
    return att.extension;
  }
  
  // If type is a string MIME type (e.g., "image/png"), use it
  if (typeof att.type === 'string' && att.type.length > 0) {
    return att.type;
  }
  
  // Type is object/null/undefined (App attachment) - return undefined
  return undefined;
}
