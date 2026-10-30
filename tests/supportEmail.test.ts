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
