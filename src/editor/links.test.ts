import { describe, expect, it } from "vitest";
import { classifyLink, linkAt } from "./links";
import { stateWith } from "./testing";

describe("linkAt", () => {
  const doc = "see [plan](../PLAN.md) and <https://x.y> or www.a.b or ![i](img.png) end";

  it("finds the destination of inline links, autolinks, bare URLs and images", () => {
    const state = stateWith(doc);
    expect(linkAt(state, 6)).toBe("../PLAN.md");
    expect(linkAt(state, 15)).toBe("../PLAN.md");
    expect(linkAt(state, 30)).toBe("https://x.y");
    expect(linkAt(state, 46)).toBe("www.a.b");
    expect(linkAt(state, 58)).toBe("img.png");
  });

  it("returns null on plain text", () => {
    const state = stateWith(doc);
    expect(linkAt(state, 1)).toBeNull();
    expect(linkAt(state, doc.length - 1)).toBeNull();
  });
});

describe("classifyLink", () => {
  it("recognizes web, mail and markdown destinations", () => {
    expect(classifyLink("https://example.com/a")).toEqual({
      kind: "web",
      target: "https://example.com/a",
    });
    expect(classifyLink("www.example.com")).toEqual({
      kind: "web",
      target: "https://www.example.com",
    });
    expect(classifyLink("me@example.com")).toEqual({
      kind: "mail",
      target: "mailto:me@example.com",
    });
    expect(classifyLink("mailto:me@example.com").kind).toBe("mail");
    expect(classifyLink("../notes/other.md#top").kind).toBe("markdown");
    expect(classifyLink("C:\\docs\\a.markdown").kind).toBe("markdown");
  });

  it("treats everything else as other", () => {
    expect(classifyLink("image.png").kind).toBe("other");
    expect(classifyLink("ftp://x.y/a.md").kind).toBe("other");
    expect(classifyLink("#section").kind).toBe("other");
  });
});
