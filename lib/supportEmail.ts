import { parse, type DefaultTreeAdapterMap } from "parse5";

// Retain the provider's bodies verbatim. These are clues, never a replacement for
// the original: stripped-text can omit inline replies or be present but empty.
export type SupportEmailOriginal = {
  plain: string;
  html: string[];
  strippedText?: string;
  strippedHtml: string[];
  strippedSignature?: string;
  contentIds: Record<string, string>;
};
export function supportEmailOriginal(
  form: FormData,
  fallback = "",
): SupportEmailOriginal {
  const field = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : undefined;
  };
  const fields = (key: string) =>
    form.getAll(key).filter((v): v is string => typeof v === "string");
  let contentIds: Record<string, string> = {};
  try {
    const value: unknown = JSON.parse(field("content-id-map") || "{}");
    if (value && typeof value === "object" && !Array.isArray(value))
      contentIds = Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
  } catch {
    /* Unknown metadata must not hide files. */
  }
  const html = fields("body-html");
  return {
    plain:
      field("body-plain") ?? field("body") ?? (html.length ? "" : fallback),
    html,
    ...(field("stripped-text") !== undefined
      ? { strippedText: field("stripped-text") }
      : {}),
    strippedHtml: fields("stripped-html"),
    ...(field("stripped-signature") !== undefined
      ? { strippedSignature: field("stripped-signature") }
      : {}),
    contentIds,
  };
}
const normalize = (value: string) => value.replace(/\r\n?/g, "\n");
const compact = (value: string) =>
  value
    .replace(/\[cid:[^\]]+\]/gi, "")
    .replace(/^_{5,}[ \t]*$/gm, "")
    .replace(/[\s>]+/g, "")
    .toLowerCase();
