import { NextResponse } from 'next/server';
import { getFirestoreAdmin, getStorageAdmin } from '@/lib/firebaseAdmin';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function writeLog(message: string) {
  try {
    const logPath = path.join(process.cwd(), 'email_logs.txt');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
  } catch (err) {
    console.error('Failed to write log:', err);
  }
}

function verifyMailgunSignature(timestamp: string, token: string, signature: string): boolean {
  const signingKey = process.env.MAILGUN_SIGNING_KEY || process.env.MAILGUN_API_KEY;
  if (!signingKey || signingKey === 'your-mailgun-http-webhook-signing-key' || signingKey === 'your-mailgun-private-api-key') {
    writeLog('Mailgun signature verification skipped: MAILGUN_SIGNING_KEY or MAILGUN_API_KEY is not configured.');
    return true; 
  }
  
  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(timestamp + token);
  const calculatedSignature = hmac.digest('hex');
  
  return calculatedSignature === signature;
}

async function sendMailgunEmail({
  from,
  to,
  subject,
  body,
  replyTo,
  attachments = [],
}: {
  from: string;
  to: string;
  subject: string;
  body: string;
  replyTo: string;
  attachments?: { name: string; url: string }[];
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
            writeLog(`Forwarding Warning: Failed to fetch attachment from URL: ${fileUrl}. Status=${fileRes.status}`);
          }
        } catch (err: any) {
          writeLog(`Forwarding Error downloading attachment ${name}: ${err.message || err}`);
        }
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
      body: formData,
    });
    
    if (res.ok) {
      writeLog(`Forwarding success. To: ${to}, From: ${from}, AttachmentsCount=${attachments?.length || 0}`);
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
    const contentType = req.headers.get('content-type') || '';
    let sender = '';
    let recipient = '';
    let subject = '';
    let body = '';
    let timestamp = '';
    let token = '';
    let signature = '';
    let attachments: { name: string; url: string }[] = [];
    let isMultipart = false;
    let formData: FormData | null = null;

    if (contentType.includes('multipart/form-data')) {
      isMultipart = true;
      formData = await req.formData();
      writeLog(`Incoming Inbound Webhook: Received multipart/form-data`);
      
      sender = (formData.get('sender') as string) || (formData.get('from') as string) || '';
      recipient = (formData.get('recipient') as string) || (formData.get('to') as string) || '';
      subject = (formData.get('subject') as string) || '(No Subject)';
      body = (formData.get('stripped-text') as string) || (formData.get('body-plain') as string) || (formData.get('body') as string) || '';
      
      timestamp = (formData.get('timestamp') as string) || '';
      token = (formData.get('token') as string) || '';
      signature = (formData.get('signature') as string) || '';
    } else {
      const payload = await req.json();
      writeLog(`Incoming Inbound Webhook Payload (JSON): ${JSON.stringify(payload, null, 2)}`);
      
      sender = payload.sender || payload.from || '';
      recipient = payload.recipient || payload.to || '';
      subject = payload.subject || '(No Subject)';
      body = payload['stripped-text'] || payload.body || payload.text || payload.message || '';
      
      timestamp = payload.timestamp || '';
      token = payload.token || '';
      signature = payload.signature || '';
    }

    // Verify Mailgun signature if it's a multipart request (real webhook)
    const hasSigningKey = !!(process.env.MAILGUN_SIGNING_KEY || process.env.MAILGUN_API_KEY);
    if (isMultipart && hasSigningKey) {
      if (!timestamp || !token || !signature) {
        writeLog('Inbound Warning: multipart/form-data received but signature fields are missing.');
      } else {
        const isValid = verifyMailgunSignature(timestamp, token, signature);
        if (!isValid) {
          writeLog(`Inbound Error: Mailgun signature verification failed. timestamp=${timestamp}, token=${token}, signature=${signature}`);
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
        writeLog('Mailgun signature successfully verified.');
      }
    }

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

    // 3b. Parse and upload attachments if this is a multipart request
    if (isMultipart && formData && contactId) {
      const attachmentCount = parseInt((formData.get('attachment-count') as string) || '0', 10);
      if (attachmentCount > 0) {
        writeLog(`Inbound: Parsing ${attachmentCount} attachments from form-data`);
        try {
          const bucket = getStorageAdmin();
          
          for (let i = 1; i <= attachmentCount; i++) {
            const file = formData.get(`attachment-${i}`) as File | null;
            if (file && file.size > 0) {
              try {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                const uniqueName = `${Date.now()}_${cleanFileName}`;
                const destPath = `email_attachments/${contactId}/${uniqueName}`;
                const bucketFile = bucket.file(destPath);
                
                await bucketFile.save(buffer, {
                  metadata: {
                    contentType: file.type || 'application/octet-stream',
                  }
                });
                
                const [downloadUrl] = await bucketFile.getSignedUrl({
                  action: 'read',
                  expires: '01-01-2076',
                });
                
                attachments.push({
                  name: file.name,
                  url: downloadUrl
                });
                writeLog(`Inbound Attachment Success: Saved ${file.name} to ${destPath}`);
              } catch (attErr: any) {
                writeLog(`Inbound Attachment Error: Failed to process attachment-${i} (${file?.name}): ${attErr.message || attErr}`);
              }
            }
          }
        } catch (storageErr: any) {
          writeLog(`Inbound Attachment Storage Error: Failed to initialize storage bucket: ${storageErr.message || storageErr}`);
        }
      }
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
          attachments: attachments,
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
          attachments: attachments,
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
      attachments: attachments,
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
