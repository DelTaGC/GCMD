/**
 * Stand-in for `elkjs/lib/elk.bundled.js` (Vite alias in `vite.config.ts`).
 * elkjs is EPL-2.0 without a GPL secondary-license grant, so GCMD
 * (GPL-3.0-or-later, ADR 0011) does not ship it. Mermaid imports it only for
 * the optional ELK layouts; a diagram that asks for one shows this error in
 * its widget and every other diagram keeps the default dagre layout.
 */
export const ELK_UNAVAILABLE =
  'The ELK layout is not available in GCMD. Remove "layout: elk" to use the default layout.';

export default class ElkUnavailable {
  layout(): Promise<never> {
    return Promise.reject(new Error(ELK_UNAVAILABLE));
  }
}
