import { openSearchPanel, search, SearchQuery, setSearchQuery } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { tableAt } from "../commands/table";
import { markdownExtension } from "../create";
import { matchedCells } from "./tableSearch";

const DOC = "| Run | b |\n| --- | --- |\n| [x](run.md) | `go` |\n| c |\n";

/** Matched cells of the table in `DOC`, with the search panel open or not. */
function matched(query: string, { open = true, caseSensitive = false } = {}): boolean[][] {
  let state = EditorState.create({ doc: DOC, extensions: [markdownExtension(), search()] });
  if (open) {
    // The command only needs state and dispatch to switch the panel on.
    openSearchPanel({
      get state() {
        return state;
      },
      dispatch: (spec: Parameters<EditorState["update"]>[0]) => {
        state = state.update(spec).state;
      },
    } as unknown as Parameters<typeof openSearchPanel>[0]);
  }
  state = state.update({
    effects: setSearchQuery.of(new SearchQuery({ search: query, caseSensitive })),
  }).state;
  const model = tableAt(state, 0);
  if (!model) {
    throw new Error("no table");
  }
  return matchedCells(state, model);
}

describe("table search", () => {
  it("flags cells with a match, in visible text or in hidden markup", () => {
    expect(matched("run")).toEqual([[true, false], [true, false], [false]]);
  });

  it("follows the query options", () => {
    expect(matched("run", { caseSensitive: true })).toEqual([
      [false, false],
      [true, false],
      [false],
    ]);
  });

  it("flags nothing for pipes, the delimiter row or a closed search", () => {
    const none = [[false, false], [false, false], [false]];
    expect(matched("---")).toEqual(none);
    expect(matched("|")).toEqual(none);
    expect(matched("run", { open: false })).toEqual(none);
    expect(matched("")).toEqual(none);
  });
});
