/**
 * Sidebar placeholder. Phase 4 fills it with the heading outline; phase 2
 * only wires the View menu toggle and remembers the visibility.
 */
export interface Sidebar {
  readonly element: HTMLElement;
  readonly visible: boolean;
  setVisible(visible: boolean): void;
}

export function createSidebar(host: HTMLElement, initialVisible: boolean): Sidebar {
  host.textContent = "";
  const note = document.createElement("p");
  note.className = "sidebar-note";
  note.textContent = "Outline arrives in phase 4.";
  host.append(note);
  let visible = initialVisible;
  host.hidden = !visible;
  return {
    element: host,
    get visible(): boolean {
      return visible;
    },
    setVisible(next): void {
      visible = next;
      host.hidden = !next;
    },
  };
}
