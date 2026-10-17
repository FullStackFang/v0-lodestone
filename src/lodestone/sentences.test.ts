/** The abstract cut into sentences, the sentences embedded once, and the
 *  three nearest a hit's block picked by cosine. The embedder is the hashed
 *  bag of words, so "nearest" here means "shares the most words". */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { document, documentSentence } from "@/db/schema";
import { putArtifactText } from "@/harness/canonical";
import { ensureSentences, sentencesFor, splitSentences } from "./sentences";
import { testEmbed, testVector } from "./test-embed";
import type { IdeaVector } from "./vectors";

const cut = (text: string) => splitSentences(text).map((s) => text.slice(s.start, s.end));

describe("splitSentences", () => {
  it("splits on a full stop, question or exclamation mark before a capital or a digit", () => {
    const text = "We study leases in four cities. Do most tenants move often? Most of them do! 40 percent move within a year.";
    expect(cut(text)).toEqual(["We study leases in four cities.", "Do most tenants move often?", "Most of them do!", "40 percent move within a year."]);
  });

  it("does not split after a protected abbreviation or a single initial", () => {
    const text =
      "Prior work, e.g. Smith and Jones, measured rents. Results follow J. Doe et al. Closely in method. We compare tenants vs. Owners across cities. As Fig. 2 shows, the gap widens each year.";
    expect(cut(text)).toEqual([
      "Prior work, e.g. Smith and Jones, measured rents.",
      "Results follow J. Doe et al. Closely in method.",
      "We compare tenants vs. Owners across cities.",
      "As Fig. 2 shows, the gap widens each year.",
    ]);
  });

  it("splits where the source dropped the space after a full stop, but not inside an acronym or a decimal", () => {
    // OpenAlex rebuilds many abstracts with no space between sentences.
    const text = "We surveyed tenants in four cities.It also examined their landlords (Smith, 2001).Results held across the U.S.A. sample of version 2.5 leases. Dr. Jones led the work.";
    expect(cut(text)).toEqual([
      "We surveyed tenants in four cities.",
      "It also examined their landlords (Smith, 2001).",
      "Results held across the U.S.A. sample of version 2.5 leases.",
      "Dr. Jones led the work.",
    ]);
  });

  it("does not split inside a number or before a lower-case word", () => {
    const text = "The effect was 3.5 points across the sample. it held in every city we measured.";
    expect(cut(text)).toEqual(["The effect was 3.5 points across the sample. it held in every city we measured."]);
  });

  it("joins a fragment shorter than four words to the sentence before it", () => {
    const text = "We surveyed four hundred arriving students. Results were mixed. Video walkthroughs reduced mid-lease moves.";
    expect(cut(text)).toEqual(["We surveyed four hundred arriving students. Results were mixed.", "Video walkthroughs reduced mid-lease moves."]);
  });

  it("joins a short opening fragment to the sentence after it", () => {
    expect(cut("Background. Tenants sign leases sight unseen in most cities.")).toEqual(["Background. Tenants sign leases sight unseen in most cities."]);
  });

  it("returns offsets that slice back to the sentence, keeping a closing quote", () => {
    const text = "A tenant said the flat was \"nothing like the photos.\" The landlord kept the deposit anyway.";
    const spans = splitSentences(text);
    expect(spans.map((s) => s.text)).toEqual(["A tenant said the flat was \"nothing like the photos.\"", "The landlord kept the deposit anyway."]);
    for (const s of spans) expect(text.slice(s.start, s.end)).toBe(s.text);
  });

  it("returns one sentence for text with no boundary and none for empty text", () => {
    expect(cut("A single unbroken line of text")).toEqual(["A single unbroken line of text"]);
    expect(splitSentences("")).toEqual([]);
  });
});

const ABSTRACT = [
  "International graduate students sign year-long leases for apartments they have never seen.",
  "We survey four hundred arriving students across three universities.",
  "Sight-unseen leasing raises first-term housing dissatisfaction and mid-lease moves.",
  "A walkthrough video shared by the departing tenant reduces both outcomes.",
  "A deposit held in escrow until move-in reduces them further.",
  "We discuss limits of the survey design.",
].join(" ");

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
}, 60_000);

async function addPaper(abstract: string) {
  const [row] = await db.insert(document).values({ sessionId: null, source: "paper", title: "Sight-unseen leasing", text: null }).returning();
  const put = await putArtifactText(db, { artifactId: row.id, sourceFormat: "abstract", parser: "test", text: abstract });
  return { id: row.id, textHash: put.textHash };
}

/** A card row in the block, its vector the fake embedding of its text. */
const entry = (block: string, text: string): IdeaVector => ({ id: text, ideaId: "a".repeat(32), facet: "purpose", block, text, embedding: testVector(text) });

