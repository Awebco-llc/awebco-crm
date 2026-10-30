export function supportEmailContent(raw: string, author = "", senderName = "") {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const names = [
    ...new Set(
      [author, senderName]
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  let start = lines.findIndex((line) => /^--\s*$/.test(line));
  if (start < 1 && names.length) {
    for (let i = lines.length - 1; i > 0; i--) {
      const value = lines[i].trim().toLowerCase();
      const tail = lines.slice(i).join("\n");
      if (
        names.some(
          (name) =>
            value === name ||
            (name.split(" ").length === 1 &&
              value.startsWith(name + " ") &&
              value.split(" ").length <= 5),
        ) &&
        /https?:\/\/|www\./i.test(tail) &&
        /\+?[\d ().-]{7,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(tail)
      ) {
        start = i;
        while (
          start > 0 &&
          (!lines[start - 1].trim() ||
            /^\s*\[cid:[^\]]+\]\s*$/i.test(lines[start - 1]) ||
            /^\s*Write a Review(?:<[^>]+>)?\s*$/i.test(lines[start - 1]))
        )
          start--;
        break;
      }
    }
  }
  const readable = (value: string) =>
    value
      .replace(/\[cid:[^\]]+\]/gi, "")
      .replace(
        /\[https?:\/\/[^\]\n]+\.(?:png|jpe?g|gif|webp)(?:\?[^\]\n]*)?\]/gi,
        "",
      )
      .replace(
        /([^\n<>]*?)<(https?:\/\/[^<>\s]+)>/g,
        (_match, label: string, url: string) => {
          const text = label.trim();
          const normalized = (v: string) =>
            v.replace(/^https?:\/\//, "").replace(/\/$/, "");
          return !text || normalized(text) === normalized(url)
            ? url
            : `${text} (${url})`;
        },
      )
      .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n")
      .trim();
  return start > 0
    ? {
        text: readable(lines.slice(0, start).join("\n")),
        signature: readable(lines.slice(start).join("\n")),
      }
    : { text: readable(raw), signature: "" };
}

export function supportMessagePresentation(
  id: string,
  data: Record<string, unknown>,
) {
  const email = id.startsWith("email-");
  const content = email
    ? supportEmailContent(
        String(data.text || ""),
        String(data.author || ""),
        String(data.email_sender_name || ""),
      )
    : { text: String(data.text || ""), signature: "" };
  const inline = new Set(
    Array.isArray(data.inline_attachment_ids) ? data.inline_attachment_ids : [],
  );
  const files = (
    Array.isArray(data.attachments) ? data.attachments : []
  ) as Array<{
    id: string;
    name: string;
    type?: string;
    size?: number;
    path?: string;
  }>;
  const isInline = (file: (typeof files)[number]) =>
    inline.has(file.id) ||
    (email &&
      !!content.signature &&
      /^img-[a-f\d-]{36}\.(?:png|jpe?g|gif|webp)$/i.test(file.name));
  return {
    ...content,
    attachments: files.filter((file) => !isInline(file)),
    inline: files.filter(isInline),
  };
}

function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
function bodyHtml(text: string) {
  return text
    .split(/(https?:\/\/[^\s<>]+)/g)
    .map((part) =>
      /^https?:\/\//.test(part)
        ? `<a href="${escape(part)}" style="color:#176398;text-decoration:underline;word-break:break-word">${escape(part)}</a>`
        : escape(part),
    )
    .join("")
    .replace(/\n/g, "<br>");
}
export function supportNotification(input: {
  title: string;
  author: string;
  text: string;
  link: string;
  audience: "team" | "client";
  received: boolean;
  attachments: string[];
}) {
  const title = input.title.replace(/[\r\n]/g, " ").slice(0, 150);
  const heading = input.received
    ? "We received your request"
    : input.audience === "team"
      ? "A new message on this ticket"
      : "A reply from your Awebco team";
  const action =
    input.audience === "team"
      ? "Open ticket in CRM"
      : "View your support ticket";
  const footer =
    input.audience === "team"
      ? "Reply to this email to send a reply to the client. Use Internal notes in the CRM for private comments."
      : "Reply to this email to continue the conversation with Awebco.";
  const text = `Awebco Support\n\n${heading}\n${title}\n\n${input.author}\n${input.text}${input.attachments.length ? `\n\nAttachments: ${input.attachments.join(", ")}` : ""}\n\n${action}:\n${input.link}\n\n${footer}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head><body style="margin:0;background:#f3f7fa;color:#18324b;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escape(heading)}: ${escape(title)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7fa"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e1e8ee;border-radius:12px"><tr><td style="padding:28px 28px 24px;border-bottom:1px solid #e1e8ee"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td><img src="cid:awebco-logo.png" alt="" width="40" height="40" style="display:block;border:0"></td><td style="padding-left:12px;font-size:21px;font-weight:bold;color:#18324b">Awebco Support</td></tr></table></td></tr><tr><td style="padding:28px"><h1 style="font-size:23px;line-height:31px;margin:0 0 12px;font-weight:600">${escape(heading)}</h1><p style="font-size:16px;line-height:25px;margin:0 0 24px;color:#526578">${escape(title)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f9fb;border:1px solid #e1e8ee;border-radius:8px"><tr><td style="padding:20px"><p style="font-size:14px;line-height:22px;font-weight:bold;margin:0 0 10px">${escape(input.author)}</p><div style="font-size:16px;line-height:26px;word-break:break-word">${bodyHtml(input.text)}</div>${input.attachments.length ? `<p style="font-size:13px;line-height:21px;margin:18px 0 0;color:#526578">Attached: ${input.attachments.map(escape).join(", ")}</p>` : ""}</td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:26px"><tr><td bgcolor="#123753" style="border-radius:6px"><a href="${escape(input.link)}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold">${action}</a></td></tr></table><p style="font-size:14px;line-height:23px;color:#526578;margin:24px 0 0">${escape(footer)}</p></td></tr><tr><td style="padding:20px 28px;border-top:1px solid #e1e8ee;color:#6b7b8a;font-size:12px;line-height:20px">Awebco Support · Your website and marketing team</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
