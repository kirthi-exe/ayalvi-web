import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Community Guidelines" };
export default function Guidelines() {
  return (
    <main id="main" className="document wrap">
      <span className="eyebrow">AYALVI / OUR COMMUNITY</span>
      <h1>Connection starts with respect.</h1>
      <p>
        We want Ayalvi to be a welcoming space for Tamil singles to meet on
        their own terms. These standards guide the community we are building.
      </p>
      <h2>Adults only</h2>
      <p>
        Ayalvi is for people aged 18 and older. No sexual exploitation, grooming
        or content that exploits minors is permitted.
      </p>
      <h2>Be respectful</h2>
      <p>
        Respect boundaries, consent and different backgrounds. Harassment, hate
        speech, discrimination, threats and intimidation have no place here.
        Never pressure someone to reply or meet.
      </p>
      <h2>Be yourself</h2>
      <p>
        No impersonation, scams, spam, requests for money or deceptive
        promotion. Represent yourself honestly and respect other people’s
        privacy.
      </p>
      <h2>Safety extends beyond the app</h2>
      <p>
        Stalking, sharing private information, threatening someone offline or
        using the service to facilitate abuse are prohibited. When meeting,
        choose a public place, tell someone you trust and leave if you feel
        uncomfortable. Contact local emergency services if you are in immediate
        danger.
      </p>
      <h2>Speak up and set boundaries</h2>
      <p>
        The Ayalvi app includes report and block functionality; these tools will
        be available in the app, not on this pre-launch website. Serious
        violations may lead to account removal.
      </p>
      <Link href="/contact">Contact Ayalvi →</Link>
    </main>
  );
}
