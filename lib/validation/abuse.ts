// Extension point: verify a Turnstile token server-side here before insertion.
// V1 uses the honeypot, bounded body, strict validation and same-origin checks.
export async function verifyAbuseProtection(
  _request: Request,
): Promise<boolean> {
  void _request;
  return true;
}
