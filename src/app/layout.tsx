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
  title: "Lodestone",
  description: "The campus idea network.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const signedIn = await ensureSession();
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <header className="chrome">
          <a className="wordmark" href="/">
            Lodestone
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
