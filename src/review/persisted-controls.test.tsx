import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, type Db } from "@/db/client";
import { createCard, createSession } from "@/db/cards";
import { ensurePerson } from "@/harness/ledger";
import { addReview, createExperiment, publishRevision, respondToReview, saveIdea, updateExperiment } from "./revisions";
import { ActionForm } from "./ActionForm";
import IdeaPage from "@/app/ideas/[id]/page";
import { ProfileContent } from "@/app/me/profile-content";
import { meView } from "@/harness/founder/me";
import { savePreferences } from "@/harness/founder/preferences";
import ResourcesPage from "@/app/resources/page";
import { createNeed, updateNeed } from "@/resources/service";
import { enrollTestMember } from "@/pilot/test-fixtures";

const actor = vi.hoisted(() => ({ id: "", email: "persisted-controls@example.edu" }));
vi.mock("@/lib/session", () => ({ requirePerson: async () => actor }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
let db: Db;
let peerId: string;
beforeAll(async () => {
  db = await getDb();
  actor.id = await ensurePerson(db, { name: "Editor", email: "persisted-controls@example.edu" });
  peerId = await ensurePerson(db, { name: "Reviewer", email: "persisted-controls-peer@example.edu" });
  await enrollTestMember(db, actor.id);
  await enrollTestMember(db, peerId);
});

type Element = ReactElement<{ children?: ReactNode; name?: string; value?: string; defaultValue?: string; defaultChecked?: boolean }>;
function descendants(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...descendants(element.props.children)];
}

describe("persisted owner controls", () => {
  it("refreshes persisted discovery choices without resetting the preference form", async () => {
    const before = descendants(ProfileContent({ view: await meView(db, actor.id) }));
    await savePreferences(db, actor.id, { discoverable: true, availability: "full_time", intent: "collaborator" });
    const after = descendants(ProfileContent({ view: await meView(db, actor.id) }));
    for (const name of ["discoverable", "availability", "intent"]) {
      expect(after.find((e) => e.props.name === name)?.key, name).not.toBe(before.find((e) => e.props.name === name)?.key);
    }
    expect(after.find((e) => e.props.name === "discoverable")?.props.defaultChecked).toBe(true);
    expect(after.find((e) => e.props.name === "availability")?.props.defaultValue).toBe("full_time");
  });

  it("refreshes persisted need controls while leaving creation controls unchanged", async () => {
    const card = await createCard(db, { sessionId: await createSession(db, actor.id), door: "blank" });
    const need = await createNeed(db, actor.id, { cardId: card.id, title: "Original need", criteria: "Original criterion", monitoring: true });
    const before = descendants(await ResourcesPage({ searchParams: Promise.resolve({}) }));
    await updateNeed(db, actor.id, need.id, { title: "Updated need", criteria: "Updated criterion", status: "paused", monitoring: false });
    const after = descendants(await ResourcesPage({ searchParams: Promise.resolve({}) }));
    for (const name of ["title", "criteria", "status", "monitoring"]) {
      expect(after.find((e) => e.props.name === name)?.key, name).not.toBe(before.find((e) => e.props.name === name)?.key);
    }
    expect(after.find((e) => e.props.name === "status")?.props.defaultValue).toBe("paused");
    expect(after.find((e) => e.props.name === "monitoring")?.props.defaultChecked).toBe(false);
    expect(after.filter((e) => e.props.name === "monitoring").at(-1)?.key).toBeNull();
  });

  it("remounts changed persisted controls after revalidation without losing the form receipt", async () => {
    const card = await createCard(db, { sessionId: await createSession(db, actor.id), door: "blank" });
    await saveIdea(db, actor.id, card.id, { offering: "Original offering" });
    const revision = await publishRevision(db, actor.id, card.id, "unlisted");
    const review = await addReview(db, peerId, revision.id, { component: "offering", kind: "challenge", text: "Who pays?" });
    const experiment = await createExperiment(db, actor.id, card.id, { hypothesis: "Two buyers pay", method: "Paid pilot", criterion: "Two deposits", revisionId: revision.id });
    const before = descendants(await IdeaPage({ params: Promise.resolve({ id: card.id }) }));
    await respondToReview(db, actor.id, review.id, { disposition: "addressed", response: "Buyer interviews completed." });
    await updateExperiment(db, actor.id, experiment.id, { status: "complete", result: "Two buyers paid", evidenceType: "observed_behavior", shareResult: true });
    await saveIdea(db, actor.id, card.id, { offering: "Updated offering" });
    const after = descendants(await IdeaPage({ params: Promise.resolve({ id: card.id }) }));

    // A changed key mounts the new default before React's successful-action reset.
    for (const name of ["offering", "disposition", "response", "status", "result", "evidenceType", "shareResult"]) {
      const previous = before.find((e) => e.props.name === name)!;
      const current = after.find((e) => e.props.name === name)!;
      expect(current.key, name).not.toBe(previous.key);
    }
    expect(after.find((e) => e.props.name === "disposition")?.props.defaultValue).toBe("addressed");
    expect(after.find((e) => e.props.name === "status")?.props.defaultValue).toBe("complete");
    expect(after.find((e) => e.props.name === "shareResult")?.props.defaultChecked).toBe(true);
    expect(after.filter((e) => e.type === ActionForm).map((e) => e.key)).toEqual(before.filter((e) => e.type === ActionForm).map((e) => e.key));
  });
});
