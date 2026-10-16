import { CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";
import type { DirEntry } from "../ipc/paths";
import { markdownExtension } from "./create";
import { documentPathExtension } from "./document";
import {
  completeLinkDestination,
  dirLister,
  encodeName,
  githubSlug,
  headingAnchors,
  linkDestinationAt,
  type DirLister,
} from "./linkCompletion";
import { collectHeadings } from "./outline";

const ENTRIES: DirEntry[] = [
  { name: ".git", isDir: true },
  { name: "docs", isDir: true },
  { name: "a.md", isDir: false },
  { name: "b.png", isDir: false },
  { name: "my file.txt", isDir: false },
];

/** A parsed state with the cursor at the end (or at `|`). */
function setup(
  text: string,
  lister: DirLister = () => Promise.resolve(ENTRIES),
  path: string | null = "C:/notes/doc.md",
): EditorState {
  const marker = text.indexOf("|");
  const doc = marker >= 0 ? text.slice(0, marker) + text.slice(marker + 1) : text;
  const state = EditorState.create({
    doc,
    selection: { anchor: marker >= 0 ? marker : doc.length },
    extensions: [markdownExtension(), documentPathExtension(path), dirLister.of(lister)],
  });
  ensureSyntaxTree(state, doc.length, 5000);
  return state;
}

function complete(state: EditorState): Promise<CompletionResult | null> {
  return completeLinkDestination(new CompletionContext(state, state.selection.main.head, false));
}

function labels(result: CompletionResult | null): string[] {
  return result ? result.options.map((o) => o.label) : [];
}

describe("linkDestinationAt", () => {
  const at = (text: string) => {
    const state = setup(text);
    return linkDestinationAt(state, state.selection.main.head);
  };

  it("finds inline link and image destinations", () => {
    expect(at("See [x](")).toEqual({ from: 8, text: "", image: false, angle: false });
    expect(at("![alt](img/p")).toEqual({ from: 7, text: "img/p", image: true, angle: false });
    expect(at("[x](<my fo")).toEqual({ from: 5, text: "my fo", image: false, angle: true });
    expect(at("[a [b] c](x")).toBeNull();
  });

  it("finds reference definitions", () => {
    expect(at("[ref]: do")).toEqual({ from: 7, text: "do", image: false, angle: false });
    expect(at("[ref]: <a b")).toEqual({ from: 8, text: "a b", image: false, angle: true });
    expect(at("[ref]:")).toBeNull();
  });

  it("ignores text outside destinations and code", () => {
    expect(at("(foo")).toBeNull();
    expect(at("[x](a.md) and more")).toBeNull();
    expect(at("[x](a b")).toBeNull();
    expect(at("`[x](a`")).toBeNull();
    expect(at("```\n[x](a|\n```")).toBeNull();
  });
});

describe("anchors and encoding", () => {
  it("slugs headings like GitHub", () => {
    expect(githubSlug("Hello, World!")).toBe("hello-world");
    expect(githubSlug("Ça va ?")).toBe("ça-va-");
    expect(githubSlug("snake_case and-dash")).toBe("snake_case-and-dash");
    expect(githubSlug("Version 2.0")).toBe("version-20");
  });

  it("numbers repeated anchors", () => {
    const state = setup("# A\n\n# A\n\n# A-1\n\n# B");
    expect(headingAnchors(collectHeadings(state))).toEqual(["a", "a-1", "a-1-1", "b"]);
  });

  it("percent-encodes what the destination syntax needs", () => {
    expect(encodeName("my file (1).md", false)).toBe("my%20file%20%281%29.md");
    expect(encodeName("100%.png", false)).toBe("100%25.png");
    expect(encodeName("a#b?.md", false)).toBe("a%23b%3F.md");
    expect(encodeName("my file (1).md", true)).toBe("my file (1).md");
    expect(encodeName("a<b>.md", true)).toBe("a%3Cb%3E.md");
  });
});

describe("completeLinkDestination", () => {
  it("lists the document's folder, folders first, hidden entries left out", async () => {
    const lister = vi.fn<DirLister>(() => Promise.resolve(ENTRIES));
    const state = setup("See [x](", lister);
    const result = await complete(state);
    expect(lister).toHaveBeenCalledWith("C:/notes/doc.md", "");
    expect(result?.from).toBe(8);
    expect(labels(result)).toEqual(["docs/", "a.md", "b.png", "my%20file.txt"]);
    expect(result?.options.find((o) => o.label === "a.md")?.boost).toBe(1);
  });

  it("keeps spaces inside angle brackets", async () => {
    expect(labels(await complete(setup("[x](<")))).toContain("my file.txt");
  });

  it("offers only folders and images for an image", async () => {
    expect(labels(await complete(setup("![](")))).toEqual(["docs/", "b.png"]);
  });

  it("lists the typed subfolder and completes the last segment", async () => {
    const lister = vi.fn<DirLister>(() => Promise.resolve(ENTRIES));
    const state = setup("[x](../docs/a", lister);
    const result = await complete(state);
    expect(lister).toHaveBeenCalledWith("C:/notes/doc.md", "../docs/");
    expect(result?.from).toBe("[x](../docs/".length);
  });

  it("shows hidden entries and the parent folder after a dot", async () => {
    expect(labels(await complete(setup("[x](.")))).toEqual([
      ".git/",
      "docs/",
      "a.md",
      "b.png",
      "my%20file.txt",
      "../",
    ]);
  });

  it("offers this document's headings after #", async () => {
    const result = await complete(setup("# Intro\n\n## Intro\n\n## Next step\n\nSee [x](#"));
    expect(labels(result)).toEqual(["#intro", "#intro-1", "#next-step"]);
    expect(result?.options[2]?.detail).toBe("Next step");
  });

  it("stays quiet for URLs, fragments of other files and failed listings", async () => {
    const lister = vi.fn<DirLister>(() => Promise.resolve(ENTRIES));
    expect(await complete(setup("[x](https:", lister))).toBeNull();
    expect(await complete(setup("[x](www.", lister))).toBeNull();
    expect(await complete(setup("[x](a.md#", lister))).toBeNull();
    expect(lister).not.toHaveBeenCalled();
    const failing: DirLister = () => Promise.reject(new Error("no folder"));
    expect(await complete(setup("[x](", failing, null))).toBeNull();
  });
});
