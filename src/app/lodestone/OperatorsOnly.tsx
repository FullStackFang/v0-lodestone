import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** What a non-operator sees on an operator page: the map and the roster
 *  give the same answer. */
export function OperatorsOnly({ page }: { page: string }) {
  return <article>
    <header className="ls-header"><div><p className="eyebrow">Lodestone · {page}</p><h1>Directors only</h1><p>The map is the program's view. It counts and names regions; it never opens a private card. Ask an operator for the operator role to see it.</p></div><nav className="ls-legend"><Link href="/lodestone"><ArrowLeft size={13} /> Cards</Link></nav></header>
  </article>;
}
