"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
export function track(name: string, detail: Record<string, string> = {}) {
  if (
    window.location.pathname === "/admin" ||
    window.location.pathname.startsWith("/admin/")
  )
    return;
  if (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "true")
    window.dispatchEvent(
      new CustomEvent("ayalvi:analytics", { detail: { name, ...detail } }),
    );
}
export function Analytics() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return;
    track("page_view", {
      path: pathname.startsWith("/ref/") ? "/ref/[code]" : pathname,
    });
    const listener = (e: MouseEvent) => {
      const a = (e.target as Element).closest("a");
      if (a?.hash === "#early-access") track("waitlist_cta_clicked");
      if (a?.dataset.social)
        track("social_link_clicked", { platform: a.dataset.social });
    };
    document.addEventListener("click", listener);
    return () => document.removeEventListener("click", listener);
  }, [pathname]);
  return null;
}
export function getUtm() {
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(
    ["utm_source", "utm_medium", "utm_campaign"].map((k) => [
      k,
      (params.get(k) || "")
        .replace(/[<>\x00-\x1f]/g, "")
        .trim()
        .slice(0, 120),
    ]),
  );
}
