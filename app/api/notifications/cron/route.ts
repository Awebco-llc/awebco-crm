import { NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  writeBatch, 
  serverTimestamp, 
  query, 
  where,
  addDoc 
} from 'firebase/firestore';

async function runNotificationCheck() {
  const db = getDb();
  
  // 1. Get all users
  const usersSnap = await getDocs(collection(db, 'users'));
  const users = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
  
  // Filter opted-in users (emailNotificationsEnabled !== false and has email)
  const optedInUsers = users.filter(u => u.emailNotificationsEnabled !== false && u.email);
  if (optedInUsers.length === 0) {
    console.log('[Cron Check] No opted-in users found for notifications.');
    return { success: true, message: 'No opted-in users' };
  }
  
  // 2. Fetch all unread messages
  const messagesSnap = await getDocs(query(collection(db, 'messages'), where('read', '==', false)));
  const unreadMessages = messagesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  const pendingMessages = unreadMessages.filter(m => !m.emailed);
  
  // 3. Fetch tickets
  const ticketsSnap = await getDocs(collection(db, 'tickets'));
  const tickets = ticketsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  
  // 4. Fetch deals
  const dealsSnap = await getDocs(collection(db, 'deals'));
  const deals = dealsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  
  const messagesToUpdate: string[] = [];
  const ticketsToUpdate: { id: string; emailedAssignees: string[] }[] = [];
  const dealsToUpdate: { id: string; emailedAssignees: string[] }[] = [];
  
  let processedCount = 0;
  
  for (const user of optedInUsers) {
    const userId = user.id;
    const userEmail = user.email;
    const userName = user.name;
    
    // Find unread messages for this user
    const userMessages = pendingMessages.filter(m => m.receiverId === userId);
    
    // Find newly assigned tickets for this user
    const userTickets = tickets.filter(t => {
      const isAssigned = t.assignee === userId || 
                         (Array.isArray(t.assignees) && t.assignees.includes(userId)) ||
                         (t.assignedToId === userId);
      const alreadyEmailed = Array.isArray(t.emailedAssignees) && t.emailedAssignees.includes(userId);
      return isAssigned && !alreadyEmailed;
    });
    
    // Find newly assigned deals for this user
    const userDeals = deals.filter(d => {
      const isAssigned = d.assignedToId === userId;
      const alreadyEmailed = Array.isArray(d.emailedAssignees) && d.emailedAssignees.includes(userId);
      return isAssigned && !alreadyEmailed;
    });
    
    // If there is anything to notify this user about, send the digest email
    if (userMessages.length > 0 || userTickets.length > 0 || userDeals.length > 0) {
      processedCount++;
      
      // Construct the HTML digest
      let emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E2E4E9; border-radius: 8px;">
          <h2 style="color: #1061E3; margin-bottom: 24px;">Awebco CRM Notifications Digest</h2>
          <p>Hello ${userName},</p>
          <p>You have new activity waiting for you on the Awebco CRM platform:</p>
      `;
      
      if (userMessages.length > 0) {
        emailHtml += `
          <div style="margin-top: 20px; padding: 15px; background-color: #F9FAFB; border-left: 4px solid #1061E3; border-radius: 4px; margin-bottom: 20px;">
            <h3 style="margin-top: 0; color: #1C1F23;">Unread Inbox Messages (${userMessages.length})</h3>
            <ul style="padding-left: 20px; color: #4A4D53;">
        `;
        userMessages.forEach(msg => {
          const sender = users.find(u => u.id === msg.senderId);
          const senderName = sender?.name || 'Someone';
          emailHtml += `
            <li style="margin-bottom: 8px;">
              <strong>From ${senderName}:</strong> "${msg.text}"
            </li>
          `;
          messagesToUpdate.push(msg.id);
        });
        emailHtml += `
            </ul>
            <p style="margin-bottom: 0;">
              <a href="http://localhost:3000/?nav=Inbox" style="color: #1061E3; font-weight: bold; text-decoration: none;">Click here to view your Inbox</a>
            </p>
          </div>
        `;
      }
      
      if (userTickets.length > 0) {
        emailHtml += `
          <div style="margin-top: 20px; padding: 15px; background-color: #F9FAFB; border-left: 4px solid #F59E0B; border-radius: 4px; margin-bottom: 20px;">
            <h3 style="margin-top: 0; color: #1C1F23;">New Task/Ticket Assignments (${userTickets.length})</h3>
            <ul style="padding-left: 20px; color: #4A4D53;">
        `;
        userTickets.forEach(ticket => {
          emailHtml += `
            <li style="margin-bottom: 8px;">
              <strong>${ticket.projectName}</strong> - Priority: ${ticket.priority || 'Medium'}
            </li>
          `;
          
          const currentEmailed = Array.isArray(ticket.emailedAssignees) ? ticket.emailedAssignees : [];
          ticketsToUpdate.push({
            id: ticket.id,
            emailedAssignees: [...currentEmailed, userId]
          });
        });
        emailHtml += `
            </ul>
            <p style="margin-bottom: 0;">
              <a href="http://localhost:3000/?nav=My Tasks" style="color: #1061E3; font-weight: bold; text-decoration: none;">Click here to view My Tasks</a>
            </p>
          </div>
        `;
      }
      
      if (userDeals.length > 0) {
        emailHtml += `
          <div style="margin-top: 20px; padding: 15px; background-color: #F9FAFB; border-left: 4px solid #10B981; border-radius: 4px; margin-bottom: 20px;">
            <h3 style="margin-top: 0; color: #1C1F23;">New Deal Assignments (${userDeals.length})</h3>
            <ul style="padding-left: 20px; color: #4A4D53;">
        `;
        userDeals.forEach(deal => {
          emailHtml += `
            <li style="margin-bottom: 8px;">
              <strong>${deal.name}</strong> - Value: ${deal.value || '-'} | Step: ${deal.currentStep}
            </li>
          `;
          
          const currentEmailed = Array.isArray(deal.emailedAssignees) ? deal.emailedAssignees : [];
          dealsToUpdate.push({
            id: deal.id,
            emailedAssignees: [...currentEmailed, userId]
          });
        });
        emailHtml += `
            </ul>
            <p style="margin-bottom: 0;">
              <a href="http://localhost:3000/?nav=Deals / Sales" style="color: #1061E3; font-weight: bold; text-decoration: none;">Click here to view Deals / Sales</a>
            </p>
          </div>
        `;
      }
      
      emailHtml += `
          <p style="margin-top: 30px; font-size: 11px; color: #8E9299; border-top: 1px solid #E2E4E9; padding-top: 15px;">
            You are receiving this because email notifications are enabled on your profile. 
            You can change your settings inside your Profile tab.
          </p>
        </div>
      `;
      
      const subject = `[Awebco CRM] New Notifications Digest`;
      
      console.log(`\n======================================================`);
      console.log(`[EMAIL SIMULATOR] SENDING EMAIL DIGEST TO: ${userEmail}`);
      console.log(`SUBJECT: ${subject}`);
      console.log(`BODY:`);
      console.log(emailHtml);
      console.log(`======================================================\n`);
      
      await addDoc(collection(db, 'sent_emails'), {
        to: userEmail,
        userId: userId,
        subject: subject,
        body: emailHtml,
        timestamp: serverTimestamp()
      });
    }
  }
  
  if (messagesToUpdate.length > 0 || ticketsToUpdate.length > 0 || dealsToUpdate.length > 0) {
    const batch = writeBatch(db);
    
    messagesToUpdate.forEach(id => {
      batch.update(doc(db, 'messages', id), { emailed: true });
    });
    
    ticketsToUpdate.forEach(item => {
      batch.update(doc(db, 'tickets', item.id), { emailedAssignees: item.emailedAssignees });
    });
    
    dealsToUpdate.forEach(item => {
      batch.update(doc(db, 'deals', item.id), { emailedAssignees: item.emailedAssignees });
    });
    
    await batch.commit();
    console.log(`[Cron Check] Updated emailed status for ${messagesToUpdate.length} messages, ${ticketsToUpdate.length} tickets, and ${dealsToUpdate.length} deals.`);
  }
  
  console.log(`[Cron Check] Processed digests for ${processedCount} users.`);
  return { success: true, processedUsers: processedCount };
}

// Singleton tracker for dev server background loop
if (typeof globalThis !== 'undefined') {
  if (!(globalThis as any)._notificationIntervalSet) {
    const isDev = process.env.NODE_ENV === 'development';
    const intervalMs = isDev ? 60 * 1000 : 30 * 60 * 1000;
    
    setInterval(() => {
      console.log('[Background Cron] Running scheduled notification check...');
      runNotificationCheck().catch(err => {
        console.error('[Background Cron Error]', err);
      });
    }, intervalMs);
    
    (globalThis as any)._notificationIntervalSet = true;
    console.log(`[Background Cron] Registered singleton interval every ${isDev ? '1 minute' : '30 minutes'}.`);
  }
}

export async function GET() {
  try {
    const res = await runNotificationCheck();
    return NextResponse.json({ status: 'Success', ...res });
  } catch (err: any) {
    console.error('Error in cron run:', err);
    return NextResponse.json({ status: 'Error', error: err.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const res = await runNotificationCheck();
    return NextResponse.json({ status: 'Success', ...res });
  } catch (err: any) {
    console.error('Error in cron run:', err);
    return NextResponse.json({ status: 'Error', error: err.message }, { status: 500 });
  }
}
