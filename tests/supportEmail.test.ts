import assert from "node:assert/strict";
import test from "node:test";
import {
  supportEmailContent,
  supportEmailOriginal,
  supportMessagePresentation,
  supportNotification,
  type SupportEmailOriginal,
} from "../lib/supportEmail";
const original = (
  plain: string,
  extra: Partial<SupportEmailOriginal> = {},
): SupportEmailOriginal => ({
  plain,
  html: [],
  strippedHtml: [],
  contentIds: {},
  ...extra,
});

test("Mailgun originals retain full bodies, all HTML parts, provider clues and CID metadata verbatim", () => {
  const form = new FormData();
  form.set("body-plain", "Reply\r\nHistory\r\nSignature");
  form.append("body-html", "<p>Reply</p>");
  form.append("body-html", "<p>Second MIME part</p>");
  form.set("stripped-text", "");
  form.set("stripped-signature", "Signature");
  form.set("stripped-html", "<p>Reply</p>");
  form.set("content-id-map", JSON.stringify({ "<logo>": "attachment-1" }));
  const result = supportEmailOriginal(form, "Incorrect stripped fallback");
  assert.equal(result.plain, "Reply\r\nHistory\r\nSignature");
  assert.equal(result.strippedText, "");
  assert.equal(result.strippedSignature, "Signature");
  assert.deepEqual(result.html, ["<p>Reply</p>", "<p>Second MIME part</p>"]);
  assert.deepEqual(result.strippedHtml, ["<p>Reply</p>"]);
  assert.deepEqual(result.contentIds, { "<logo>": "attachment-1" });
  form.delete("body-plain");
  assert.equal(supportEmailOriginal(form, "Stripped reply only").plain, "");
  form.set("content-id-map", "broken");
  assert.deepEqual(supportEmailOriginal(form).contentIds, {});
});

test("missing or empty stripped fields never erase a reply with no signature", () => {
  for (const extra of [
    {},
    { strippedText: "" },
    { strippedText: "First paragraph." },
  ]) {
    const raw = "First paragraph.\nPlease keep the second instruction too.";
    const result = supportMessagePresentation("email-no-signature", {
      email_original: original(raw, extra),
    });
    assert.equal(result.text, raw);
    assert.equal(result.signature, "");
    assert.equal(result.quoted, "");
  }
  const raw = "New reply.\nJamie Client\n217-555-0100\nPlease update the page.";
  const result = supportEmailContent(
    raw,
    original(raw, {
      html: [
        '<p>New reply.</p><div class="gmail_signature">Jamie Client<br>217-555-0100<br>Please update the page.</div>',
      ],
    }),
  );
  assert.match(result.text, /Please update the page/);
  assert.equal(result.signature, "");
});

test("provider signatures and standard separators need corroborating contact structure, never a sender name", () => {
  const signature =
    "Jamie Client\nBusiness Manager\n(217) 555-0100\nhttps://example.com/";
  const raw = `The updated photo looks good.\n\n${signature}`;
  assert.equal(supportEmailContent(raw).signature, "");
  assert.equal(
    supportEmailContent(raw, original(raw, { strippedSignature: signature }))
      .text,
    "The updated photo looks good.",
  );
  assert.match(
    supportEmailContent(`Approved.\n--\n${signature}`).signature,
    /Jamie Client/,
  );
  for (const request of [
    "Please add this contact block.\n--\nJamie Client\n(217) 555-0100\nPlease include the number on the page.",
    "Here are the page details.\nJamie Client\n(217) 555-0100\nhttps://example.com/",
    "Thanks\nPlease change the header.",
    "Please use this contact block:\n\nJamie Client\n217-555-0100\nhttps://example.com/",
    "Please show this example:\n> Use this instruction.\nThank you.",
  ]) {
    const result = supportEmailContent(
      request,
      original(request, {
        strippedSignature: request.split("\n").slice(1).join("\n"),
      }),
    );
    assert.equal(result.signature, "");
    assert.equal(result.text, request);
  }
});

test("Outlook/iPhone/Android terminal mobile footers collapse without hiding instructions", () => {
  for (const footer of [
    "Get Outlook for iOS<https://aka.ms/o0ukef>",
    "Get Outlook for Android",
    "Sent from my iPhone",
    "Sent from my iPad",
    "Sent from my Android device",
  ]) {
    const result = supportEmailContent(
      `Final reply verification\r\n\r\n${footer}\r\n`,
    );
    assert.equal(result.text, "Final reply verification");
    assert.ok(result.signature);
    const request = `${footer}\nPlease include that link on the page.`;
    assert.equal(
      supportEmailContent(request).text,
      request.replace(
        "iOS<https://aka.ms/o0ukef>",
        "iOS (https://aka.ms/o0ukef)",
      ),
    );
  }
});

