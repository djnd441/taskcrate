import { describe, expect, it } from "vitest";
import { appVersion, domainName } from "./index";

describe("domain package", () => {
  it("exports project identity", () => {
    expect(domainName).toBe("task-manager");
    expect(appVersion).toBe("0.1.0");
  });
});
