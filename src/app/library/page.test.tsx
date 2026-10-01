import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Library from "./page";
import Saved from "./saved/page";

const state = vi.hoisted(() => ({ referenceCount: 25, requestedPage: 0 }));
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/session", () => ({ requirePerson: async () => ({ id: "reader" }) }));
vi.mock("@/review/revisions", () => ({ ideasForOwner: async () => [{ card: { id: "idea", offering: "Reader idea" } }] }));
vi.mock("./actions", () => ({ saveComponent: async () => ({}), unsaveComponent: async () => ({}) }));
vi.mock("@/library/library", () => ({
  listComponents: async (_db: unknown, _viewerId: string, input: { page: number }) => {
    state.requestedPage = input.page;
    return { items: [{ revisionId: "revision", key: "offering", facet: "purpose", text: "Source component", segment: "Customer segment", slug: "source", version: 1, title: "Source idea", evidenceType: null }], total: 1, page: 1, pages: 1 };
  },
  savedReferences: async () => Array.from({ length: state.referenceCount }, (_, index) => ({ id: `reference-${index}`, cardId: "idea", revisionId: "revision", component: null, note: "" })),
}));

describe("library page controls", () => {
  beforeEach(() => { state.referenceCount = 25; state.requestedPage = 0; });

  it("uses the effective results page and recoverable save form", async () => {
    const html = renderToStaticMarkup(await Library({ searchParams: Promise.resolve({ page: "1001" }) }));
    expect(state.requestedPage).toBe(1001);
    expect(html).toContain("1 / 1");
    expect(html).not.toContain("Previous");
    expect(html).toContain('class="save-reference"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain("Save reference");
  });

  it("bounds saved-reference output and keeps the next page reachable", async () => {
    const html = renderToStaticMarkup(await Saved({ searchParams: Promise.resolve({}) }));
    expect(html.match(/class="library-result"/g)).toHaveLength(24);
    expect(html).toContain('href="/library/saved?page=2"');
    expect(html).toContain('aria-label="Remove reference"');
    expect(html).toContain('aria-busy="false"');
  });

  it("corrects a stale saved page after its last reference is removed", async () => {
    state.referenceCount = 24;
    const html = renderToStaticMarkup(await Saved({ searchParams: Promise.resolve({ page: "2" }) }));
    expect(html).toContain("1 / 1");
    expect(html).not.toContain("Previous");
  });

  it("keeps a revoked-source tombstone removable without rendering the source", async () => {
    state.referenceCount = 1;
    const html = renderToStaticMarkup(await Saved({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Source publication is no longer available.");
    expect(html).toContain('name="id" value="reference-0"');
    expect(html).toContain('aria-label="Remove reference"');
    expect(html).not.toContain('href="/c/');
  });
});
