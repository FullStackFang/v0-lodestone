import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Thread } from "@/app/t/[id]/Thread";
import { verdicts } from "@/engine/gates";
import { EMPTY_FIELDS } from "@/schema/card";

function thread(complete: boolean) {
  return renderToStaticMarkup(<Thread cardId="idea-id" slug="private-slug" initialTurns={[]} initialStage={complete ? "render" : "intake"} initialStatus={complete ? "complete" : "draft"} initialVerdicts={verdicts(EMPTY_FIELDS)} initialQuestionsLeft={complete ? 0 : null} pendingInput={null} door="chat" />);
}

describe("conversation navigation", () => {
  it("allows manual draft editing before the first model turn", () => {
    expect(thread(false)).toContain('href="/ideas/idea-id"');
  });

  it("routes both completion actions to the owner publication preview", () => {
    const html = thread(true);
    expect(html.match(/href="\/ideas\/idea-id\/publish"/g)).toHaveLength(2);
    expect(html).not.toContain('href="/c/private-slug"');
    expect(html).not.toContain("Anyone with the link can read it");
  });
});
