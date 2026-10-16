import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import "./lodestone/lodestone.css";
import { Search } from "lucide-react";
import { getDb } from "@/db/client";
import { currentVerifiedPerson } from "@/lib/session";
import { isPilotOperatorEmail, membershipFor } from "@/pilot/membership";
import { SignOut } from "./SignOut";
import { WorkspaceTabs } from "./lodestone/WorkspaceTabs";
import { Chip, Pill } from "./lodestone/ui";

const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lodestone",
  description: "The campus idea network.",
};

/** "S. Fang" from "Stephen Fang"; the whole name when there is one word. */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : name;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The session reads the request headers before it opens the database, which
  // keeps every page dynamic and lets the build run without one.
  const person = await currentVerifiedPerson();
  const membership = person ? await membershipFor(await getDb(), person.id) : null;
  const operator = !!person && (isPilotOperatorEmail(person.email) || membership?.memberKind === "operator");
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <header className="chrome">
          <div className="chrome-row">
            <Link className="wordmark" href="/">
              Lodestone
              <span className="kicker">The campus idea network</span>
            </Link>
            {person ? <WorkspaceTabs operator={operator} /> : null}
            <div className="chrome-right">
              {person ? <>
                <button type="button" className="search-affordance" aria-label="Search" title="Search comes later"><Search size={16} /><span className="kbd">⌘K</span></button>
                <span className="live-dot" title="Corpus live" />
                <Link className="who" href="/lodestone/tokens" title="API tokens">{shortName(person.name)}<i /></Link>
                <SignOut />
              </> : <Link className="tab on" href="/login">Sign in</Link>}
            </div>
          </div>
        </header>
        <main className="page">{children}</main>
        <footer className="foot-grid">
          <div className="foot-card">
            <div>
              <span className="serif" style={{ fontSize: 24, color: "var(--ink)" }}>Lodestone</span>
              <span className="lab" style={{ display: "block", color: "var(--meta)", fontSize: 8.5, letterSpacing: "0.24em" }}>The campus idea network</span>
            </div>
            <div className="links">
              <Link href="/lodestone">Your cards</Link>
              <Link href="/lodestone#cohort">The cohort</Link>
              <Link href="/lodestone/map">Cohort map <Chip tone="ghost">operators</Chip></Link>
              <Link href="/lodestone/digest">Weekly digest</Link>
              <Link href="/lodestone/tokens">API tokens</Link>
              <a href="https://github.com/fullstackfang/v0-lodestone#readme" target="_blank" rel="noreferrer">How matching works</a>
            </div>
            <p className="rules">Rules carried from Forge: private by default · the cohort sees nine blocks and a name · the map counts and names, it never grades.</p>
          </div>
          <div className="foot-cta drench">
            <svg aria-hidden="true" className="arcs" width="300" height="300" viewBox="0 0 300 300" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2"><circle cx="300" cy="300" r="110" /><circle cx="300" cy="300" r="180" /><circle cx="300" cy="300" r="250" /></svg>
            <span className="lab">Connect a client</span>
            <h3>Send cards from Whetstone.</h3>
            <p>A token acts as you and only you. Revoke it and the client is signed out at once.</p>
            <Pill href="/lodestone/tokens" variant="paper" arrow="up" className="self-start">Create a token</Pill>
          </div>
        </footer>
      </body>
    </html>
  );
}
