import type { Metadata } from "next";
import { normalizeReferralCode } from "@/lib/referrals/code";
import { ReferralArrival } from "@/components/referrals/arrival";
export const metadata: Metadata = {
  title: "Early Access",
  robots: { index: false, follow: false },
};
export default async function ReferralPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const utm = new URLSearchParams();
  for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
    const value = query[key];
    if (typeof value === "string")
      utm.set(
        key,
        value
          .replace(/[<>\x00-\x1f]/g, "")
          .trim()
          .slice(0, 120),
      );
  }
  const target = `/${utm.size ? "?" + utm.toString() : ""}#early-access`;
  return (
    <main id="main" className="document wrap">
      <h1>A connection starts here.</h1>
      <p>Taking you to Ayalvi Early Access.</p>
      <ReferralArrival code={normalizeReferralCode(code)} target={target} />
    </main>
  );
}
