import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

/**
 * Inbound Email Webhook
 * Receives POST requests from email providers or form webhooks (like Gravity Forms)
 * and automatically creates a support ticket using Admin privileges.
 */
export async function POST(req: Request) {
  try {
    const payload = await req.json();
    console.log('Incoming Ticket Webhook Payload:', JSON.stringify(payload, null, 2));
    
    // Map common email/form webhook fields
    const subject = payload.subject || 'No Subject';
    const textBody = payload.text || payload.body || payload.message || '';
    const fromEmail = payload.from || payload.sender || payload.email || 'Unknown';

    // Create the ticket in the 'Support Tickets' workspace
    const ticketData = {
      projectName: subject,
      description: textBody || 'No content',
      status: 'Not Started',
      priority: 'Medium',
      assignee: '', 
      workspace: 'Support Tickets',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      order: Date.now(),
      isManual: false,
      notes: `Received via webhook from ${fromEmail}`,
    };

    const db = getAdminDb();
    const docRef = await db.collection('tickets').add(ticketData);

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
