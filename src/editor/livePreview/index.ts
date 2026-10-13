/**
 * All live-preview families, in the order `create.ts` installs them. Each
 * family is an independent view plugin (or state field for block widgets)
 * with its own decoration set; the sets never overlap in replaced ranges.
 */
import type { Extension } from "@codemirror/state";
import { blockquote } from "./blockquote";
import { codeFence } from "./codeFence";
import { headings } from "./headings";
import { hr } from "./hr";
import { inline } from "./inline";
import { lists } from "./lists";
import { mermaid } from "./mermaid";
import { table } from "./table";

export const livePreview: Extension = [
  headings,
  inline,
  lists,
  blockquote,
  hr,
  codeFence,
  table,
  mermaid,
];
