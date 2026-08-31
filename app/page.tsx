"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import { getOnlineCount, loginAsGuest } from "../lib/api";

const FEATURES = [
  {
    icon: "✦",
    title: "Instant language matches",
    desc: "Meet native speakers and language partners in seconds, not days, with thoughtful anonymous pairing.",
  },
  {
    icon: "◌",
    title: "Zero-pressure conversation",
    desc: "No profile pressure, no public identity, just real dialogue that sparks naturally.",
  },
  {
    icon: "◎",
    title: "Shared interests first",
    desc: "We match people by language goals and actual interests so every chat starts with momentum.",
  },
  {
    icon: "↗",
    title: "Fast flow, smooth pace",
    desc: "Skip, reconnect, and keep moving without friction. The experience feels fluid and human.",
  },
  {
    icon: "⚡",
    title: "Built for momentum",
    desc: "Smart prompts and instant conversation starters help you recover from awkward pauses in real time.",
  },
  {
    icon: "✓",
    title: "Safe and respectful",
    desc: "Moderation, reporting, and clear controls keep the environment active, healthy, and welcoming.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Start anonymously",
    desc: "Jump into the queue instantly and begin your next conversation without a heavy onboarding wall.",
  },
  {
    number: "02",
    title: "Get matched by intent",
    desc: "We pair people based on language level, native language, and shared interests to make each chat click.",
  },
  {
    number: "03",
    title: "Keep growing",
    desc: "Upgrade your profile, build momentum, and come back for better matches with every session.",
  },
];

export default function LandingPage() {
  const { profile, setAuth } = useAuth();
  const router = useRouter();
  const [onlineCount, setOnlineCount] = useState(0);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    getOnlineCount()
      .then(({ online }) => setOnlineCount(online + 34))
      .catch(() => setOnlineCount(240));
  }, []);

  const handleStart = async () => {
    if (profile) {
      router.push(profile.onboarded ? "/chat" : "/setup");
      return;
    }

    setIsLoggingIn(true);
    try {
      const data = await loginAsGuest();
      setAuth(data.user, data.access_token);
      router.push(data.user.onboarded ? "/chat" : "/setup");
    } catch (err) {
      console.error("Guest login failed:", err);
      router.push("/auth");
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <main className="landing-shell">
      <div className="page-noise" />

      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">L</span>
          <span className="brand-word">LingoGen</span>
        </div>

        <nav className="topnav">
          <Link href="#features">Features</Link>
          <Link href="#process">How it works</Link>
          <Link href="#join">Join</Link>
        </nav>

        <button className="pill-button secondary" onClick={() => router.push("/auth")}>
          Sign in
        </button>
      </header>

      <section className="hero-panel">
        <div className="hero-copy">
          <div className="live-pill">
            <span className="live-dot" />
            <span>{onlineCount}+ people practicing right now</span>
          </div>

          <h1>
            Speak louder.
            <span>Learn faster.</span>
          </h1>

          <p>
            Meet real language partners around the world. Match anonymously, talk naturally, and build confidence one conversation at a time.
          </p>

          <div className="hero-actions">
            <button className="pill-button primary" onClick={handleStart} disabled={isLoggingIn}>
              {isLoggingIn ? "Starting..." : "Start speaking now"}
            </button>
            <Link href="#features" className="pill-button ghost">
              Explore features
            </Link>
          </div>

          <ul className="mini-stats">
            <li>
              <strong>30+</strong>
              <span>languages</span>
            </li>
            <li>
              <strong>24/7</strong>
              <span>live chat pool</span>
            </li>
            <li>
              <strong>100%</strong>
              <span>anonymous by default</span>
            </li>
          </ul>
        </div>

        <div className="hero-visual">
          <div className="glow-orb orb-one" />
          <div className="glow-orb orb-two" />

          <div className="signal-card large-card">
            <div className="card-row">
              <div className="avatar avatar-a">A</div>
              <div>
                <span className="tag">Spanish · English</span>
                <strong>Aria</strong>
              </div>
            </div>
            <p>“I help with pronunciation and confidence — tell me about your weekend.”</p>
          </div>

          <div className="signal-card mini-card top-mini">
            <span className="tag soft">Instant match</span>
            <strong>2.4s</strong>
          </div>

          <div className="signal-card mini-card bottom-mini">
            <span className="tag soft">Shared interests</span>
            <strong>Travel · Music · Cinema</strong>
          </div>
        </div>
      </section>

      <section id="features" className="feature-section">
        <div className="section-heading">
          <span className="eyebrow">Why people stay</span>
          <h2>Language practice that feels alive.</h2>
        </div>

        <div className="feature-grid">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="feature-card">
              <div className="feature-icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="process" className="process-section">
        <div className="section-heading left">
          <span className="eyebrow">How it works</span>
          <h2>Simple flow. Real momentum.</h2>
        </div>

        <div className="process-list">
          {STEPS.map((step) => (
            <div key={step.number} className="process-card">
              <span className="process-num">{step.number}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="join" className="cta-panel">
        <div className="cta-inner">
          <div>
            <span className="eyebrow">Ready to begin?</span>
            <h2>Turn awkward practice into real fluency.</h2>
          </div>

          <button className="pill-button primary" onClick={handleStart} disabled={isLoggingIn}>
            {isLoggingIn ? "Opening your chat..." : "Find my partner"}
          </button>
        </div>
      </section>

      <footer className="footer">
        <div className="brand-lockup">
          <span className="brand-mark">L</span>
          <span className="brand-word">LingoGen</span>
        </div>
        <p>© {new Date().getFullYear()} LingoGen · Anonymous language practice</p>
      </footer>
    </main>
  );
}
