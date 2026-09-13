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
            Tamil connections.
            <br />
            Modern dating.
            <br />
            <em>Shared roots.</em>
          </h1>
          <p className="hero-description">
            Meeting other Tamil singles shouldn’t be this difficult. Ayalvi
            helps Tamil singles across the DACH region meet, connect and build
            meaningful relationships — while staying connected to their culture,
            roots and values.
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
            Finding Tamil singles
            <br />
            shouldn’t feel <em>this hard.</em>
          </h2>
        </div>
        <div>
          <p>
            Our community is spread across different cities in Switzerland,
            Germany and Austria. Meeting someone naturally can be difficult, and
            general dating apps rarely understand the importance of shared
            culture, language and roots.
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
            Familiar roots. <em>Fresh possibilities.</em>
          </h2>
        </div>
        <div className="cards">
          {[
            [
              "◎",
              "Tamil-first",
              "Built around a community that understands where you come from.",
            ],
            [
              "✳",
              "More than photos",
              "Show your personality through prompts, interests, languages, lifestyle and dating intentions.",
            ],
            [
              "↗",
              "Modern, not matrimonial",
              "You decide who you meet, who you like and what kind of relationship you’re looking for.",
            ],
          ].map(([icon, title, body]) => (
            <article className="feature-card" key={title}>
              <span className="card-icon" aria-hidden="true">
                {icon}
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
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
              part of dating — without telling you how you should live them.
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
              "Show who you are through photos, prompts, interests and lifestyle.",
            ],
            [
              "Discover Tamil singles",
              "Meet people across the DACH region who fit what you’re looking for.",
            ],
            [
              "Match and connect",
              "If you both like each other, start talking and see where it goes.",
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
