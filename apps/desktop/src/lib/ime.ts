import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export function shouldIgnoreEnter(event: ReactKeyboardEvent<HTMLElement>): boolean {
  const native = event.nativeEvent;
  return (
    native.isComposing ||
    event.key === "Process" ||
    (native as KeyboardEvent & { keyCode?: number }).keyCode === 229
  );
}
