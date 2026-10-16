import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Chip, Pill, SectionHead } from "./ui";

const path = vi.hoisted(() => ({ now: "/lodestone" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.now }));
import { WorkspaceTabs } from "./WorkspaceTabs";

describe("shared components", () => {
  it("renders a pill as a link when given an href and as a button otherwise", () => {
    const link = renderToStaticMarkup(<Pill href="/x" variant="ink">Go</Pill>);
    expect(link).toMatch(/^<a [^>]*class="pill pill-ink"/);
    expect(link).toContain('href="/x"');
    expect(renderToStaticMarkup(<Pill variant="line">Save</Pill>)).toMatch(/<button [^>]*class="pill pill-line"/);
  });
  it("renders chips by tone and section heads with the numeral", () => {
    expect(renderToStaticMarkup(<Chip tone="lime">Cohort</Chip>)).toContain('class="chip chip-lime"');
    expect(renderToStaticMarkup(<SectionHead n="02" title="The cohort" tone="var(--blue)" />)).toContain(">02<");
  });
  it("marks the tab whose route prefixes the pathname and hides Map for non-operators", () => {
    path.now = "/lodestone/cards/abc";
    const html = renderToStaticMarkup(<WorkspaceTabs operator={false} />);
    expect(html).toMatch(/class="tab on"[^>]*href="\/lodestone"/);
    expect(html).not.toContain("/lodestone/map");
    path.now = "/lodestone/map";
    expect(renderToStaticMarkup(<WorkspaceTabs operator />)).toMatch(/class="tab on"[^>]*href="\/lodestone\/map"/);
  });
});
