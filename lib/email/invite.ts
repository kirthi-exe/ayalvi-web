import "server-only";
// Preparation only: intentionally no provider import, recipient, URL or send method.
export function earlyAccessInviteTemplate() {
  const subject = "Your Ayalvi Early Access invite";
  const headline = "You're invited to Ayalvi Early Access.";
  const body =
    "Ayalvi is opening Early Access gradually, and your place is ready.";
  const next = "We'll send you everything you need to get started.";
  return {
    subject,
    text: [
      headline,
      body,
      next,
      "Ayalvi · Early access communication only.",
    ].join("\n\n"),
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body style="background:#faf7f2;color:#1e1b1c;font-family:Arial,sans-serif"><main style="max-width:560px;margin:auto;padding:40px 24px"><p style="color:#7a1f3d;letter-spacing:4px">AYALVI</p><h1 style="font-family:Georgia,serif">${headline}</h1><p>${body}</p><p>${next}</p><p style="font-size:12px">Ayalvi · Early access communication only.</p></main></body></html>`,
  };
}