test("plain-text quoted paragraphs collapse individually while interleaved and bottom replies remain visible", () => {
  const raw =
    "First answer.\n\nOn Fri, Awebco wrote:\n> Old question one?\nUse the blue photo.\n> Old question two?\nKeep the existing number.";
  const result = supportEmailContent(
    raw,
    original(raw, { strippedText: "First answer." }),
  );
  assert.match(result.text, /Use the blue photo/);
  assert.match(result.text, /Keep the existing number/);
  assert.ok(!result.text.includes("Old question"));
  assert.match(result.quoted, /Old question one/);
  assert.match(result.quoted, /Old question two/);
  // A quote-only message is expanded instead of presenting an empty reply.
  assert.equal(
    supportEmailContent(
      "> This entire message is quoted",
      original("> This entire message is quoted", { strippedText: "quoted" }),
    ).quoted,
    "",
  );
});

test("Gmail/Outlook/Thunderbird HTML preserves interleaved replies and uses marked signature blocks", () => {
  for (const marker of [
    'class="gmail_signature"',
    'id="Signature"',
    'class="moz-signature"',
  ]) {
    const raw =
      "Approved.\nOld question?\nUse the green image.\nJamie Client\n217-555-0100";
    const html = `<div>Approved.</div><blockquote>Old question?</blockquote><div>Use the green image.</div><div ${marker}>Jamie Client<br>217-555-0100</div>`;
    const result = supportEmailContent(
      raw,
      original(raw, { html: [html], strippedText: "Approved." }),
    );
    assert.match(result.text, /Use the green image/);
    assert.ok(!result.text.includes("Old question"));
    assert.match(result.signature, /217-555/);
    assert.match(result.quoted, /Old question/);
  }
});

test("HTML alternatives and provider disagreements fall back conservatively", () => {
  const raw = "New reply.\nImportant client instruction.";
  const result = supportEmailContent(
    raw,
    original(raw, {
      html: [
        "<div>New reply.</div><blockquote>Important client instruction.</blockquote>",
      ],
      strippedText: raw,
    }),
  );
  assert.equal(result.text, raw);
  assert.equal(result.quoted, "");
  const mismatch = supportEmailContent(
    raw,
    original(raw, { html: ["<p>New reply.</p>"], strippedText: "New reply." }),
  );
  assert.equal(mismatch.text, raw);
  const strippedHtml = supportEmailContent(
    raw,
    original(raw, {
      html: [
        "<p>New reply.</p><blockquote>Important client instruction.</blockquote>",
      ],
      strippedHtml: ["<p>Important client instruction.</p>"],
    }),
  );
  assert.equal(strippedHtml.text, raw);
  const uncertain =
    "Done.\nFrom: Client\nSent: Friday\nSubject: Request\nPlease retain this inline instruction.";
  assert.equal(
    supportEmailContent(
      uncertain,
      original(uncertain, { strippedText: "Done." }),
    ).text,
    uncertain,
  );
});

test("Outlook table signatures, CID alt labels and corroborated history preserve interleaved answers", () => {
  const signature =
    "[cid:portrait]\nJamie Client\nBusiness Manager\n📞 (217) 555-0100\n📍 100 Example St. Example City, IL\n[network icon]<https://example.com/social>";
  const reply =
    "Verification reply.\nWhich photo?\nUse the green photo.\nWhich number?\nKeep the existing number.";
  const signatureHtml =
    '<div id="Signature"><table><tr><td><img src="cid:portrait"></td><td><p>Jamie Client<br>Business Manager</p><p>📞 (217) 555-0100<br>📍 100 Example St. Example City, IL</p><a href="https://example.com/social"><img src="cid:network" alt="network icon"></a></td></tr></table></div>';
  const replyHtml =
    "<p>Verification reply.</p><blockquote>Which photo?</blockquote><p>Use the green photo.</p><blockquote>Which number?</blockquote><p>Keep the existing number.</p>";
  const header = "From: Support\nSent: Friday\nTo: Client\nSubject: Request";
  const raw = `${signature}\n${reply}\n________________________________\n${header}\nEarlier message.`;
  const email = original(raw, {
    html: [
      `${signatureHtml}${replyHtml}<hr><div id="divRplyFwdMsg">${header.replaceAll("\n", "<br>")}</div><div>Earlier message.</div>`,
    ],
    strippedText: `${signature}\n${reply}`,
    // Mailgun can retain a blockquote in stripped-text but remove it from HTML.
    strippedHtml: [
      signatureHtml +
        replyHtml.replace("<blockquote>Which number?</blockquote>", ""),
    ],
  });
  const result = supportMessagePresentation("email-outlook", {
    email_original: email,
    email_attachment_cids: {
      portrait: ["portrait"],
      network: ["network"],
      screenshot: ["unknown"],
    },
    attachments: [
      { id: "portrait", name: "image.png" },
      { id: "network", name: "image.png" },
      { id: "screenshot", name: "screenshot.png" },
      { id: "notes", name: "notes.txt" },
    ],
  });
  assert.match(result.text, /Verification reply/);
  assert.match(result.text, /Use the green photo/);
  assert.match(result.text, /Keep the existing number/);
  assert.doesNotMatch(
    result.text,
    /Jamie Client|Which photo|Which number|Earlier message/,
  );
  assert.match(result.signature, /100 Example St/);
  assert.match(result.quoted, /Which photo/);
  assert.match(result.quoted, /Earlier message/);
  assert.deepEqual(
    result.inline.map((file) => file.id),
    ["portrait", "network"],
  );
  assert.deepEqual(
    result.attachments.map((file) => file.id),
    ["screenshot", "notes"],
  );
  assert.equal(result.original, raw);

  // The Outlook boundary alone is insufficient to hide an unmarked suffix.
  const uncertain = supportEmailContent(raw, {
    ...email,
    strippedHtml: [],
    strippedText: undefined,
  });
  assert.match(uncertain.text, /Earlier message/);
  // A provider's unquoted answer inside proposed history must remain visible.
  const edited = supportEmailContent(raw, {
    ...email,
    strippedText: "Earlier message.",
    strippedHtml: ["<p>Earlier message.</p>"],
  });
  assert.match(edited.text, /Earlier message/);
  assert.equal(edited.quoted, "");
});

