export interface ShortcutDefinition {
  id: string;
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  priority?: number;
  when?: () => boolean;
  handler: () => void;
}

const registry = new Map<string, ShortcutDefinition>();
let listenerAttached = false;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

function handleKeyDown(event: KeyboardEvent): void {
  const typing = isTypingTarget(event.target);
  const candidates = [...registry.values()].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
  );
  for (const definition of candidates) {
    if (event.key.toLowerCase() !== definition.key.toLowerCase()) {
      continue;
    }
    if (Boolean(definition.ctrlKey) !== event.ctrlKey) {
      continue;
    }
    if (Boolean(definition.altKey) !== event.altKey) {
      continue;
    }
    if (Boolean(definition.shiftKey) !== event.shiftKey) {
      continue;
    }
    if (typing && definition.key !== "Escape") {
      continue;
    }
    if (definition.when && !definition.when()) {
      continue;
    }
    event.preventDefault();
    definition.handler();
    return;
  }
}

export function registerShortcut(definition: ShortcutDefinition): () => void {
  registry.set(definition.id, definition);
  if (!listenerAttached) {
    window.addEventListener("keydown", handleKeyDown);
    listenerAttached = true;
  }
  return () => {
    registry.delete(definition.id);
  };
}
