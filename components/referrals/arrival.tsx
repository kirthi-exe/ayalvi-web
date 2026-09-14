"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { rememberReferral, forgetReferral } from "@/lib/referrals/storage";
import { track } from "@/lib/analytics/events";
export function ReferralArrival({
  code,
  target,
}: {
  code: string | null;
  target: string;
}) {
  const router = useRouter();
  useEffect(() => {
    if (code) rememberReferral(code);
    else forgetReferral();
    track("referral_link_opened");
    router.replace(target);
  }, [code, target, router]);
  return (
    <p>
      <a href={target}>Continue to Ayalvi Early Access →</a>
    </p>
  );
}
