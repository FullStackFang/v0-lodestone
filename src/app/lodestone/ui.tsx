/** The shared pieces of the redesign, as DESIGN.md names them: the pill
 *  button with its circle-arrow, the chip, the numbered section head and the
 *  small go-arrow. Server-safe: no hooks, no state. Classes live in
 *  `lodestone.css`. */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export type PillVariant = "ink" | "paper" | "line" | "ghost";
export type ArrowKind = "right" | "up" | "down" | "check" | "left" | "none";
export type ChipTone = "lime" | "ghost" | "navy" | "amber" | "ox" | "plum" | "glass";

const ARROWS: Record<Exclude<ArrowKind, "none">, string> = {
  right: "M5 12h14M12 5l7 7-7 7",
  left: "M19 12H5M12 19l-7-7 7-7",
  up: "M7 17 17 7M7 7h10v10",
  down: "M12 5v14M5 12l7 7 7-7",
  check: "M20 6 9 17l-5-5",
};

export function ArrowIcon({ kind = "up", size = 14 }: { kind?: Exclude<ArrowKind, "none">; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ARROWS[kind]} /></svg>;
}

export function Pill({ href, variant, arrow = "right", children, className, type = "button", disabled, small }: {
  href?: string;
  variant: PillVariant;
  arrow?: ArrowKind;
  children: ReactNode;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  /** 40px tall with a 28px arrow, for secondary places. */
  small?: boolean;
}) {
  const cls = ["pill", `pill-${variant}`, small ? "pill-small" : "", className ?? ""].filter(Boolean).join(" ");
  const body = <>{children}{arrow !== "none" ? <span className="go"><ArrowIcon kind={arrow} size={small ? 13 : 16} /></span> : null}</>;
  if (href && /^https?:/.test(href)) return <a className={cls} href={href} target="_blank" rel="noreferrer">{body}</a>;
  if (href) return <Link className={cls} href={href}>{body}</Link>;
  return <button className={cls} type={type} disabled={disabled}>{body}</button>;
}

export function Chip({ tone, children, title }: { tone: ChipTone; children: ReactNode; title?: string }) {
  return <span className={`chip chip-${tone}`} title={title}>{children}</span>;
}

/** `01 Your cards`: the numeral in italic serif in the section's colour. */
export function SectionHead({ n, title, tone, children, size }: { n: string; title: ReactNode; tone: string; children?: ReactNode; size?: "small" }) {
  return <div className={size === "small" ? "sec sec-small" : "sec"}>
    <div className="sec-row"><span className="num" style={{ color: tone }}>{n}</span><h2 className="h2">{title}</h2></div>
    {children}
  </div>;
}

/** The 30px circle-arrow that closes a row or a card. */
export function Go({ tone, kind = "up", style }: { tone?: string; kind?: Exclude<ArrowKind, "none">; style?: CSSProperties }) {
  return <span className="circ" style={{ color: tone, ...style }}><ArrowIcon kind={kind} size={13} /></span>;
}

/** The dotted-leader row of a nameplate panel. */
export function Leader({ n, href, children }: { n: string; href: string; children: ReactNode }) {
  return <Link className="leader" href={href}><span className="lab">{n}</span>{children}<span className="dots" /><span className="arrow">↗</span></Link>;
}
