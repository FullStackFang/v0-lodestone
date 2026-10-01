import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { BookOpen, Compass, Files, FlaskConical, Users } from "lucide-react";
import { ensureSession } from "@/lib/session";
import { SignOut } from "./SignOut";
import { PilotActivity } from "./PilotActivity";

const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Thesis Forge",
  description: "A raw idea to a Business Thesis Card, through eight gates.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const signedIn = await ensureSession();
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <header className="chrome">
          <a className="wordmark" href="/">
            Thesis Forge
            <span className="kicker">Business Thesis Card</span>
          </a>
          <nav className="app-nav" aria-label="Workspace">
            {signedIn ? <>
              <a href="/lodestone"><Compass size={16} />Lodestone</a>
              <a href="/ideas"><Files size={16} />Ideas</a>
              <a href="/library"><BookOpen size={16} />Library</a>
              <a href="/me"><Users size={16} />Founder</a>
              <a href="/resources"><FlaskConical size={16} />Resources</a>
              <a href="/pilot/measurement">Measurement</a>
              <SignOut />
            </> : <a href="/login">Sign in</a>}
          </nav>
        </header>
        {signedIn && <PilotActivity />}
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
