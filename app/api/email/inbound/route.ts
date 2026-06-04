import { NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebaseAdmin';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    console.log('Incoming Inbound Webhook Payload:', JSON.stringify(payload, null, 2));

    // Common fields for inbound parse (supporting standard formats from Mailgun / SendGrid)
    const sender = payload.sender || payload.from || ''; // e.g. "Jane Doe <jane@acme.com>"
    const recipient = payload.recipient || payload.to || ''; // e.g. "inbound+123@mail.com"
    const subject = payload.subject || '(No Subject)';
    const body = payload.body || payload.text || payload.message || '';

    // Extract sender email address from "Name <email>" format
    let senderEmail = sender;
    const emailMatch = sender.match(/<([^>]+)>/);
    if (emailMatch && emailMatch[1]) {
      senderEmail = emailMatch[1].trim();
    }
    senderEmail = senderEmail.trim().toLowerCase();

    if (!senderEmail) {
      return NextResponse.json({ error: 'Missing sender email' }, { status: 400 });
    }

    const db = getFirestoreAdmin();
    let contactId = '';

    // 1. Try to extract contactId from recipient: e.g. inbound+CONTACT_ID@domain.com
    const recipientMatch = recipient.match(/inbound\+([^@\s]+)/i);
    if (recipientMatch && recipientMatch[1]) {
      const idToCheck = recipientMatch[1].trim();
      // Verify this contact exists in Firestore
      const contactSnap = await db.collection('contacts').doc(idToCheck).get();
      if (contactSnap.exists) {
        contactId = idToCheck;
      }
    }

    // 2. If contactId not found, query contacts collection by email
    if (!contactId) {
      const contactsSnap = await db.collection('contacts')
        .where('email', '==', senderEmail)
        .limit(1)
        .get();
      
      if (!contactsSnap.empty) {
        contactId = contactsSnap.docs[0].id;
      }
    }

    // 3. Fallback: Check case-insensitively by scanning contacts if no direct match
    if (!contactId) {
      const allContactsSnap = await db.collection('contacts').limit(100).get();
      const matchedDoc = allContactsSnap.docs.find(doc => {
        const cEmail = doc.data().email;
        return cEmail && cEmail.toLowerCase() === senderEmail;
      });
      if (matchedDoc) {
        contactId = matchedDoc.id;
      }
    }

    if (!contactId) {
      console.warn(`[Inbound Webhook] Could not match sender ${senderEmail} to any contact.`);
      return NextResponse.json({ error: 'No matching contact found' }, { status: 404 });
    }

    // 4. Log the incoming email as an activity
    const newActivity = {
      contactId,
      type: 'email_received',
      subject,
      body,
      senderEmail,
      recipientEmail: recipient,
      timestamp: new Date(),
    };

    const docRef = await db.collection('activities').add(newActivity);

    return NextResponse.json({
      success: true,
      activityId: docRef.id,
      contactId
    });
  } catch (error: any) {
    console.error('Error in inbound route:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

// Support GET for testing/health check
export async function GET() {
  return NextResponse.json({ status: 'Inbound webhook endpoint active' });
}
