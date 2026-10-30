import { WaitlistForm } from "@/components/waitlist/form";
import { Kolam, PhonePreview } from "@/components/landing/visuals";
export default function Home() {
  return (
    <main id="main">
      <section className="hero wrap">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="live-dot" /> ROOTED IN CULTURE. OPEN TO
            POSSIBILITY.
          </span>
          <p className="hero-brand">AYALVI</p>
          <h1>
            Meaningful Tamil
            <br />
            connections
            <br />
            <em>start here.</em>
          </h1>
          <p className="hero-description">
            Meet someone to date, or connect with new Tamil friends who share
            your interests and culture. A modern Tamil platform for genuine
            connections, starting in Switzerland, Germany and Austria.
          </p>
          <a className="button" href="#early-access">
            Join Early Access <span aria-hidden="true">↗</span>
          </a>
          <p className="hero-small">18+ · Early access coming soon</p>
        </div>
        <PhonePreview />
      </section>
      <div className="region-strip">
        <div className="wrap">
          <span>A COMMUNITY. A LITTLE CLOSER.</span>
          <p>
            Switzerland <i /> Germany <i /> Austria
          </p>
          <span>BUILT FOR OUR NEXT CHAPTER</span>
        </div>
      </div>
      <section className="section wrap why" id="why-ayalvi">
        <div>
          <span className="eyebrow">01 / WHY AYALVI</span>
          <h2>
            Finding meaningful Tamil connections
            <br />
            shouldn’t feel <em>this hard.</em>
          </h2>
        </div>
        <div>
          <p>
            Our community is spread across cities in Switzerland, Germany and
            Austria. Meeting someone naturally — whether for dating or
            friendship — can be difficult, and general apps rarely understand
            the importance of shared culture, language and roots.
          </p>
          <p className="strong">
            Ayalvi is built to bring those connections closer.
          </p>
        </div>
      </section>
      <section className="wrap difference">
        <div className="section-heading">
          <span className="eyebrow">A DIFFERENT KIND OF CONNECTION</span>
          <h2>
            Tamil-first. <em>Open to connection.</em>
          </h2>
        </div>
        <p className="connection-intro">
          Choose Dating, Friends, or Both. Modern, not matrimonial — on your
          terms.
        </p>
        <div className="cards connection-cards">
          <article
            className="feature-card connection-dating"
            aria-labelledby="dating-title"
          >
            <span className="card-icon" aria-hidden="true">
              ♡
            </span>
            <h3 id="dating-title">Dating</h3>
            <p>
              Meet someone you’re interested in romantically. Like each other to
              match, then start a conversation.
            </p>
          </article>
          <article
            className="feature-card connection-friends"
            aria-labelledby="friends-title"
          >
            <span className="card-icon" aria-hidden="true">
              <svg
                width="27"
                height="27"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="8" cy="7" r="3" />
                <path d="M2 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 5 5v3" />
              </svg>
            </span>
            <h3 id="friends-title">Friends</h3>
            <p>
              Meet new Tamil friends through shared interests and culture.
              Choose Connect; when it’s mutual, a new connection begins.
            </p>
          </article>
        </div>
        <div className="connection-privacy" aria-labelledby="privacy-title">
          <h3 id="privacy-title">More than photos. Private in both.</h3>
          <p>
            Profiles are photo-free before a mutual connection. Private photos
            unlock only after a mutual Dating match or Friends connection.
          </p>
          <p>
            <strong>Profile approved:</strong> a short live video is manually
            reviewed against your profile photos. You can report, block, unmatch
            in Dating or disconnect in Friends.
          </p>
        </div>
      </section>
      <section className="shared">
        <div className="wrap shared-inner">
          <div>
            <span className="eyebrow">
              CULTURE IS PERSONAL. CONNECTION IS TOO.
            </span>
            <h2>
              Meet someone who
              <br />
              understands where
              <br />
              <em>you come from.</em>
            </h2>
            <p>
              Culture can mean language, traditions, religion, family, food,
              music or simply the way you grew up.
            </p>
            <p>
              Ayalvi creates a space where those shared roots can naturally be
              part of who you connect with — without telling you what that
              connection should become.
            </p>
          </div>
          <div className="shared-art">
            <Kolam />
            <span>
              Many stories.
              <br />
              <em>Something shared.</em>
            </span>
          </div>
        </div>
      </section>
      <section className="section wrap how" id="how-it-works">
        <div className="section-heading">
          <span className="eyebrow">02 / HOW IT WORKS</span>
          <h2>
            A new connection.
            <br />
            <em>A natural beginning.</em>
          </h2>
          <p>A look at what’s coming to Ayalvi.</p>
        </div>
        <div className="steps">
          {[
            [
              "Create your profile",
              "Share your personality through prompts and interests. Add private photos and submit your profile for manual approval.",
            ],
            [
              "Discover Tamil people",
              "Choose Dating, Friends, or Both to meet Tamil people across the DACH region who share your interests.",
            ],
            [
              "Match or connect",
              "Like each other for a Dating match, or both choose Connect for a Friends connection. Private photos unlock and you can start talking.",
            ],
          ].map(([title, body], i) => (
            <article key={title}>
              <span className="step-number">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="early" id="early-access">
        <div className="wrap early-inner">
          <div className="early-copy">
            <span className="eyebrow">
              <span className="live-dot" /> 03 / EARLY ACCESS
            </span>
            <h2>
              Be one of the first
              <br />
              to join <em>Ayalvi.</em>
            </h2>
            <p>
              Ayalvi is currently being built. Join the Early Access waitlist
              and be among the first invited when testing begins.
            </p>
            <div className="early-note">
              <span aria-hidden="true">↗</span>
              <p>
                Something meaningful
                <br />
                starts with showing up.
              </p>
            </div>
            <span className="eyebrow">SWITZERLAND · GERMANY · AUSTRIA</span>
          </div>
          <WaitlistForm />
        </div>
      </section>
    </main>
  );
}
