import { NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebaseAdmin';

export async function POST(req: Request) {
  try {
    const { contactId, to, subject, body } = await req.json();

    if (!contactId || !to || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getFirestoreAdmin();
    
    // 1. Get Contact info to verify it exists
    const contactRef = db.collection('contacts').doc(contactId);
    const contactSnap = await contactRef.get();
    if (!contactSnap.exists) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // 2. Determine who sent it (the user).
    // In our backend API, we fallback to standard team email or headers if set.
    const senderEmail = req.headers.get('x-user-email') || "team@awebco.com";

    // 3. Attempt Mailgun transmission if configured
    let sentViaRealProvider = false;
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;
    if (apiKey && domain && apiKey !== 'your-mailgun-private-api-key') {
      try {
        const auth = Buffer.from(`api:${apiKey}`).toString('base64');
        const host = process.env.MAILGUN_HOST || 'api.mailgun.net';
        const url = `https://${host}/v3/${domain}/messages`;

        const formData = new URLSearchParams();
        formData.append('from', process.env.MAILGUN_FROM_EMAIL || `CRM Notifications <noreply@${domain}>`);
        formData.append('to', to);
        formData.append('subject', subject || '(No Subject)');
        formData.append('text', body);

        // Include Reply-To to direct replies back to our inbound parser
        formData.append('h:Reply-To', `inbound+${contactId}@awebco-crm.com`);

        const mailgunRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString()
        });

        if (mailgunRes.ok) {
          sentViaRealProvider = true;
          console.log(`[Mailgun] Successfully sent email to ${to}`);
        } else {
          console.error(`[Mailgun Error] Status: ${mailgunRes.status}, Text: ${await mailgunRes.text()}`);
        }
      } catch (e) {
        console.error('[Mailgun Exception]', e);
      }
    } else {
      console.log(`[Email Simulation] Sent to: ${to}, Subject: ${subject}`);
    }

    // 4. Log the activity in Firestore
    const newActivity = {
      contactId,
      type: 'email_sent',
      subject: subject || '(No Subject)',
      body,
      senderEmail,
      recipientEmail: to,
      timestamp: new Date(),
    };

    const docRef = await db.collection('activities').add(newActivity);

    return NextResponse.json({
      success: true,
      activityId: docRef.id,
      sentViaRealProvider
    });
  } catch (error: any) {
    console.error('Error in send route:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
