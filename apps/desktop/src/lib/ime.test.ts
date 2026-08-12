import { describe, expect, it } from "vitest";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { shouldIgnoreEnter } from "./ime";

function makeEvent(
  overrides: {
    key?: string;
    isComposing?: boolean;
    keyCode?: number;
  } = {},
): ReactKeyboardEvent<HTMLElement> {
  return {
    key: overrides.key ?? "Enter",
    keyCode: overrides.keyCode ?? 13,
    nativeEvent: {
      isComposing: overrides.isComposing ?? false,
      keyCode: overrides.keyCode ?? 13,
    },
  } as unknown as ReactKeyboardEvent<HTMLElement>;
}

describe("IME 回车保护", () => {
  it("组合输入中的 Enter 应被忽略", () => {
    expect(shouldIgnoreEnter(makeEvent({ isComposing: true }))).toBe(true);
    expect(shouldIgnoreEnter(makeEvent({ key: "Process" }))).toBe(true);
    expect(shouldIgnoreEnter(makeEvent({ keyCode: 229 }))).toBe(true);
  });

  it("普通确认回车不拦截", () => {
    expect(shouldIgnoreEnter(makeEvent())).toBe(false);
  });
});
