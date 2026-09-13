import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "You’re on the list",
  robots: { index: false, follow: false },
};
export default function Success() {
  return (
    <main id="main" className="document success wrap">
      <div className="success-symbol" aria-hidden="true">
        ◎
      </div>
      <span className="eyebrow">A NEW CHAPTER IS COMING</span>
      <h1>You&apos;re on the list.</h1>
      <p>
        Thanks for joining Ayalvi Early Access. We’ll let you know when your
        region is ready for testing.
      </p>
      <Link className="button" href="/">
        Back to Ayalvi <span aria-hidden="true">↗</span>
      </Link>
      <section hidden aria-label="Future referrals">
        <p>
          Want to increase your chances of earlier access? Invite your friends.
        </p>
      </section>
    </main>
  );
}
