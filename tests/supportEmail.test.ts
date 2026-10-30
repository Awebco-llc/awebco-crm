import assert from "node:assert/strict";
import test from "node:test";
import {
  supportEmailContent,
  supportMessagePresentation,
  supportNotification,
} from "../lib/supportEmail";
const raw =
  "The updated photo looks good.\r\n\r\n[cid:logo-one]\r\n\r\n[cid:logo-two]\r\nWrite a Review<https://example.com/review>\r\nJamie Client\r\nBusiness Manager\r\n(217) 555-0100\r\nwww.example.com<https://www.example.com/>\r\n[facebook icon]<https://facebook.com/example>";
test("email signatures are separated without discarding meaningful reply text or contact information", () => {
  const parsed = supportEmailContent(raw, "Jamie");
  assert.equal(parsed.text, "The updated photo looks good.");
  assert.equal(
    supportEmailContent(raw, "participant@example.com", "Jamie Client").text,
    "The updated photo looks good.",
  );
  assert.match(parsed.signature, /Jamie Client/);
  assert.match(parsed.signature, /217/);
  assert.ok(!parsed.signature.includes("[cid:"));
  assert.ok(!parsed.signature.includes("<https:"));
  assert.equal(
    supportEmailContent(
      "Please call the number shown in the screenshot.\nThe image is below.",
      "Jamie",
    ).text,
    "Please call the number shown in the screenshot.\nThe image is below.",
  );
});
test("real attachments remain visible while inline email assets are preserved separately", () => {
  const data = {
    text: raw,
    author: "Jamie",
    inline_attachment_ids: ["inline"],
    attachments: [
      {
        id: "inline",
        name: "logo.png",
        type: "image/png",
        path: "private/path",
      },
      {
        id: "report",
        name: "report.pdf",
        type: "application/pdf",
        path: "private/report",
      },
    ],
  };
  const parsed = supportMessagePresentation("email-test", data);
  assert.deepEqual(
    parsed.attachments.map((file) => file.id),
    ["report"],
  );
  assert.deepEqual(
    parsed.inline.map((file) => file.id),
    ["inline"],
  );
  assert.equal(parsed.text, "The updated photo looks good.");
  const older = supportMessagePresentation("email-older", {
    text: raw,
    author: "Jamie",
    attachments: [
      { id: "logo", name: "img-40bcfe0f-b228-4fe5-a802-319ff8974db1.jpeg" },
      { id: "photo", name: "team-photo.jpg" },
    ],
  });
  assert.deepEqual(
    older.attachments.map((file) => file.id),
    ["photo"],
  );
  assert.deepEqual(
    older.inline.map((file) => file.id),
    ["logo"],
  );
});
test("normal portal and CRM messages retain their content even if it resembles an email signature", () => {
  const result = supportMessagePresentation("normal-uuid", {
    text: raw,
    author: "Jamie",
    attachments: [],
  });
  assert.equal(result.text, raw);
  assert.equal(result.signature, "");
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
