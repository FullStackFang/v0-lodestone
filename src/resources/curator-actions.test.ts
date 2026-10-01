import { describe, expect, it, vi } from "vitest";

vi.mock("@/resources/curator", () => ({ requireCurator: async () => { throw new Error("Curator access required"); } }));
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));

import { saveHighlight, removeHighlight, finishSession } from "@/app/read/[artifactId]/actions";
import { judgeCard } from "@/app/read/[artifactId]/card-actions";
import { answerFollowup } from "@/app/read/[artifactId]/followup-actions";
import { removeAnnotation } from "@/app/annotations/actions";
import { resolve } from "@/app/reconcile/actions";

describe("curator-only legacy mutation boundary", () => {
  it.each([finishSession, judgeCard, answerFollowup, removeAnnotation, resolve])("refuses a direct action call without curator access", async (action) => {
    await expect(action(new FormData())).rejects.toThrow("Curator access required");
  });
  it("refuses highlight creation and removal before touching annotations", async () => {
    expect(await saveHighlight({ sessionId: "anything", start: 0, end: 1, selected: "x", tag: "purpose", subtype: null, note: null })).toMatchObject({ ok: false, error: "Curator access required" });
    expect(await removeHighlight("anything")).toMatchObject({ ok: false, error: "Curator access required" });
  });
});
