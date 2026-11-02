import { createPublicSupportWebhook } from '@/lib/supportIntake';
import { NextResponse } from 'next/server';

interface ExtractedFile {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
}

/**
 * Parses and extracts file and image links from the incoming webhook payload.
 * Only called after webhook authentication and form-shaped payload validation.
 */
function extractFilesFromPayload(payload: unknown): ExtractedFile[] {
  if (!payload) return [];

  const payloadStr = JSON.stringify(payload);
  const urlRegex = /https?:\/\/[^\s"'<>\(\)]+/g;
  const matches = payloadStr.match(urlRegex) || [];
  
  const extractedFiles: ExtractedFile[] = [];
  const seenUrls = new Set<string>();

  for (const urlStr of matches) {
    if (seenUrls.has(urlStr)) continue;

    try {
      const url = new URL(urlStr);
      const gfDownload = url.searchParams.get('gf-download');
      const pathname = url.pathname;
      
      // Look for common document, image, media, or archive file extensions
      const fileExtensions = /\.(png|jpg|jpeg|gif|webp|pdf|doc|docx|xls|xlsx|zip|csv|txt|mp4)$/i;
      const isFileLink = fileExtensions.test(pathname) || (gfDownload && fileExtensions.test(gfDownload));

      if (gfDownload || isFileLink) {
        seenUrls.add(urlStr);

        let filename = 'attachment';
        if (gfDownload) {
          const decoded = decodeURIComponent(gfDownload);
          const parts = decoded.split('/');
          filename = parts[parts.length - 1] || 'attachment';
        } else {
          const parts = pathname.split('/');
          const lastPart = parts[parts.length - 1];
          if (lastPart) {
            filename = decodeURIComponent(lastPart);
          }
        }

        extractedFiles.push({
          id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: filename,
          url: urlStr,
          uploadedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      // Ignore invalid URL
    }
  }

  return extractedFiles;
}

/** Public Gravity Form intake only. Email replies use /api/email/inbound. */
export const POST = createPublicSupportWebhook(extractFilesFromPayload);

export async function GET() {
  return NextResponse.json({ status: 'Webhook endpoint active' });
}
