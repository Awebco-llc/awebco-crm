import { NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface ExtractedFile {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
}

/**
 * Parses and extracts file and image links from the incoming webhook payload.
 * Stringifies the payload to search everywhere (email body, custom form fields, etc.).
 */
function extractFilesFromPayload(payload: any): ExtractedFile[] {
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

function parseFieldsFromText(text: string) {
  const result: any = {};
  if (!text) return result;

  const cleanText = text.replace(/\r\n/g, '\n');

  // 1. Company Name: match "Company Name" label and the next line or content after colon
  const companyMatch = cleanText.match(/Company\s*Name[\s:|]*\n*([^\n\r]+)/i);
  if (companyMatch && companyMatch[1]) {
    result.companyName = companyMatch[1].trim();
  }

  // 2. Email: match "Email" label and extract the email address
  const emailMatch = cleanText.match(/Email[\s:|]*\n*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (emailMatch && emailMatch[1]) {
    result.email = emailMatch[1].trim();
  }

  // 3. Name: match "Name" label and extract requester's name
  const nameMatch = cleanText.match(/(?:^|\n)Name[\s:|]*\n*([^\n\r]+)/i);
  if (nameMatch && nameMatch[1]) {
    result.contactName = nameMatch[1].trim();
  }

  // 4. Category: match "Category" label
  const categoryMatch = cleanText.match(/Category[\s:|]*\n*(?:Category:\s*)?([^\n\r]+)/i);
  if (categoryMatch && categoryMatch[1]) {
    result.category = categoryMatch[1].trim();
  }

  // 5. Priority: match "Priority" label
  const priorityMatch = cleanText.match(/Priority[\s:|]*\n*(?:Priority:\s*)?([^\n\r]+)/i);
  if (priorityMatch && priorityMatch[1]) {
    const rawPriority = priorityMatch[1].trim();
    if (/low/i.test(rawPriority)) result.priority = 'Low';
    else if (/high/i.test(rawPriority)) result.priority = 'High';
    else if (/urgent/i.test(rawPriority)) result.priority = 'Urgent';
    else if (/medium/i.test(rawPriority)) result.priority = 'Medium';
  }

  return result;
}

/**
 * Inbound Email Webhook
 * Receives POST requests from email providers or form webhooks (like Gravity Forms)
 * and automatically creates a support ticket.
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get('secret');
    const expectedSecret = process.env.WEBHOOK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      console.warn('Unauthorized webhook access attempt.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    console.log('Incoming Ticket Webhook Payload:', JSON.stringify(payload, null, 2));

    // Map common email/form webhook fields
    const subject = payload.subject || 'No Subject';
    const textBody = payload.text || payload.body || payload.message || '';
    const fromEmail = payload.from || payload.sender || payload.email || 'Unknown';
    const toEmail = payload.to || '';

    // Auto-extract any attached file or image links from the incoming payload
    const extractedFiles = extractFilesFromPayload(payload);

    // Deep search payload keys for matching fields case-insensitively
    const findInPayload = (keys: string[]) => {
      for (const k of keys) {
        if (payload[k]) return payload[k];
        const foundKey = Object.keys(payload).find(pk => pk.toLowerCase() === k.toLowerCase());
        if (foundKey && payload[foundKey]) return payload[foundKey];
      }
      return null;
    };

    let companyName = findInPayload(['company', 'companyName', 'company_name', 'companyNameField']) || '';
    let contactName = findInPayload(['name', 'contactName', 'contact_name', 'contactNameField', 'requesterName']) || '';
    let email = findInPayload(['email', 'emailAddress', 'fromEmail', 'from', 'sender']) || '';
    let category = findInPayload(['category', 'ticketCategory', 'categoryField']) || '';
    let priority = findInPayload(['priority', 'ticketPriority', 'priorityField']) || 'Medium';

    // Parse email body text to extract fields if not found inside direct keys
    const textParsed = parseFieldsFromText(textBody);
    if (!companyName && textParsed.companyName) companyName = textParsed.companyName;
    if (!contactName && textParsed.contactName) contactName = textParsed.contactName;
    if (!email && textParsed.email) email = textParsed.email;
    if (!category && textParsed.category) category = textParsed.category;
    if (priority === 'Medium' && textParsed.priority) priority = textParsed.priority;

    // Create the ticket in the 'Support Tickets' workspace
    const ticketData: any = {
      projectName: subject,
      description: textBody || 'No content',
      status: 'Not Started',
      priority: priority,
      assignee: '',
      assignees: [],
      assignedToId: '',
      workspace: 'Support Tickets',
      companyName: companyName,
      contactName: contactName,
      email: email,
      category: category,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      order: Date.now(),
      isManual: false,
      notes: `Received via webhook from ${fromEmail || email || 'Unknown'}`,
      files: extractedFiles,
    };

    const docRef = await addDoc(collection(getDb(), 'tickets'), ticketData);

    return NextResponse.json({
      success: true,
      ticketId: docRef.id,
      message: 'Ticket created successfully'
    });
  } catch (err: any) {
    console.error('Error in ticket webhook:', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Failed to process webhook'
    }, { status: 500 });
  }
}

// Support GET for testing/health check
export async function GET() {
  return NextResponse.json({ status: 'Webhook endpoint active' });
}
