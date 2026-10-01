import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { Compass } from "lucide-react";
import { ensureSession } from "@/lib/session";
import { SignOut } from "./SignOut";

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
              <SignOut />
            </> : <a href="/login">Sign in</a>}
          </nav>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
