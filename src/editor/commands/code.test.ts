import type { EditorState, TransactionSpec } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { infoAliasFor } from "../languages";
import { stateWith } from "../testing";
import { detectFenceLanguage, fenceAt, setFenceLanguageAt } from "./code";

function target(
  doc: string,
  cursor?: number,
): {
  state: EditorState;
  dispatch: (tr: TransactionSpec) => void;
  text: () => string;
} {
  let state = stateWith(doc, cursor);
  return {
    get state() {
      return state;
    },
    dispatch: (tr) => {
      state = state.update(tr).state;
    },
    text: () => state.doc.toString(),
  };
}

describe("setFenceLanguageAt", () => {
  it("adds a language to an unlabeled fence", () => {
    const t = target("```\ncode\n```");
    expect(setFenceLanguageAt(t, 0, "ts")).toBe(true);
    expect(t.text()).toBe("```ts\ncode\n```");
  });

  it("replaces only the language word and keeps attributes", () => {
    const t = target("~~~json {meta}\n{}\n~~~");
    expect(setFenceLanguageAt(t, 0, "yaml")).toBe(true);
    expect(t.text()).toBe("~~~yaml {meta}\n{}\n~~~");
  });

  it("clears the language", () => {
    const t = target("```python\nx\n```");
    expect(setFenceLanguageAt(t, 0, "")).toBe(true);
    expect(t.text()).toBe("```\nx\n```");
  });

  it("does nothing outside a fence", () => {
    const t = target("text");
    expect(setFenceLanguageAt(t, 0, "ts")).toBe(false);
  });
});

describe("detectFenceLanguage", () => {
  it("labels an unlabeled fence with the detected language", () => {
    const doc = "```\n#!/usr/bin/env bash\nset -euo pipefail\necho hi\n```";
    const t = target(doc, 6);
    expect(detectFenceLanguage(t)).toBe(true);
    expect(t.text().startsWith("```shell\n")).toBe(true);
  });

  it("leaves labeled fences and undetectable content alone", () => {
    const labeled = target("```ts\nlet a = 1;\n```", 8);
    expect(detectFenceLanguage(labeled)).toBe(false);
    const prose = target("```\njust some words here\n```", 8);
    expect(detectFenceLanguage(prose)).toBe(false);
    expect(prose.text()).toBe("```\njust some words here\n```");
  });
});

describe("fenceAt / infoAliasFor", () => {
  it("finds the fence around a position", () => {
    const state = stateWith("p\n\n```\nx\n```\n\nq");
    expect(fenceAt(state, 7)?.name).toBe("FencedCode");
    expect(fenceAt(state, 0)).toBeNull();
  });

  it("maps display names to info-string words", () => {
    expect(infoAliasFor("TypeScript")).toBe("typescript");
    expect(infoAliasFor("C++")).toBe("cpp");
    expect(infoAliasFor("C#")).toBe("csharp");
    expect(infoAliasFor("Shell")).toBe("shell");
  });
});
