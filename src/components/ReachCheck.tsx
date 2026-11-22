"use client";

import { useEffect, useState } from "react";
import { confirmDomainLiveAction } from "@/app/admin/actions";
import { PING_BODY } from "@/lib/ping";

type Result = "checking" | "reachable" | "unreachable";

/**
 * Asks the admin's own browser whether the domain reaches this app, which is the question that matters: it is the
 * same position as a visitor. The server cannot judge it alone, because a server often cannot reach its own public
 * addresses, and with an ALIAS record the addresses it sees differ from the visitor's. While the browser checks,
 * only a short note shows. If the browser can reach the domain, the server's "not answering" is replaced by good
 * news; if it cannot either, the explanation and next steps are shown.
 */
export function ReachCheck({
  id,
  host,
  pending,
  pill,
  livePill,
  children,
}: {
  id: number;
  host: string;
  /** Not recorded as live yet, so a success also unpins it from the top of the list. */
  pending: boolean;
  pill: React.ReactNode;
  livePill: React.ReactNode;
  children: React.ReactNode;
}) {
  const [result, setResult] = useState<Result>("checking");

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 8000);
    fetch(`https://${host}/api/ping`, { cache: "no-store", signal: abort.signal })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("not ok"))))
      .then((text) => {
        if (cancelled) return;
        if (text === PING_BODY) {
          setResult("reachable");
          if (pending) void confirmDomainLiveAction(id).catch(() => {});
        } else setResult("unreachable");
      })
      .catch(() => {
        if (!cancelled) setResult("unreachable");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [host, id, pending]);

  if (result === "checking") {
    return (
      <>
        <div className="mt-3">{pill}</div>
        <p className="mt-3 flex items-center gap-2 text-sm text-mute">
          <span className="size-2 animate-pulse rounded-full bg-mute" />
          Checking from your browser...
        </p>
      </>
    );
  }
  if (result === "reachable") {
    return (
      <>
        <div className="mt-3">{livePill}</div>
        <div role="status" className="mt-4 rounded-md border border-ok/30 bg-ok/5 p-4">
          <h4 className="text-sm font-semibold">Reachable from your browser</h4>
          <p className="mt-1 text-sm text-ink/80">
            Visitors can open {host}. This server could not confirm it from its own network, which is common: a server often cannot reach its own public
            addresses, and with an ALIAS or flattened CNAME record the addresses it sees can differ from what visitors get.
          </p>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="mt-3">{pill}</div>
      <p className="mt-3 text-xs font-medium text-danger-ink">Your browser could not reach {host} either.</p>
      {children}
    </>
  );
}
