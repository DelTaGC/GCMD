/**
 * All live-preview families, in the order `create.ts` installs them. Each
 * family is an independent view plugin with its own decoration set; the
 * sets never overlap in replaced ranges.
 */
import type { Extension } from "@codemirror/state";
import { blockquote } from "./blockquote";
import { codeFence } from "./codeFence";
import { headings } from "./headings";
import { hr } from "./hr";
import { inline } from "./inline";
import { lists } from "./lists";
import { table } from "./table";

export const livePreview: Extension = [headings, inline, lists, blockquote, hr, codeFence, table];
