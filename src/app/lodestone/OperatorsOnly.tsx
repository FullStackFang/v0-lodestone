import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Pill } from "./ui";

/** What a non-operator sees on an operator page: the map and the roster
 *  give the same answer. */
export function OperatorsOnly({ page }: { page: string }) {
  return <div className="wrap stack">
    <section className="panel paper split">
      <div className="sec">
        <Link className="back dark" href="/lodestone"><ArrowLeft size={14} />Your cards</Link>
        <h1 className="h1 title" style={{ color: "var(--ink)" }}>Directors only</h1>
      </div>
      <div className="sec">
        <p className="lede" style={{ maxWidth: "52ch" }}>The {page} is the program&apos;s view. It counts and names; it never opens a private card. Ask an operator for the operator role to see it.</p>
        <Pill href="/lodestone" variant="line" arrow="left" className="self-start">Back to your cards</Pill>
      </div>
    </section>
  </div>;
}
