import { NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebaseAdmin';
import fs from 'fs';
import path from 'path';

function writeLog(message: string) {
  try {
    const logPath = path.join(process.cwd(), 'email_logs.txt');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
  } catch (err) {
    console.error('Failed to write log:', err);
  }
}

async function sendMailgunEmail({
  from,
  to,
  subject,
  body,
  replyTo,
}: {
  from: string;
  to: string;
  subject: string;
  body: string;
  replyTo: string;
}) {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  if (!apiKey || !domain || apiKey === 'your-mailgun-private-api-key') {
    writeLog(`Forwarding skipped (Simulation Mode). To: ${to}, From: ${from}`);
    return false;
  }

  try {
    const auth = Buffer.from(`api:${apiKey}`).toString('base64');
    const host = process.env.MAILGUN_HOST || 'api.mailgun.net';
    const url = `https://${host}/v3/${domain}/messages`;

    const formData = new FormData();
    formData.append('from', from);
    formData.append('to', to);
    formData.append('subject', subject);
    formData.append('text', body);
    formData.append('h:Reply-To', replyTo);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
      body: formData,
    });
    
    if (res.ok) {
      writeLog(`Forwarding success. To: ${to}, From: ${from}`);
      return true;
    } else {
      writeLog(`Forwarding failed. Status: ${res.status}, Body: ${await res.text()}`);
      return false;
    }
  } catch (err: any) {
    writeLog(`Forwarding error: ${err.message || err}`);
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    writeLog(`Incoming Inbound Webhook Payload: ${JSON.stringify(payload, null, 2)}`);

    // Common fields for inbound parse (supporting standard formats from Mailgun / SendGrid)
    const sender = payload.sender || payload.from || ''; // e.g. "Jane Doe <jane@acme.com>"
    const recipient = payload.recipient || payload.to || ''; // e.g. "inbound+123@mail.com"
    const subject = payload.subject || '(No Subject)';
    
    // Prefer stripped-text (excludes historical email chains) to keep logs clean
    const body = payload['stripped-text'] || payload.body || payload.text || payload.message || '';

    // Extract sender email address from "Name <email>" format
    let senderEmail = sender;
    const emailMatch = sender.match(/<([^>]+)>/);
    if (emailMatch && emailMatch[1]) {
      senderEmail = emailMatch[1].trim();
    }
    senderEmail = senderEmail.trim().toLowerCase();

    if (!senderEmail) {
      writeLog('Inbound Error: Missing sender email');
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
      writeLog(`Inbound Warning: Could not match sender ${senderEmail} to any contact.`);
      return NextResponse.json({ error: 'No matching contact found' }, { status: 404 });
    }

    // 4. Fetch Contact Details
    const contactSnap = await db.collection('contacts').doc(contactId).get();
    const contactData = contactSnap.data();
    const customerEmail = contactData?.email || '';
    const customerName = contactData ? `${contactData.firstName} ${contactData.lastName}` : 'Client';

    // 5. Query if the sender is a registered team member
    const usersSnap = await db.collection('users')
      .where('email', '==', senderEmail)
      .limit(1)
      .get();
      
    const isTeamMember = !usersSnap.empty;
    const teamMemberProfile = isTeamMember ? usersSnap.docs[0].data() : null;

    let activityType: 'email_sent' | 'email_received' = 'email_received';
    const domain = process.env.MAILGUN_DOMAIN || 'mg.awebco.com';

    if (isTeamMember && teamMemberProfile) {
      // ── TYPE A: Team Member replying from Outlook ──────────────────────────
      activityType = 'email_sent';
      writeLog(`Inbound: Detected team member reply from ${senderEmail} for contact ${contactId}`);

      // Forward reply to the customer
      if (customerEmail) {
        const mailFrom = `${teamMemberProfile.name} <inbound+${contactId}@${domain}>`;
        await sendMailgunEmail({
          from: mailFrom,
          to: customerEmail,
          subject: subject,
          body: body,
          replyTo: `inbound+${contactId}@${domain}`,
        });
      }
    } else {
      // ── TYPE B: Customer sending/replying ──────────────────────────────────
      activityType = 'email_received';
      writeLog(`Inbound: Detected customer reply from ${senderEmail} for contact ${contactId}`);

      // Find assigned team member to forward the email to
      const assignedToId = contactData?.assignedToId;
      let forwardToEmail = '';
      
      if (assignedToId) {
        const userSnap = await db.collection('users').doc(assignedToId).get();
        if (userSnap.exists) {
          forwardToEmail = userSnap.data()?.email || '';
        }
      }

      // Fallback to the default system sender email if no user is assigned
      if (!forwardToEmail) {
        const fromEmailEnv = process.env.MAILGUN_FROM_EMAIL || '';
        const envEmailMatch = fromEmailEnv.match(/<([^>]+)>/);
        forwardToEmail = envEmailMatch ? envEmailMatch[1] : fromEmailEnv;
      }

      if (forwardToEmail) {
        const mailFrom = `${customerName} (via CRM) <inbound+${contactId}@${domain}>`;
        await sendMailgunEmail({
          from: mailFrom,
          to: forwardToEmail,
          subject: `[CRM] Re: ${subject}`,
          body: body,
          replyTo: `inbound+${contactId}@${domain}`,
        });
      }
    }

    // 6. Log the email as an activity on the timeline
    const newActivity = {
      contactId,
      type: activityType,
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
    writeLog(`Error in inbound route: ${error.message || error}`);
    console.error('Error in inbound route:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

// Support GET for testing/health check
export async function GET() {
  return NextResponse.json({ status: 'Inbound webhook endpoint active' });
}
