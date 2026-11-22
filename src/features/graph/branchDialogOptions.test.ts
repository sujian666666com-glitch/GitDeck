import { describe, expect, it } from "vitest";
import { readBranchPreference, saveBranchPreference, validateBranchName } from "./branchDialogOptions";

describe("branch dialog preferences", () => {
  function makeStorage() {
    const entries = new Map<string, string>();
    return {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value); },
    };
  }

  it("starts with checkout off and --no-ff on", () => {
    const storage = makeStorage();
    expect(readBranchPreference("checkout", storage)).toBe(false);
    expect(readBranchPreference("noFf", storage)).toBe(true);
  });

  it("persists the two choices independently", () => {
    const storage = makeStorage();
    saveBranchPreference("checkout", true, storage);
    saveBranchPreference("noFf", false, storage);
    expect(readBranchPreference("checkout", storage)).toBe(true);
    expect(readBranchPreference("noFf", storage)).toBe(false);
  });

  it("handles broken or unavailable storage", () => {
    const storage = {
      getItem: () => { throw new Error("storage unavailable"); },
      setItem: () => { throw new Error("storage unavailable"); },
    };
    expect(readBranchPreference("checkout", storage)).toBe(false);
    expect(readBranchPreference("noFf", { getItem: () => "invalid" })).toBe(true);
    expect(() => saveBranchPreference("checkout", true, storage)).not.toThrow();
  });
});

describe("branch name validation", () => {
  it.each(["main", "feature/login", "修复/登录", "@", "feature/non\u00a0break"])("accepts %s", (name) => {
    expect(validateBranchName(name)).toBeNull();
  });

  it.each([
    "", "-new", "HEAD", "foo..bar", "foo@{bar", "foo bar", "foo\u0000bar", "foo\u007fbar", "foo~bar", "foo^bar", "foo?bar", "foo:bar",
    "foo*bar", "foo[bar", "foo\\bar", "foo.", "foo.lock/bar", "foo/.bar", "/foo", "foo/", "foo//bar",
  ])("rejects %j", (name) => {
    expect(validateBranchName(name)).toEqual(expect.any(String));
  });
});
