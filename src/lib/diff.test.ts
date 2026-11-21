import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./diff";

const PATCH = `diff --git a/src/login.ts b/src/login.ts
index 3b18e51..a2c4f0d 100644
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,4 +1,5 @@
 import { auth } from "./auth";
-export function login() {
+export async function login() {
+  await auth();
   return true;
 }
@@ -10,2 +11,2 @@ export function logout() {
-  return false;
+  return null;
 }
`;

describe("parseUnifiedDiff", () => {
  it("跳过文件头并按 hunk 计算行号", () => {
    const { lines, additions, deletions } = parseUnifiedDiff(PATCH);
    expect(additions).toBe(3);
    expect(deletions).toBe(2);
    expect(lines[0]).toMatchObject({ kind: "hunk", oldNo: null, newNo: null });
    expect(lines[1]).toEqual({ kind: "context", text: 'import { auth } from "./auth";', oldNo: 1, newNo: 1 });
    expect(lines[2]).toEqual({ kind: "del", text: "export function login() {", oldNo: 2, newNo: null });
    expect(lines[3]).toEqual({ kind: "add", text: "export async function login() {", oldNo: null, newNo: 2 });
    expect(lines[4]).toEqual({ kind: "add", text: "  await auth();", oldNo: null, newNo: 3 });
    expect(lines[5]).toEqual({ kind: "context", text: "  return true;", oldNo: 3, newNo: 4 });
    const second = lines.findIndex((l, i) => i > 0 && l.kind === "hunk");
    expect(lines[second + 1]).toEqual({ kind: "del", text: "  return false;", oldNo: 10, newNo: null });
    expect(lines[second + 2]).toEqual({ kind: "add", text: "  return null;", oldNo: null, newNo: 11 });
  });

  it("内容以 --- / +++ 开头的行仍按增删处理", () => {
    const patch = "--- a/x.md\n+++ b/x.md\n@@ -1,2 +1,2 @@\n---- old rule\n++++ new rule\n keep\n";
    const { lines } = parseUnifiedDiff(patch);
    expect(lines.map((l) => l.kind)).toEqual(["hunk", "del", "add", "context"]);
    expect(lines[1].text).toBe("--- old rule");
    expect(lines[2].text).toBe("+++ new rule");
  });

  it("识别 No newline at end of file", () => {
    const patch = "@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n";
    const kinds = parseUnifiedDiff(patch).lines.map((l) => l.kind);
    expect(kinds).toEqual(["hunk", "del", "meta", "add", "meta"]);
  });

  it("新文件只有新增行", () => {
    const patch = "new file mode 100644\n--- /dev/null\n+++ b/config.json\n@@ -0,0 +1,2 @@\n+{\n+}\n";
    const { lines, additions } = parseUnifiedDiff(patch);
    expect(additions).toBe(2);
    expect(lines[1]).toEqual({ kind: "add", text: "{", oldNo: null, newNo: 1 });
  });

  it("空 patch 返回空结果", () => {
    expect(parseUnifiedDiff("")).toEqual({ lines: [], additions: 0, deletions: 0 });
  });
});
