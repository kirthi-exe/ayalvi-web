import "server-only";
import { normalizeReferralCode } from "../referrals/code";
export const confirmationSubject = "You're on the Ayalvi Early Access list";
export function referralUrl(code: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured || !normalizeReferralCode(code))
    throw new Error("Invalid email configuration");
  const url = new URL(configured);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    url.port ||
    !url.hostname.includes(".") ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    /^\d+(\.\d+){3}$/.test(url.hostname)
  )
    throw new Error("Invalid email configuration");
  return new URL(`/ref/${normalizeReferralCode(code)}`, url).href;
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
export function confirmationTemplate(link?: string) {
  const body =
    "Thanks for joining Ayalvi Early Access. We're building a modern dating experience for Tamil singles across the DACH region.";
  const next = "We'll let you know when your region is ready for testing.";
  const invite =
    "Want to increase your chances of earlier access? Invite your friends.";
  const footer = "Ayalvi · Early access and launch-related communication only.";
  return {
    subject: confirmationSubject,
    text: [
      "You're on the list.",
      body,
      next,
      ...(link ? [invite, link] : []),
      footer,
    ].join("\n\n"),
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#faf7f2;color:#1e1b1c;font-family:Arial,sans-serif"><main style="max-width:560px;margin:0 auto;padding:40px 24px"><p style="color:#7a1f3d;letter-spacing:4px">AYALVI</p><h1 style="font-family:Georgia,serif;font-size:32px">You're on the list.</h1><p style="line-height:1.7">${escapeHtml(body)}</p><p style="line-height:1.7">${escapeHtml(next)}</p>${link ? `<div style="padding:24px 0"><p>${escapeHtml(invite)}</p><a style="color:#7a1f3d;overflow-wrap:anywhere" href="${escapeHtml(link)}">${escapeHtml(link)}</a></div>` : ""}<hr style="border:0;border-top:1px solid #e9e0dc"><p style="font-size:12px;color:#6f6669">${footer}</p></main></body></html>`,
  };
}
