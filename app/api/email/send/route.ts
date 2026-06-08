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

export async function POST(req: Request) {
  try {
    const { contactId, to, subject, body, senderName, senderEmail, attachments } = await req.json();

    if (!contactId || !to || !body) {
      writeLog(`Validation Error: Missing required fields. contactId=${contactId}, to=${to}, bodyLength=${body?.length}`);
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getFirestoreAdmin();
    
    // 1. Get Contact info to verify it exists
    const contactRef = db.collection('contacts').doc(contactId);
    const contactSnap = await contactRef.get();
    if (!contactSnap.exists) {
      writeLog(`Error: Contact ${contactId} not found in Firestore`);
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // 2. Determine who sent it (the user).
    const finalSenderEmail = senderEmail || req.headers.get('x-user-email') || "team@awebco.com";

    // 3. Attempt Mailgun transmission if configured
    let sentViaRealProvider = false;
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;
    
    if (apiKey && domain && apiKey !== 'your-mailgun-private-api-key') {
      try {
        const auth = Buffer.from(`api:${apiKey}`).toString('base64');
        const host = process.env.MAILGUN_HOST || 'api.mailgun.net';
        const url = `https://${host}/v3/${domain}/messages`;

        // Create multipart FormData to support binary file attachments
        const formData = new FormData();
        
        let fromAddress = process.env.MAILGUN_FROM_EMAIL || `CRM Notifications <noreply@${domain}>`;
        if (senderName && senderEmail) {
          const emailParts = senderEmail.split('@');
          const prefix = emailParts[0];
          const emailDomain = emailParts[1];
          if (process.env.MAILGUN_FORCE_RAW_SENDER === 'true') {
            fromAddress = `${senderName} <${senderEmail}>`;
          } else if (emailDomain === domain) {
            fromAddress = `${senderName} <${senderEmail}>`;
          } else {
            fromAddress = `${senderName} <${prefix}@${domain}>`;
          }
        }
        
        formData.append('from', fromAddress);
        formData.append('to', to);
        formData.append('subject', subject || '(No Subject)');
        formData.append('text', body);

        // Include Reply-To to direct replies back to our inbound parser
        formData.append('h:Reply-To', `inbound+${contactId}@${domain}`);

        // Download attachments from Firebase and append to Mailgun payload
        if (attachments && Array.isArray(attachments)) {
          for (const att of attachments) {
            const { name, url: fileUrl } = att;
            try {
              const fileRes = await fetch(fileUrl);
              if (fileRes.ok) {
                const fileBlob = await fileRes.blob();
                formData.append('attachment', fileBlob, name);
              } else {
                writeLog(`Failed to fetch attachment from URL: ${fileUrl}. Status=${fileRes.status}`);
              }
            } catch (err: any) {
              writeLog(`Error downloading attachment ${name}: ${err.message || err}`);
            }
          }
        }

        const mailgunRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
          },
          body: formData
        });

        if (mailgunRes.ok) {
          sentViaRealProvider = true;
          writeLog(`Mailgun Success: Sent to=${to}, Subject=${subject}, Domain=${domain}, URL=${url}, From=${fromAddress}, AttachmentsCount=${attachments?.length || 0}`);
          console.log(`[Mailgun] Successfully sent email to ${to}`);
        } else {
          const status = mailgunRes.status;
          const text = await mailgunRes.text();
          writeLog(`Mailgun Error: Status=${status}, Text=${text}, Domain=${domain}, Host=${host}, URL=${url}`);
          console.error(`[Mailgun Error] Status: ${status}, Text: ${text}`);
        }
      } catch (e: any) {
        writeLog(`Mailgun Exception: Message=${e.message || e}`);
        console.error('[Mailgun Exception]', e);
      }
    } else {
      writeLog(`Email Simulation: Skipped Mailgun transmission. apiKey=${apiKey ? 'present' : 'missing'}, domain=${domain || 'missing'}`);
      console.log(`[Email Simulation] Sent to: ${to}, Subject: ${subject}`);
    }

    // 4. Log the activity in Firestore
    const newActivity = {
      contactId,
      type: 'email_sent',
      subject: subject || '(No Subject)',
      body,
      senderEmail: finalSenderEmail,
      recipientEmail: to,
      timestamp: new Date(),
      attachments: attachments && Array.isArray(attachments) 
        ? attachments.map((a: any) => ({ name: a.name, downloadUrl: a.url }))
        : [],
    };

    const docRef = await db.collection('activities').add(newActivity);

    return NextResponse.json({
      success: true,
      activityId: docRef.id,
      sentViaRealProvider
    });
  } catch (error: any) {
    writeLog(`API send Route Exception: Message=${error.message || error}`);
    console.error('Error in send route:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
