"use client";

import { useState } from "react";
import { addItemAction } from "@/app/admin/actions";
import { NETWORKS, NETWORK_LABELS } from "@/lib/gallery-icons";
import { ActionForm, SubmitButton, inputClass, labelClass } from "./forms";

type Kind = "link" | "social" | "image" | "video";

const KINDS: { value: Kind; label: string; help: string }[] = [
  { value: "link", label: "Button", help: "A button that opens a web page. Clicks are counted." },
  { value: "social", label: "Social icon", help: "A round icon in the row under your bio. Clicks are counted." },
  { value: "image", label: "Image", help: "A picture, optionally linked to a page. Clicks on it are counted." },
  { value: "video", label: "YouTube video", help: "An embedded player. Views of the video itself are not counted." },
];

export function AddItemForm({ galleryId }: { galleryId: number }) {
  const [kind, setKind] = useState<Kind>("link");
  const [nonce, setNonce] = useState(0); // remounting the fields clears them after a successful add
  const help = KINDS.find((k) => k.value === kind)?.help;

  return (
    <ActionForm action={addItemAction} className="mt-4 space-y-4" onOk={() => setNonce((n) => n + 1)}>
      <input type="hidden" name="gallery_id" value={galleryId} />
      <div className="max-w-xs">
        <label htmlFor="kind" className={labelClass}>Add</label>
        <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={inputClass}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-licorice/60">{help}</p>
      </div>

      <div key={nonce} className="grid gap-4 md:grid-cols-2">
        {kind === "link" && (
          <>
            <div>
              <label htmlFor="add-label" className={labelClass}>Label</label>
              <input id="add-label" name="label" maxLength={120} className={inputClass} placeholder="Book a visit" />
            </div>
            <div>
              <label htmlFor="add-url" className={labelClass}>Link</label>
              <input id="add-url" name="url" className={inputClass} placeholder="https://" />
            </div>
          </>
        )}

        {kind === "social" && (
          <>
            <div>
              <label htmlFor="add-network" className={labelClass}>Network</label>
              <select id="add-network" name="network" className={inputClass}>
                {NETWORKS.map((n) => (
                  <option key={n} value={n}>{NETWORK_LABELS[n]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="add-url" className={labelClass}>Profile link</label>
              <input id="add-url" name="url" className={inputClass} placeholder="https://instagram.com/yourname (or an email address)" />
            </div>
          </>
        )}

        {kind === "image" && (
          <>
            <div>
              <label htmlFor="add-file" className={labelClass}>Upload (up to 250 KB)</label>
              <input id="add-file" name="image_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="block w-full text-sm" />
            </div>
            <div>
              <label htmlFor="add-image-url" className={labelClass}>Or an image link</label>
              <input id="add-image-url" name="image_url" className={inputClass} placeholder="https://" />
            </div>
            <div>
              <label htmlFor="add-label" className={labelClass}>Description (optional)</label>
              <input id="add-label" name="label" maxLength={120} className={inputClass} placeholder="Shown under the image and read aloud by screen readers" />
            </div>
            <div>
              <label htmlFor="add-url" className={labelClass}>Opens when clicked (optional)</label>
              <input id="add-url" name="url" className={inputClass} placeholder="https://" />
            </div>
          </>
        )}

        {kind === "video" && (
          <>
            <div>
              <label htmlFor="add-url" className={labelClass}>YouTube link</label>
              <input id="add-url" name="url" className={inputClass} placeholder="https://www.youtube.com/watch?v=" />
            </div>
            <div>
              <label htmlFor="add-label" className={labelClass}>Title (optional)</label>
              <input id="add-label" name="label" maxLength={120} className={inputClass} />
            </div>
          </>
        )}
      </div>

      <SubmitButton>Add to gallery</SubmitButton>
    </ActionForm>
  );
}