test("HTML-only content is readable, escaped by consumers and retained as a download, never executed", () => {
  const result = supportMessagePresentation("email-html", {
    email_original: original("", {
      html: [
        '<p>Use &amp; keep the photo.</p><script>alert(1)</script><img src="https://tracking.example/pixel">',
      ],
    }),
  });
  assert.equal(result.text, "Use & keep the photo.");
  assert.ok(!result.text.includes("<script>"));
  assert.ok(!result.text.includes("tracking.example"));
});

test("only CID files referenced exclusively inside collapsed blocks move out of the main attachment list", () => {
  const raw =
    "See screenshot.\n[cid:screen]\nJamie Client\n217-555-0100\n[cid:logo]";
  const html =
    '<div>See screenshot.<img src="cid:screen"></div><div class="gmail_signature">Jamie Client<br>217-555-0100<br><img src="cid:logo"></div>';
  const result = supportMessagePresentation("email-files", {
    email_original: original(raw, { html: [html] }),
    email_attachment_cids: {
      logo: ["logo"],
      screen: ["screen"],
      shared: ["screen", "logo"],
    },
    attachments: [
      { id: "logo", name: "brand.png" },
      { id: "screen", name: "screenshot.png" },
      { id: "pdf", name: "report.pdf" },
      { id: "unknown", name: "img-40bcfe0f-b228-4fe5-a802-319ff8974db1.jpeg" },
      { id: "shared", name: "shared.png" },
    ],
  });
  assert.deepEqual(
    result.inline.map((file) => file.id),
    ["logo"],
  );
  assert.deepEqual(
    result.attachments.map((file) => file.id),
    ["screen", "pdf", "unknown", "shared"],
  );
  assert.equal(result.original, raw);
  const legacy = supportMessagePresentation("email-old", {
    text: "Done.",
    inline_attachment_ids: ["image"],
    attachments: [{ id: "image", name: "image.png" }],
  });
  assert.equal(legacy.attachments.length, 1);
});

test("typed CRM and Portal messages stay unchanged even with email-like metadata or signatures", () => {
  const text =
    "Answer.\n--\nJamie Client\n217-555-0100\nOn Fri, Awebco wrote:\n> History";
  const result = supportMessagePresentation("normal-uuid", {
    text,
    email_original: original("different"),
    email_attachment_cids: { image: ["logo"] },
    attachments: [{ id: "image", name: "image.png" }],
  });
  assert.equal(result.text, text);
  assert.equal(result.signature, "");
  assert.equal(result.quoted, "");
  assert.equal(result.original, undefined);
  assert.equal(result.attachments.length, 1);
});

test("support email HTML escapes message content and provides a single branded ticket action", () => {
  const result = supportNotification({
    title: "Update <script>alert(1)</script>",
    author: "Jamie & team",
    text: "Thanks!\n<script>unsafe</script>\nhttps://example.com/page",
    link: "https://portal.awebco.com/support?ticket=test",
    audience: "client",
    received: false,
    attachments: ["report.pdf"],
  });
  assert.ok(result.html.includes("Awebco Support"));
  assert.ok(!result.html.includes("cid:"));
  assert.ok(result.html.includes("View your support ticket"));
  assert.ok(result.html.includes("&lt;script&gt;unsafe&lt;/script&gt;"));
  assert.ok(!result.html.includes("<script>"));
  assert.ok(result.html.includes('href="https://example.com/page"'));
  assert.ok(!result.text.includes("staging-portal"));
  assert.ok(!result.text.includes("CRM Notifications"));
  assert.match(result.text, /Reply to this email/);
});

