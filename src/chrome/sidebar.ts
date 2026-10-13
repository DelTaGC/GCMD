/**
 * The outline sidebar: a collapsible heading tree, click to jump, current
 * section highlighted. Plain DOM; the headings come from
 * `editor/outline.ts` through `app/outline.ts`. Collapse state is keyed by
 * heading level and text (with an occurrence counter) so it survives edits
 * elsewhere in the document.
 */
import type { Heading, OutlineNode } from "../editor/outline";

export interface Sidebar {
  readonly element: HTMLElement;
  readonly visible: boolean;
  setVisible(visible: boolean): void;
  /** Replaces the tree; expanded/collapsed nodes keep their state. */
  setOutline(nodes: readonly OutlineNode[]): void;
  /** Highlights the heading at `index` in the flat list; -1 clears. */
  setActive(index: number): void;
  onJump(handler: (heading: Heading) => void): void;
}

export function createSidebar(host: HTMLElement, initialVisible: boolean): Sidebar {
  host.textContent = "";
  const tree = document.createElement("nav");
  tree.className = "outline";
  tree.setAttribute("aria-label", "Document outline");
  host.append(tree);

  let visible = initialVisible;
  host.hidden = !visible;
  const collapsed = new Set<string>();
  const rows = new Map<number, HTMLElement>();
  const jumpHandlers: ((heading: Heading) => void)[] = [];
  let active = -1;

  const keysSeen = new Map<string, number>();
  const keyFor = (heading: Heading): string => {
    const base = `${String(heading.level)}:${heading.text}`;
    const n = keysSeen.get(base) ?? 0;
    keysSeen.set(base, n + 1);
    return `${base}#${String(n)}`;
  };

  const renderList = (nodes: readonly OutlineNode[]): HTMLUListElement => {
    const list = document.createElement("ul");
    list.className = "outline-list";
    for (const node of nodes) {
      const key = keyFor(node.heading);
      const item = document.createElement("li");
      item.className = `outline-item outline-level-${String(node.heading.level)}`;
      const row = document.createElement("div");
      row.className = "outline-row";
      rows.set(node.index, row);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "outline-toggle";
      const link = document.createElement("button");
      link.type = "button";
      link.className = "outline-link";
      link.textContent = node.heading.text || "(untitled)";
      link.title = node.heading.text;
      link.addEventListener("click", () => {
        for (const handler of jumpHandlers) {
          handler(node.heading);
        }
      });
      row.append(toggle, link);
      item.append(row);

      if (node.children.length > 0) {
        const children = renderList(node.children);
        item.append(children);
        const apply = (): void => {
          const isCollapsed = collapsed.has(key);
          item.classList.toggle("is-collapsed", isCollapsed);
          toggle.setAttribute("aria-expanded", String(!isCollapsed));
          toggle.title = isCollapsed ? "Expand" : "Collapse";
        };
        toggle.addEventListener("click", () => {
          if (collapsed.has(key)) {
            collapsed.delete(key);
          } else {
            collapsed.add(key);
          }
          apply();
        });
        apply();
      } else {
        toggle.disabled = true;
        toggle.setAttribute("aria-hidden", "true");
        toggle.tabIndex = -1;
      }
      list.append(item);
    }
    return list;
  };

  const applyActive = (): void => {
    for (const [index, row] of rows) {
      const isActive = index === active;
      row.classList.toggle("is-active", isActive);
      if (isActive) {
        row.setAttribute("aria-current", "location");
        row.scrollIntoView({ block: "nearest" });
      } else {
        row.removeAttribute("aria-current");
      }
    }
  };

  return {
    element: host,
    get visible(): boolean {
      return visible;
    },
    setVisible(next): void {
      visible = next;
      host.hidden = !next;
      if (next) {
        applyActive();
      }
    },
    setOutline(nodes): void {
      rows.clear();
      keysSeen.clear();
      tree.textContent = "";
      if (nodes.length === 0) {
        const note = document.createElement("p");
        note.className = "sidebar-note";
        note.textContent = "No headings yet.";
        tree.append(note);
        return;
      }
      tree.append(renderList(nodes));
      applyActive();
    },
    setActive(index): void {
      if (index === active) {
        return;
      }
      active = index;
      if (visible) {
        applyActive();
      }
    },
    onJump(handler): void {
      jumpHandlers.push(handler);
    },
  };
}
