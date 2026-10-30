"use client";
import { useEffect, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { LockKeyhole, Mail, Paperclip, RefreshCw, Send, X } from "lucide-react";

type Attachment = { id: string; name: string; size?: number };
type Message = {
  id: string;
  author: string;
  text: string;
  created_at: string;
  direction: string;
  kind?: string;
  attachments: Attachment[];
  email_status?: string;
};
type Detail = {
  shared: boolean;
  requester: string | null;
  company_linked: boolean;
  messages: Message[];
};
export function SupportConversationPanel({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const query = new URLSearchParams(window.location.search);
    return (
      query.get("ticket") === ticketId && query.get("conversation") === "client"
    );
  });
  return (
    <details
      open={open}
      className="bg-white rounded-xl border border-[#E2E4E9] shadow-sm"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer p-6 md:p-8 font-semibold text-[#1C1F23]">
        Client conversation
        <span className="block mt-1 font-normal text-sm text-[#4A4D53]">
          Open to read or send a reply shared with the client.
        </span>
      </summary>
      {open && (
        <div className="px-6 pb-6 md:px-8 md:pb-8">
          <SupportConversation ticketId={ticketId} />
        </div>
      )}
    </details>
  );
}
async function supportRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Sign in to the CRM again.");
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...options.headers,
    },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Please try again.");
  return result;
}
export function SupportConversation({ ticketId }: { ticketId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0);
  const requestId = useRef(crypto.randomUUID());
  const base = `/api/support/tickets/${encodeURIComponent(ticketId)}`;
  useEffect(() => {
    let active = true;
    supportRequest<Detail>(base)
      .then((data) => {
        if (active) {
          setDetail(data);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    const unsubscribe = onSnapshot(
      query(
        collection(getDb(), "tickets", ticketId, "messages"),
        orderBy("created_at"),
      ),
      (snapshot) => {
        if (active)
          setMessages(
            snapshot.docs
              .filter((doc) => doc.data().visibility === "client")
              .map((doc) => ({ ...doc.data(), id: doc.id }) as Message),
          );
      },
      () => {
        if (active)
          setError("Could not load the conversation. Try refreshing.");
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [base, ticketId, revision]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function download(messageId: string, attachment: Attachment) {
    await perform(async () => {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Sign in to the CRM again.");
      const response = await fetch(
        `${base}/attachments/${encodeURIComponent(messageId)}/${encodeURIComponent(attachment.id)}`,
        { headers: { Authorization: `Bearer ${await user.getIdToken()}` } },
      );
      if (!response.ok)
        throw new Error("File could not be downloaded. Try again.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  return (
    <section className="space-y-5 text-sm" aria-label="Client conversation">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-base text-[#1C1F23] flex gap-2 items-center">
            <Mail size={18} />
            Client conversation
          </h3>
          <p className="text-[#4A4D53] mt-1">
            Replies here are shared with the client and emailed to the
            conversation’s participants.
          </p>
        </div>
        <button
          type="button"
          className="p-2 rounded hover:bg-gray-100"
          aria-label="Refresh client conversation"
          onClick={() => setRevision((v) => v + 1)}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <p className="flex gap-2 items-center text-[#4A4D53] bg-[#F9FAFB] border border-[#E2E4E9] rounded-lg p-3">
        <LockKeyhole size={17} className="shrink-0" />
        Internal notes stay private and are never sent from this area.
      </p>
      {detail && (
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={detail.shared}
            disabled={busy}
            onChange={(e) => {
              const shared = e.target.checked;
              void perform(async () => {
                setDetail(
                  await supportRequest<Detail>(`${base}/sharing`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ shared }),
                  }),
                );
              });
            }}
          />
          <span>
            Show this ticket in the client portal
            <small className="block text-[#4A4D53]">
              {detail.requester
                ? `Requester: ${detail.requester}`
                : "Add the requester email in ticket details."}
            </small>
          </span>
        </label>
      )}
      {!detail && !error && <p role="status">Loading conversation…</p>}
      {detail && !detail.shared && (
        <p className="p-3 rounded-lg bg-amber-50 text-amber-900">
          This ticket is internal. Set its company and requester email, then
          enable sharing to start a client conversation.
        </p>
      )}
      {messages.length ? (
        <ol className="space-y-3" aria-label="Messages">
          {messages.map((message) => (
            <li
              key={message.id}
              className={`border rounded-lg p-4 ${message.direction === "team" ? "bg-blue-50 border-blue-100" : "bg-white border-[#E2E4E9]"}`}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{message.author}</strong>
                <time
                  className="text-xs text-[#4A4D53]"
                  dateTime={message.created_at}
                >
                  {new Date(message.created_at).toLocaleString()}
                </time>
              </div>
              <p className="whitespace-pre-wrap break-words mt-2">
                {message.text}
              </p>
              {message.attachments?.map((file) => (
                <button
                  type="button"
                  key={file.id}
                  disabled={busy}
                  onClick={() => void download(message.id, file)}
                  className="flex gap-2 items-center text-blue-700 underline mt-2 break-all"
                >
                  <Paperclip size={15} />
                  {file.name}
                </button>
              ))}
              <p className="text-xs text-[#4A4D53] mt-2">
                {message.email_status === "accepted"
                  ? "Email notification accepted"
                  : message.email_status === "failed"
                    ? "Message saved. Email notification could not be sent."
                    : message.email_status === "not_required"
                      ? "Message saved. No email notification required."
                      : message.email_status === "uncertain"
                        ? "Message saved. Email delivery is not confirmed."
                        : "Message saved. Email notification pending."}
              </p>
              {message.email_status === "failed" && (
                <button
                  type="button"
                  disabled={busy}
                  className="underline mt-2"
                  onClick={() =>
                    void perform(async () => {
                      setDetail(
                        await supportRequest<Detail>(
                          `${base}/messages/${message.id}/retry`,
                          { method: "POST" },
                        ),
                      );
                    })
                  }
                >
                  Retry email notification
                </button>
              )}
            </li>
          ))}
        </ol>
      ) : (
        detail && <p className="text-[#4A4D53]">No client messages yet.</p>
      )}
      {detail?.shared && (
        <div className="border-2 border-blue-200 rounded-xl p-4 space-y-3">
          <label
            className="block font-semibold"
            htmlFor={`client-reply-${ticketId}`}
          >
            Reply to client
          </label>
          <textarea
            id={`client-reply-${ticketId}`}
            rows={5}
            maxLength={10000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full border border-[#C8CDD5] rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
            placeholder="Write a reply for the client…"
            disabled={busy}
          />
          <label className="block">
            Attach files
            <input
              type="file"
              multiple
              disabled={busy}
              accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
              className="block mt-1 w-full text-sm"
              onChange={(e) => {
                const chosen = Array.from(e.target.files || []);
                e.target.value = "";
                if (
                  chosen.length + files.length > 5 ||
                  [...files, ...chosen].reduce((n, f) => n + f.size, 0) >
                    3000000
                ) {
                  setError(
                    "Attach up to 5 files, with a maximum total size of 3 MB.",
                  );
                  return;
                }
                setFiles([...files, ...chosen]);
              }}
            />
          </label>
          <p className="text-xs text-[#4A4D53]">Up to 5 files, 3 MB total.</p>
          {files.map((file, index) => (
            <div
              key={`${index}-${file.name}`}
              className="flex gap-2 items-center break-all"
            >
              <span>{file.name}</span>
              <button
                type="button"
                disabled={busy}
                aria-label={`Remove ${file.name}`}
                onClick={() => setFiles(files.filter((_, i) => i !== index))}
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={busy || (!text.trim() && !files.length)}
            onClick={() =>
              void perform(async () => {
                const body = new FormData();
                body.set(
                  "payload",
                  JSON.stringify({ request_id: requestId.current, text }),
                );
                files.forEach((file) => body.append("files", file));
                const result = await supportRequest<Detail>(
                  `${base}/messages`,
                  { method: "POST", body },
                );
                setDetail(result);
                setMessages(result.messages);
                requestId.current = crypto.randomUUID();
                setText("");
                setFiles([]);
                setNotice("Reply shared with the client.");
              })
            }
            className="flex items-center justify-center gap-2 bg-[#1061E3] text-white rounded-lg px-4 py-2.5 font-semibold disabled:opacity-50"
          >
            <Send size={16} />
            {busy ? "Sending…" : "Send reply to client"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-green-800">
          {notice}
        </p>
      )}
    </section>
  );
}