test("staff notifications omit private-workflow instructions even when Outlook quotes them", () => {
  const result = supportNotification({
    title: "TEST — Please ignore",
    author: "Troy",
    text: "We’re checking the support ticket system. No action is needed.",
    link: "https://awebco-crm.vercel.app/?nav=Support%20Tickets&ticket=test",
    audience: "team",
    received: false,
    attachments: [],
  });
  for (const body of [result.text, result.html]) {
    assert.doesNotMatch(
      body,
      /Internal notes|private comments|reply to the client/i,
    );
    assert.match(body, /We’re checking the support ticket system/);
  }
  const reply = "Please keep the second instruction too.";
  const plain = `${reply}\n\nFrom: Awebco Support <tickets@awebco.com>\nSent: Monday, November 2, 2026 12:00 PM\nTo: Troy <troy@awebco.com>\nSubject: TEST — Please ignore\n\n${result.text}`;
  const html = `<p>${reply}</p><div id="divRplyFwdMsg">From: Awebco Support &lt;tickets@awebco.com&gt;<br>Sent: Monday, November 2, 2026 12:00 PM<br>To: Troy &lt;troy@awebco.com&gt;<br>Subject: TEST — Please ignore</div>${result.html}`;
  for (const raw of [
    original(plain),
    original(plain, {
      html: [html],
      strippedText: reply,
      strippedHtml: [`<p>${reply}</p>`],
    }),
  ]) {
    const parsed = supportEmailContent(plain, raw);
    assert.match(parsed.text, /Please keep the second instruction too\./);
    assert.doesNotMatch(
      `${parsed.text}\n${parsed.quoted}`,
      /Internal notes|private comments|reply to the client/i,
    );
  }
});

test("Outlook mobile signature tables and booking icons are removed from replies and notifications", () => {
  const reply = "Okay, thanks. I will close the ticket.";
  const signature =
    "[cid:portrait]\nWrite a Review<https://example.com/review>\nJamie Staff\nSEO & PPC Manager\n📞 (217) 555-0100\n[https://example.com/calendar.png]<https://example.com/book>\nBook time to meet with me<https://example.com/book>";
  const plain = `${reply}\n\n${signature}\n\nFrom: Support\nDate: Tuesday\nTo: Jamie\nSubject: Re: Ticket\nOld message`;
  const sigHtml =
    '<div id="ms-outlook-mobile-signature"><table><tr><td><img src="cid:portrait"><a href="https://example.com/review">Write a Review</a></td><td>Jamie Staff<br>SEO &amp; PPC Manager<br>📞 (217) 555-0100<br><a href="https://example.com/book"><img src="https://example.com/calendar.png"></a><br><a href="https://example.com/book">Book time to meet with me</a></td></tr></table></div>';
  const message = supportMessagePresentation("email-outlook-mobile", {
    email_original: original(plain, {
      html: [
        `<p>${reply}</p>${sigHtml}<div id="mail-editor-reference-message-container">From: Support<br>Date: Tuesday<br>To: Jamie<br>Subject: Re: Ticket<br>Old message</div>`,
      ],
      strippedText: `${reply}\n\n${signature}`,
      strippedHtml: [`<p>${reply}</p>${sigHtml}`],
    }),
    email_attachment_cids: { portrait: ["portrait"] },
    attachments: [
      { id: "portrait", name: "image.jpeg" },
      { id: "file", name: "document.pdf" },
    ],
  });
  assert.equal(message.text, reply);
  assert.deepEqual(
    message.inline.map((file) => file.id),
    ["portrait"],
  );
  assert.deepEqual(
    message.attachments.map((file) => file.id),
    ["file"],
  );
  const notification = supportNotification({
    title: "Ticket",
    author: "Jamie",
    text: message.text,
    link: "",
    audience: "client",
    received: false,
    attachments: [],
  });
  assert.doesNotMatch(
    notification.text,
    /Review|Book time|Old message|555-0100/,
  );
});

test("Gmail header separated from quoted history by a blank line is hidden", () => {
  const reply = "Thanks, the link looks good.";
  const content = supportEmailContent(
    `${reply}\n\nOn Tue, Nov 3, 2026 at 12:30 PM Support <tickets@example.com> wrote:\n\n> Old message`,
  );
  assert.equal(content.text, reply);
  const notification = supportNotification({
    title: "Link update",
    author: "Client",
    text: content.text,
    link: "",
    audience: "team",
    received: false,
    created: true,
    attachments: [],
  });
  assert.match(notification.text, /New ticket created/);
  assert.doesNotMatch(notification.text, /wrote:|Old message/);
});