function counting() {
  const calls: string[][] = [];
  const embed = async (texts: string[]) => {
    calls.push(texts);
    return testEmbed(texts);
  };
  return { embed, calls };
}

describe("ensureSentences", () => {
  it("cuts and embeds every sentence in one call, then embeds nothing on a second", async () => {
    const a = await addPaper(ABSTRACT);
    const b = await addPaper("Escrowed deposits protect arriving tenants from fraud. Landlords rarely object to the arrangement.");
    const { embed, calls } = counting();
    expect(await ensureSentences(db, embed, [a.id, b.id])).toBe(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(8);
    const rows = await db.select().from(documentSentence).where(eq(documentSentence.documentId, a.id));
    expect(rows.map((r) => r.ordinal).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(rows.every((r) => r.textHash === a.textHash)).toBe(true);
    for (const r of rows) expect(ABSTRACT.slice(r.startOff, r.endOff)).toBe(splitSentences(ABSTRACT)[r.ordinal].text);

    expect(await ensureSentences(db, embed, [a.id, b.id])).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it("re-cuts a document whose abstract was replaced, and only that one", async () => {
    const a = await addPaper("Students lease flats before arrival in most cities. Few of them ever see the flat first.");
    const b = await addPaper("Deposits sit in escrow until move-in day arrives. Fraud falls when they do.");
    await ensureSentences(db, testEmbed, [a.id, b.id]);
    const next = await putArtifactText(db, { artifactId: a.id, sourceFormat: "abstract", parser: "test", text: "A new abstract replaces the old one entirely here." });
    const { embed, calls } = counting();
    expect(await ensureSentences(db, embed, [a.id, b.id])).toBe(1);
    expect(calls).toEqual([["A new abstract replaces the old one entirely here."]]);
    const rows = await db.select().from(documentSentence).where(eq(documentSentence.documentId, a.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].textHash).toBe(next.textHash);
  });

  it("writes nothing when the embedder has no key", async () => {
    const a = await addPaper("Nothing here is embedded without a key today. The rows wait for one.");
    const none = async (texts: string[]) => ({ vectors: texts.map(() => null), embedded: false, model: null, tokens: null });
    expect(await ensureSentences(db, none, [a.id])).toBe(0);
    expect(await db.select().from(documentSentence).where(eq(documentSentence.documentId, a.id))).toHaveLength(0);
  });
});

describe("sentencesFor", () => {
  it("returns the three sentences nearest the first block, in abstract order, with the block key", async () => {
    // The first test stored ABSTRACT; the same text twice is one row.
    const text = `${ABSTRACT} Further work will follow the next cohort.`;
    const a = await addPaper(text);
    await ensureSentences(db, testEmbed, [a.id]);
    const sentences = splitSentences(text).map((s) => s.text);
    // Each value-proposition entry repeats one sentence, so its cosine is 1
    // and the three it names are the three returned; the other block's
    // entry would pick a fourth and must not.
    const rows = [
      entry("value_proposition", sentences[4]),
      entry("value_proposition", sentences[0]),
      entry("value_proposition", sentences[3]),
      entry("customer_segments", sentences[1]),
    ];
    const hit = { documentId: a.id, blockKeys: ["value_proposition", "customer_segments"], abstractHash: a.textHash };
    const got = await sentencesFor(db, hit, rows);
    expect(got.map((s) => s.text)).toEqual([sentences[0], sentences[3], sentences[4]]);
    expect(got.every((s) => s.block === "value_proposition")).toBe(true);
    for (const s of got) {
      expect(s.cosine).toBeCloseTo(1, 2);
      expect(text).toContain(s.text);
    }
  });

  it("returns as many as the abstract has when it has fewer than three", async () => {
    const text = "Arriving students cannot visit the flat before signing. A video walkthrough stands in for the visit.";
    const a = await addPaper(text);
    await ensureSentences(db, testEmbed, [a.id]);
    const got = await sentencesFor(db, { documentId: a.id, blockKeys: ["channels"], abstractHash: a.textHash }, [entry("channels", "a video walkthrough")]);
    expect(got.map((s) => s.text)).toEqual(splitSentences(text).map((s) => s.text));
  });

  it("returns nothing for rows cut from another text, or a hit with no block", async () => {
    const a = await addPaper("Rows cut from this text belong to its hash alone. A different hash finds none of them.");
    await ensureSentences(db, testEmbed, [a.id]);
    const rows = [entry("channels", "rows cut from this text")];
    expect(await sentencesFor(db, { documentId: a.id, blockKeys: ["channels"], abstractHash: "0".repeat(64) }, rows)).toEqual([]);
    expect(await sentencesFor(db, { documentId: a.id, blockKeys: [], abstractHash: a.textHash }, rows)).toEqual([]);
    expect(await sentencesFor(db, { documentId: a.id, blockKeys: ["revenue_streams"], abstractHash: a.textHash }, rows)).toEqual([]);
  });
});
