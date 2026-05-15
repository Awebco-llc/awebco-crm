import { NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Inbound Email Webhook
 * Receives POST requests from email providers or form webhooks (like Gravity Forms)
 * and automatically creates a support ticket.
 */
export async function POST(req: Request) {
  try {
    const payload = await req.json();
    console.log('Incoming Ticket Webhook Payload:', JSON.stringify(payload, null, 2));
    
    // Map common email/form webhook fields
    const subject = payload.subject || 'No Subject';
    const textBody = payload.text || payload.body || payload.message || '';
    const fromEmail = payload.from || payload.sender || payload.email || 'Unknown';
    const toEmail = payload.to || '';

    // Create the ticket in the 'Support Tickets' workspace
    const ticketData: any = {
      projectName: subject,
      description: textBody || 'No content',
      status: 'Not Started',
      priority: 'Medium',
      assignee: '', 
      workspace: 'Support Tickets',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      order: Date.now(),
      isManual: false,
      notes: `Received via webhook from ${fromEmail}`,
    };

    const docRef = await addDoc(collection(getDb(), 'tickets'), ticketData);

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
