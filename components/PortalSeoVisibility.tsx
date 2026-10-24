"use client";
import { useState } from "react";
import { updateTicket } from "@/lib/crmStore";
export function PortalSeoVisibility({
  id,
  value,
}: {
  id: string;
  value: unknown;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="w-full rounded-lg border border-blue-100 bg-blue-50 p-4">
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-800">
        <input
          type="checkbox"
          checked={value === undefined || value === "Approved"}
          disabled={busy}
          className="h-5 w-5"
          onChange={async (e) => {
            const visibility = e.target.checked ? "Approved" : "Hidden";
            setBusy(true);
            setError("");
            try {
              await updateTicket(id, { portalVisibility: visibility });
            } catch {
              setError("Could not save visibility. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        />
        Show in client reports
      </label>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        Completed work is included automatically for its assigned Deadline month
        when this group is connected. Only the task title and safe page link are
        shared. Uncheck to hide this task and its subtasks.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
