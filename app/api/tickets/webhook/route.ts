import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Inbound Email Webhook
 * Receives POST requests from email providers (SendGrid, Postmark, etc.)
 * and automatically creates a support ticket.
 */
export async function POST(req: Request) {
  try {
    const payload = await req.json();
    
    // Map common email webhook fields
    // This is a generic implementation. You may need to adjust field names
    // based on your specific email provider's webhook payload structure.
    const subject = payload.subject || 'No Subject';
    const textBody = payload.text || payload.body || '';
    const htmlBody = payload.html || '';
    const fromEmail = payload.from || payload.sender || 'Unknown';
    const toEmail = payload.to || '';

    // Create the ticket in the 'Support Tickets' workspace
    const ticketData = {
      projectName: subject,
      description: textBody || htmlBody.replace(/<[^>]*>?/gm, '') || 'No content',
      status: 'Not Started',
      priority: 'Medium',
      assignee: '', // Unassigned by default
      workspace: 'Support Tickets',
      companyId: '', // We could potentially look up company by email domain here
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      order: Date.now(), // High timestamp to put at bottom
      isManual: false,
      notes: `Received via email from ${fromEmail}`,
      originalEmail: {
        from: fromEmail,
        to: toEmail,
        subject: subject,
        receivedAt: new Date().toISOString()
      }
    };

    const docRef = await db.collection('tickets').add(ticketData);

    return NextResponse.json({ 
      success: true, 
      ticketId: docRef.id,
      message: 'Ticket created successfully' 
    });
  } catch (err) {
    console.error('Error in ticket webhook:', err);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to process webhook' 
    }, { status: 500 });
  }
}

// Support GET for testing/health check
export async function GET() {
  return NextResponse.json({ status: 'Webhook endpoint active' });
}
