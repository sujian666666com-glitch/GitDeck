/** 与 Rust `git::diff::FileDiff` 对应：Graph 与 Changes 共用 */
export interface FileDiff {
  path: string;
  oldPath: string | null;
  binary: boolean;
  truncated: boolean;
  /** `git diff` 原样输出的统一 diff 文本；二进制文件为空 */
  patch: string;
}

export type DiffLineKind = "context" | "add" | "del" | "hunk" | "meta";

export interface DiffLine {
  kind: DiffLineKind;
  /** 去掉了 +/-/空格 前缀的内容；hunk / meta 行为原文 */
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

export interface ParsedDiff {
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * 解析统一 diff。按 hunk 头声明的行数消费内容行，因此内容以 `---` / `+++` 开头的行也能正确识别；
 * 文件头（diff --git、index、---、+++）会被跳过。
 */
export function parseUnifiedDiff(patch: string): ParsedDiff {
  const lines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;
  let oldNo = 0;
  let newNo = 0;
  let oldLeft = 0;
  let newLeft = 0;
  let afterContent = false;

  const raw = patch.split("\n");
  if (raw.length > 0 && raw[raw.length - 1] === "") raw.pop();

  for (const text of raw) {
    if (oldLeft <= 0 && newLeft <= 0) {
      const header = HUNK_HEADER.exec(text);
      if (header) {
        oldNo = Number(header[1]);
        newNo = Number(header[3]);
        oldLeft = header[2] === undefined ? 1 : Number(header[2]);
        newLeft = header[4] === undefined ? 1 : Number(header[4]);
        lines.push({ kind: "hunk", text, oldNo: null, newNo: null });
        afterContent = false;
        continue;
      }
      if (afterContent && text.startsWith("\\")) {
        lines.push({ kind: "meta", text, oldNo: null, newNo: null });
      }
      afterContent = false;
      continue;
    }

    const sign = text[0];
    if (sign === "\\") {
      lines.push({ kind: "meta", text, oldNo: null, newNo: null });
    } else if (sign === "+") {
      lines.push({ kind: "add", text: text.slice(1), oldNo: null, newNo: newNo++ });
      newLeft--;
      additions++;
    } else if (sign === "-") {
      lines.push({ kind: "del", text: text.slice(1), oldNo: oldNo++, newNo: null });
      oldLeft--;
      deletions++;
    } else {
      // 上下文行；个别工具会把空的上下文行输出为空字符串
      lines.push({ kind: "context", text: text.slice(1), oldNo: oldNo++, newNo: newNo++ });
      oldLeft--;
      newLeft--;
    }
    afterContent = true;
  }

  return { lines, additions, deletions };
}
