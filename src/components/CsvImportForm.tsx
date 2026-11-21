"use client";

import { useState } from "react";
import { importCsvAction } from "@/app/admin/actions";
import { ActionForm, SubmitButton } from "./forms";
import { inputClass, labelClass } from "./styles";

// Keep in step with CSV_MAX_BYTES in lib/csv.ts (that file is not imported here so the browser bundle stays small).
const MAX_BYTES = 1_000_000;

export function CsvImportForm() {
  const [preview, setPreview] = useState(true);
  return (
    <ActionForm action={importCsvAction} className="mt-4 space-y-4">
      <div>
        <label htmlFor="csv_file" className={labelClass}>CSV file</label>
        <input
          id="csv_file"
          name="csv_file"
          type="file"
          required
          accept=".csv,text/csv"
          className={inputClass}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            // A custom validity message stops the form from submitting a file the server would refuse.
            e.currentTarget.setCustomValidity(
              file && file.size > MAX_BYTES ? "That file is over 1 MB. Split it into smaller files." : "",
            );
            e.currentTarget.reportValidity();
          }}
        />
        <p className="mt-1 text-xs text-ink/60">Up to 1 MB or 20,000 rows. The file is read for this request and not kept.</p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="dry_run"
          checked={preview}
          onChange={(e) => setPreview(e.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="font-medium">Preview only.</span> Shows what would be imported and changes nothing. Untick to import.
        </span>
      </label>

      <SubmitButton>{preview ? "Preview import" : "Import links"}</SubmitButton>
    </ActionForm>
  );
}
