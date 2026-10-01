/** Model text must render as text. Both surfaces that show it — the thread
 *  and the public card — are rendered with a script tag in a field and
 *  checked for the literal, escaped string. */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, type Db } from "@/db/client";
import { applyPatch, createCard, createSession } from "@/db/cards";
import { ensurePerson } from "@/harness/ledger";
import { verdicts } from "@/engine/gates";
import { EMPTY_FIELDS } from "@/schema/card";
import { publishRevision } from "@/review/revisions";
import CardPage from "./c/[slug]/page";
import { Thread } from "./t/[id]/Thread";
import { enrollTestMember } from "@/pilot/test-fixtures";

const PAYLOAD = "<script>alert(1)</script><img src=x onerror=alert(2)>";

vi.mock("@/lib/session", () => ({ ensureSession: async () => null, currentPerson: async () => null }));

let db: Db;

beforeAll(async () => {
  db = await getDb();
});

describe("rendering safety", () => {
  it("the card page shows a script in a field literally", async () => {
    const ownerId = await ensurePerson(db, { name: "Render", email: "render@example.edu" });
    await enrollTestMember(db, ownerId);
    const sessionId = await createSession(db, ownerId);
    const card = await createCard(db, { sessionId, door: "blank", ideaText: PAYLOAD });
    await applyPatch(db, card, { offering: PAYLOAD });
    await publishRevision(db, ownerId, card.id, "unlisted");
    const html = renderToStaticMarkup(await CardPage({ params: Promise.resolve({ slug: card.slug }) }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("the thread shows a script in a reply literally", () => {
    const html = renderToStaticMarkup(
      <Thread
        cardId="c"
        slug="s"
        initialTurns={[{ id: "1", input: PAYLOAD, reply: PAYLOAD, stage: "intake", gateResult: "pass", failReason: null, fallbackUsed: false }]}
        initialStage="thesis"
        initialStatus="draft"
        initialVerdicts={verdicts(EMPTY_FIELDS)}
        initialQuestionsLeft={2}
        pendingInput={null}
        door="chat"
      />,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
