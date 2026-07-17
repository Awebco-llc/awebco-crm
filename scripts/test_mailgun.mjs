import fs from 'fs';
import path from 'path';

// Parse .env file manually
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('.env file not found!');
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

async function testMailgun() {
  const env = loadEnv();
  const apiKey = env.MAILGUN_API_KEY;
  const domain = env.MAILGUN_DOMAIN;
  const host = env.MAILGUN_HOST || 'api.mailgun.net';
  const fromEmail = env.MAILGUN_FROM_EMAIL || `CRM Notifications <noreply@${domain}>`;
  
  console.log('--- Mailgun Configurations ---');
  console.log('MAILGUN_API_KEY:', apiKey ? `${apiKey.substring(0, 8)}... (length: ${apiKey.length})` : 'MISSING');
  console.log('MAILGUN_DOMAIN:', domain || 'MISSING');
  console.log('MAILGUN_FROM_EMAIL:', fromEmail);
  console.log('MAILGUN_HOST:', host);
  console.log('-------------------------------\n');

  if (!apiKey || !domain) {
    console.error('Error: MAILGUN_API_KEY or MAILGUN_DOMAIN is missing in .env!');
    return;
  }

  const url = `https://${host}/v3/${domain}/messages`;
  const auth = Buffer.from(`api:${apiKey}`).toString('base64');
  
  // Test sending to a destination email
  // We'll try a default destination
  const to = 'tres3awebco@gmail.com'; 
  const subject = 'CRM Mailgun Integration Diagnostic Test';
  const text = 'Hello! This is a test email sent from the Mailgun diagnostic script to verify the CRM Mailgun connection.';

  console.log(`Attempting to send test email to ${to}...`);
  console.log(`URL: ${url}`);
  console.log(`From: ${fromEmail}`);
  
  const formData = new URLSearchParams();
  formData.append('from', fromEmail);
  formData.append('to', to);
  formData.append('subject', subject);
  formData.append('text', text);

  try {
    // Test 1: Configured domain
    console.log(`--- Test 1: Configured Domain (${domain}) ---`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    console.log(`Response Status: ${response.status} ${response.statusText}`);
    const responseText = await response.text();
    console.log('Response Body:');
    console.log(responseText);
    
    if (response.ok) {
      console.log('\nSUCCESS! Mailgun accepted the message for ' + domain);
    } else {
      console.log('\nFAILURE! Mailgun rejected the request for ' + domain);
    }

    // Test 2: Old domain from logs
    const oldDomain = 'mg.awebco.com';
    if (domain !== oldDomain) {
      console.log(`\n--- Test 2: Old Domain (${oldDomain}) ---`);
      const oldUrl = `https://${host}/v3/${oldDomain}/messages`;
      const oldFromEmail = `CRM Notifications <noreply@${oldDomain}>`;
      const oldFormData = new URLSearchParams();
      oldFormData.append('from', oldFromEmail);
      oldFormData.append('to', to);
      oldFormData.append('subject', subject + ' (Old Domain)');
      oldFormData.append('text', text);

      const oldResponse = await fetch(oldUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: oldFormData.toString(),
      });

      console.log(`Response Status: ${oldResponse.status} ${oldResponse.statusText}`);
      const oldResponseText = await oldResponse.text();
      console.log('Response Body:');
      console.log(oldResponseText);
      
      if (oldResponse.ok) {
        console.log(`\nSUCCESS! Mailgun accepted the message for ${oldDomain}.`);
      } else {
        console.log(`\nFAILURE! Mailgun rejected the request for ${oldDomain}.`);
      }
    }
  } catch (error) {
    console.error('Exception occurred during fetch:', error);
  }
}

testMailgun();
