import { describe, expect, it } from "vitest";
import sample from "../../scripts/resources/social-sample.json";
import { validateResource } from "./validation";
import { matchResource } from "./matching";
import { socialExample } from "./social-example";

describe("cited local research example", () => {
  it("anchors every excerpt and offers three sources for the explicit example without matching an unrelated need", () => {
    const resources = sample.map(validateResource);
    expect(resources).toHaveLength(3);
    for (const resource of resources) {
      expect(resource.rawText.split(/\s+/).length).toBeLessThanOrEqual(25);
      expect(matchResource(socialExample, resource)).not.toBeNull();
      expect(matchResource({ title: "Battery recycling", criteria: "Recover lithium using low energy" }, resource)).toBeNull();
    }
  });
});