const readable = (value: string) =>
  normalize(value)
    .replace(/\[cid:[^\]]+\]/gi, "")
    .replace(
      /([^\n<>]*?)<(https?:\/\/[^<>\s]+)>/g,
      (_match, label: string, url: string) => {
        const text = label.trim();
        return !text ||
          text.replace(/^https?:\/\//, "").replace(/\/$/, "") ===
            url.replace(/^https?:\/\//, "").replace(/\/$/, "")
          ? url
          : `${text} (${url})`;
      },
    )
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n")
    .trim();

type Part = { text: string; kind: "reply" | "quote" | "signature" };
function htmlParts(html: string, outlookHistory = false) {
  const parts: Part[] = [];
  const append = (text: string, kind: Part["kind"]) => {
    if (parts.at(-1)?.kind === kind) parts[parts.length - 1].text += text;
    else parts.push({ text, kind });
  };
  const stack: Array<{
    node: DefaultTreeAdapterMap["node"];
    kind: Part["kind"];
    close?: boolean;
  }> = [{ node: parse(html), kind: "reply" }];
  while (stack.length) {
    const { node, kind, close } = stack.pop()!;
    if (node.nodeName === "#text") {
      append(
        (node as DefaultTreeAdapterMap["textNode"]).value.replace(/\s+/g, " "),
        kind,
      );
      continue;
    }
    if (!("childNodes" in node)) continue;
    const element = node as DefaultTreeAdapterMap["element"];
    const tag = element.tagName || "";
    if (/^(head|script|style|template|noscript)$/.test(tag)) continue;
    const attrs = Object.fromEntries(
      (element.attrs || []).map(({ name, value }) => [name, value]),
    );
    const marker = `${attrs.class || ""} ${attrs.id || ""} ${attrs["data-smartmail"] || ""}`;
    const next =
      /(?:^|\s)(?:gmail_signature|moz-signature|Signature)(?:\s|$)/i.test(
        marker,
      )
        ? "signature"
        : tag === "blockquote" || /(?:^|\s)gmail_attr(?:\s|$)/.test(marker)
          ? "quote"
          : kind;
    const block = /^(div|p|blockquote|tr|li|section|table|hr)$/.test(tag);
    if (close) {
      if (tag === "a" && /^https?:\/\//i.test(attrs.href || ""))
        append(` <${attrs.href}>`, kind);
      if (block) append("\n", kind);
      continue;
    }
    if (block || tag === "br") append("\n", next);
    if (tag === "img") {
      // Only files actually referenced in a collapsed block can be collapsed.
      if (/^cid:/i.test(attrs.src || "")) append(`[${attrs.src}]`, next);
      if (attrs.alt) append(`[${attrs.alt}]`, next);
    }
    stack.push({ node, kind: next, close: true });
    let siblingKind = next;
    const children = node.childNodes.map((child) => {
      // Outlook marks the start of its quoted thread, rather than wrapping it.
      // Propose that suffix only when provider HTML is available to corroborate it.
      if (
        outlookHistory &&
        "attrs" in child &&
        child.attrs.some(
          ({ name, value }) => name === "id" && value === "divRplyFwdMsg",
        )
      )
        siblingKind = "quote";
      return { node: child, kind: siblingKind };
    });
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
  return parts;
}

export function supportEmailText(original: SupportEmailOriginal) {
  return (
    original.plain ||
    original.html
      .flatMap((html) => htmlParts(html))
      .map((part) => part.text)
      .join("\n")
  );
}
const mobileFooter =
  /^(?:Sent from my (?:iPhone|iPad|Android(?: device)?)|Get Outlook for (?:iOS|Android)(?:\s*(?:<https:\/\/aka\.ms\/[^>]+>|\(https:\/\/aka\.ms\/[^)]+\)|https:\/\/aka\.ms\/\S+))?)$/i;
function safeSignature(value: string) {
  const lines = normalize(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  // Do not treat a separator, a name, a URL or a courtesy word alone as proof.
  // Ambiguous prose/instructions stay in the reply, even inside a marked signature.
  return (
    lines.length > 0 &&
    lines.length <= 15 &&
    value.length < 2000 &&
    !lines.some((line) =>
      /\b(?:please|can you|could you|need|change|update|replace|remove|keep|add|use|include|don't|do not|must|should)\b/i.test(
        line,
      ),
    ) &&
    ((lines.length === 1 && mobileFooter.test(lines[0])) ||
      (lines.some((line) =>
        /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?[\d ().-]{7,}/i.test(line),
      ) &&
        lines.every(
          (line) =>
            /^(?:--|\[cid:[^\]]+\])$/i.test(line) ||
            mobileFooter.test(line) ||
            /https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?[\d ().-]{7,}/i.test(
              line,
            ) ||
            /^[\p{S}\s]*\d{1,6}[\p{L}\p{N}\s.,#'-]{1,100}$/u.test(line) ||
            /^[\p{L}][\p{L} '&,|–-]{0,75}$/u.test(line),
        )))
  );
}
export function supportEmailContent(
  raw: string,
  original?: SupportEmailOriginal,
) {
  let body = normalize(raw),
    signature = "",
    quoted = "",
    hidden = "";
  const html =
    original?.html.length === 1
      ? htmlParts(original.html[0], original.strippedHtml.length === 1)
      : [];
  // HTML is used only when its visible text agrees with the authoritative plain
  // body. Divergent alternatives and multi-part HTML remain conservative.
  const equivalent =
    html.length &&
    compact(html.map((part) => part.text).join("")) === compact(body);
  if (equivalent) {
    const reply = html.filter(
      (part) =>
        part.kind === "reply" ||
        (part.kind === "signature" && !safeSignature(part.text)),
    );
    const candidate = reply.map((part) => part.text).join("\n");
    let providerReplies = [
      original?.strippedText || "",
      ...(original?.strippedHtml || []).map((value) =>
        htmlParts(value)
          .map((part) => part.text)
          .join(""),
      ),
    ].filter((value) => value.trim());
    if (original?.strippedHtml.length === 1 && original.strippedText?.trim()) {
      const provider = htmlParts(original.strippedHtml[0]);
      // Providers can retain marked signatures and blockquotes in both stripped
      // fields, or remove a quote from only one alternative. Account for those
      // known blocks, but require every remaining word in BOTH provider replies
      // to survive. A provider HTML reply inside a quote still prevents collapse.
      let providerText = compact(original.strippedText);
      for (const part of html) {
        if (
          part.kind === "quote" ||
          (part.kind === "signature" && safeSignature(part.text))
        )
          providerText = providerText.replace(compact(part.text), "");
      }
      providerReplies = [
        providerText,
        provider
          .filter(
            (part) =>
              part.kind === "reply" ||
              (part.kind === "signature" && !safeSignature(part.text)),
          )
          .map((part) => part.text)
          .join("\n"),
      ];
    }
    // A provider reply missing from the HTML projection signals an inline edit.
    if (
      providerReplies.every((value) =>
        compact(candidate).includes(compact(value)),
      )
    ) {
      for (const part of html) {
        if (part.kind === "quote") {
          quoted += part.text;
          hidden += part.text;
        }
        if (part.kind === "signature" && safeSignature(part.text)) {
          signature += part.text;
          hidden += part.text;
        }
      }
      body = candidate;
    }
  }
  const lines = body.split("\n"),
    visible: string[] = [],
    quotes: string[] = [];
  const quotedContext =
    /^On .+wrote:\s*$/im.test(body) || !!original?.strippedText?.trim();
  for (let i = 0; i < lines.length; i++) {
    // Collapse quoted lines, never the entire tail: an unquoted answer between
    // two quoted paragraphs is still a new reply.
    if (
      quotedContext &&
      (/^\s*>/.test(lines[i]) ||
        (/^On .+wrote:\s*$/i.test(lines[i]) &&
          /^\s*>/.test(lines[i + 1] || "")))
    )
      quotes.push(lines[i]);
    else visible.push(lines[i]);
  }
  quoted += `\n${quotes.join("\n")}`;
  hidden += `\n${quotes.join("\n")}`;
  body = visible.join("\n").trim();
  const providerSignature = original?.strippedSignature?.trim();
  const separator = body.search(/\n--[ \t]*\n/);
  const last = body.split("\n").findLastIndex((line) => line.trim());
  const mobile = body.split("\n")[last]?.trim();
  const beforeProvider =
    providerSignature && body.endsWith(providerSignature)
      ? body.slice(0, -providerSignature.length)
      : "";
  const providerBoundary =
    /\n[ \t]*\n[ \t]*$/.test(beforeProvider) &&
    !beforeProvider.trimEnd().endsWith(":");
  const candidate =
    providerSignature && providerBoundary
      ? providerSignature
      : separator > 0
        ? body.slice(separator + 1)
        : mobile && mobileFooter.test(mobile)
          ? mobile
          : "";
  if (
    candidate &&
    safeSignature(candidate) &&
    body.slice(0, -candidate.length).trim()
  ) {
    signature += `\n${candidate}`;
    hidden += `\n${candidate}`;
    body = body.slice(0, -candidate.length);
  }
  // Never leave an incoming message with only collapsed text.
  if (!readable(body) && !/\[cid:/i.test(body))
    return {
      text: readable(raw),
      signature: "",
      quoted: "",
      hidden: "",
      visible: raw,
    };
  return {
    text: readable(body),
    signature: readable(signature),
    quoted: readable(quoted),
    hidden,
    visible: body,
  };
}

export function supportMessagePresentation(
  id: string,
  data: Record<string, unknown>,
) {
  const email = id.startsWith("email-");
  const original = email
    ? (data.email_original as SupportEmailOriginal | undefined)
    : undefined;
  const raw = original ? supportEmailText(original) : String(data.text || "");
  const content = email
    ? supportEmailContent(raw, original)
    : {
        text: String(data.text || ""),
        signature: "",
        quoted: "",
        hidden: "",
        visible: String(data.text || ""),
      };
  const files = (
    Array.isArray(data.attachments) ? data.attachments : []
  ) as Array<{
    id: string;
    name: string;
    type?: string;
    size?: number;
    path?: string;
  }>;
  const hiddenCids = new Set(
    [...content.hidden.matchAll(/\[cid:([^\]]+)\]/gi)].map((match) =>
      match[1].replace(/^<|>$/g, "").toLowerCase(),
    ),
  );
  const visibleCids = new Set(
    [...content.visible.matchAll(/\[cid:([^\]]+)\]/gi)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
  const references = data.email_attachment_cids as
    Record<string, string[]> | undefined;
  const isInline = (file: (typeof files)[number]) =>
    email &&
    !!references?.[file.id]?.length &&
    references[file.id].every(
      (cid) =>
        hiddenCids.has(cid.toLowerCase()) &&
        !visibleCids.has(cid.toLowerCase()),
    );
  return {
    ...content,
    original: email ? raw : undefined,
    originalNote:
      email && !original
        ? "Only the text saved when this older email arrived is available."
        : undefined,
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
      ? ""
      : "Reply to this email to continue the conversation with Awebco.";
  const text = `Awebco Support\n\n${heading}\n${title}\n\n${input.author}\n${input.text}${input.attachments.length ? `\n\nAttachments: ${input.attachments.join(", ")}` : ""}${input.link ? `\n\n${action}:\n${input.link}` : ""}\n\n${footer}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head><body style="margin:0;background:#f3f7fa;color:#18324b;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escape(heading)}: ${escape(title)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7fa"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e1e8ee;border-radius:12px"><tr><td style="padding:28px 28px 24px;border-bottom:1px solid #e1e8ee"><p style="margin:0;font-size:21px;font-weight:bold;color:#18324b">Awebco Support</p></td></tr><tr><td style="padding:28px"><h1 style="font-size:23px;line-height:31px;margin:0 0 12px;font-weight:600">${escape(heading)}</h1><p style="font-size:16px;line-height:25px;margin:0 0 24px;color:#526578">${escape(title)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f9fb;border:1px solid #e1e8ee;border-radius:8px"><tr><td style="padding:20px"><p style="font-size:14px;line-height:22px;font-weight:bold;margin:0 0 10px">${escape(input.author)}</p><div style="font-size:16px;line-height:26px;word-break:break-word">${bodyHtml(input.text)}</div>${input.attachments.length ? `<p style="font-size:13px;line-height:21px;margin:18px 0 0;color:#526578">Attached: ${input.attachments.map(escape).join(", ")}</p>` : ""}</td></tr></table>${input.link ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:26px"><tr><td bgcolor="#123753" style="border-radius:6px"><a href="${escape(input.link)}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold">${action}</a></td></tr></table>` : ""}<p style="font-size:14px;line-height:23px;color:#526578;margin:24px 0 0">${escape(footer)}</p></td></tr><tr><td style="padding:20px 28px;border-top:1px solid #e1e8ee;color:#6b7b8a;font-size:12px;line-height:20px">Awebco Support · Your website and marketing team</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
