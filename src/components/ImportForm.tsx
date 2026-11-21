"use client";

import { useState } from "react";
import { importRebrandlyAction } from "@/app/admin/actions";
import { ActionForm, SubmitButton } from "./forms";
import { inputClass, labelClass } from "./styles";

export function ImportForm() {
  const [preview, setPreview] = useState(true);
  return (
    <ActionForm action={importRebrandlyAction} className="mt-4 space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="api_key" className={labelClass}>Rebrandly API key</label>
          <input
            id="api_key"
            name="api_key"
            type="password"
            required
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-mute">Used for this request only. It is not saved.</p>
        </div>
        <div>
          <label htmlFor="workspace" className={labelClass}>Workspace ID (optional)</label>
          <input id="workspace" name="workspace" autoComplete="off" spellCheck={false} className={inputClass} />
          <p className="mt-1 text-xs text-mute">Only needed if the key&apos;s workspace is not your default one.</p>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <label className="flex items-start gap-2">
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
        <label className="flex items-start gap-2">
          <input type="checkbox" name="lift_utm" defaultChecked className="mt-1" />
          <span>
            <span className="font-medium">Move utm_ values into campaign tracking.</span> Links that carry UTM values in their
            destination get them as campaign fields, so they appear on the Campaigns page. Values are saved in lower case.
          </span>
        </label>
      </div>

      <SubmitButton>{preview ? "Preview import" : "Import links"}</SubmitButton>
    </ActionForm>
  );
}
