"use client";

import { useState } from "react";

export interface Option {
  code: string;
  label: string;
}

export function StatusControl({
  requirementId,
  currentStatus,
  statuses,
  lossReasons,
  action,
}: {
  requirementId: string;
  currentStatus: string;
  statuses: Option[];
  lossReasons: Option[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [status, setStatus] = useState(currentStatus);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="requirementId" value={requirementId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="label">Status</span>
          <select className="input w-44" name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {statuses.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" type="submit">
          Update status
        </button>
      </div>

      {status === "lost" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-[12px] font-semibold text-amber-800">
            A structured loss reason is required. This powers &quot;what did we lose and why&quot;.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="label">Loss reason *</span>
              <select className="input" name="lossReason" required defaultValue="">
                <option value="" disabled>
                  Select reason
                </option>
                {lossReasons.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Competitor details</span>
              <input className="input" name="competitorDetails" />
            </label>
            <label className="block">
              <span className="label">Loss notes</span>
              <input className="input" name="lossNotes" />
            </label>
          </div>
        </div>
      )}
    </form>
  );
}
