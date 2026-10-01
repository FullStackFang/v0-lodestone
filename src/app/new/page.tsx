import { requirePerson } from "@/lib/session";
import { startBlank, startWithMaterial } from "../actions";
import { ArrowRight } from "lucide-react";
import { startResearch } from "./actions";
import { ResourceForm } from "../resources/ResourceForm";
import "../resources/resources.css";
import { socialExample } from "@/resources/social-example";

export const dynamic = "force-dynamic";
export default async function NewIdea({ searchParams }: { searchParams: Promise<{ example?: string }> }) {
  await requirePerson();
  const example = (await searchParams).example === "social" ? socialExample : undefined;
  return <><div className="page-heading"><h1>New idea</h1><a href="/ideas">My ideas</a></div>
    <section className="resource-workspace research-intake" aria-labelledby="research-intake-title">
      <div><h2 id="research-intake-title">Find research for your next move</h2><p>Save your idea and one unresolved need. Review up to three cited suggestions, then choose what to try.</p></div>
      {example ? <p className="muted">Social-connections example. Edit it to fit your idea; nothing is saved until you submit.</p> : <a href="/new?example=social">Try the social-connections example</a>}
      <ResourceForm action={startResearch} pendingMessage="Saving your idea and checking research…">
        <label>Your idea<textarea key={example?.idea ?? "idea"} name="idea" rows={2} required maxLength={2000} defaultValue={example?.idea} placeholder="A local group that helps people build lasting friendships" /></label>
        <label>What is still unresolved?<input key={example?.title ?? "title"} name="title" required maxLength={200} defaultValue={example?.title} placeholder="Help people reconnect after their first conversation" /></label>
        <label>What would progress look like?<textarea key={example?.criteria ?? "criteria"} name="criteria" required rows={2} maxLength={2000} defaultValue={example?.criteria} placeholder="People enjoy conversations, feel comfortable reaching out, and meet again." /></label>
        <p className="muted">Your idea stays private. Suggestions come from the available curated research; there may be fewer than three.</p>
        <button className="button" type="submit">Save idea and find research<ArrowRight size={16} /></button>
      </ResourceForm>
    </section>
    <div className="intake-columns">
      <section className="form-stack"><h2>From a conversation</h2>
        <form action={startBlank}><button className="button">Start an idea<ArrowRight size={16} /></button></form>
      </section>
      {(["deck", "resume"] as const).map((door) => <section className="form-stack" key={door}>
        <h2>{door === "deck" ? "Pitch deck" : "Resume or experience"}</h2>
        <form action={startWithMaterial} className="form-stack">
          <input type="hidden" name="door" value={door} />
          <label>{door === "deck" ? "Deck text" : "Resume text"}<textarea name="text" rows={7} maxLength={60_000} /></label>
          <label>Text file<input type="file" name="file" accept=".txt,.md,.markdown" /></label>
          <button className="button">Create idea<ArrowRight size={16} /></button>
        </form>
      </section>)}
    </div>
  </>;
}
