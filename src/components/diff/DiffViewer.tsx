import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { parseUnifiedDiff, type DiffLine, type FileDiff } from "@/lib/diff";

/**
 * 统一 Diff 查看器（Graph 提交详情与 Changes 共用）。
 * 只负责渲染内容，外层容器决定尺寸与滚动；文件名等标题由调用方展示。
 */
export function DiffViewer({ diff, className }: { diff: FileDiff; className?: string }) {
  const parsed = useMemo(() => parseUnifiedDiff(diff.patch), [diff.patch]);

  if (diff.binary) return <Notice className={className}>二进制文件，无法显示差异</Notice>;
  if (parsed.lines.length === 0) {
    return <Notice className={className}>没有可显示的文本差异（可能只修改了文件权限）</Notice>;
  }

  return (
    <div className={cn("overflow-auto bg-surface font-mono text-[12px] leading-5 select-text", className)}>
      <table className="w-full border-collapse [tab-size:4]">
        <tbody>
          {parsed.lines.map((line, index) => (
            <DiffRow key={index} line={line} />
          ))}
        </tbody>
      </table>
      {diff.truncated && <Notice>差异内容过长，只显示前一部分</Notice>}
    </div>
  );
}

const gutter = "w-px select-none whitespace-nowrap px-2 text-right align-top text-faint tabular-nums";

function DiffRow({ line }: { line: DiffLine }) {
  if (line.kind === "hunk") {
    return (
      <tr className="bg-diff-hunk-bg text-diff-hunk">
        <td colSpan={3} className="px-3 py-0.5 whitespace-pre">
          {line.text}
        </td>
      </tr>
    );
  }
  if (line.kind === "meta") {
    return (
      <tr className="text-muted">
        <td className={gutter} />
        <td className={gutter} />
        <td className="px-3 italic">{line.text}</td>
      </tr>
    );
  }

  const tone =
    line.kind === "add"
      ? { row: "bg-diff-add-bg", gutter: "bg-diff-add-gutter", sign: "+", signColor: "text-diff-add" }
      : line.kind === "del"
        ? { row: "bg-diff-del-bg", gutter: "bg-diff-del-gutter", sign: "-", signColor: "text-diff-del" }
        : { row: "", gutter: "", sign: " ", signColor: "" };

  return (
    <tr className={tone.row}>
      <td className={cn(gutter, tone.gutter)}>{line.oldNo ?? ""}</td>
      <td className={cn(gutter, tone.gutter)}>{line.newNo ?? ""}</td>
      <td className="px-3 whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
        <span className={cn("mr-2 inline-block w-2 select-none", tone.signColor)}>{tone.sign}</span>
        {line.text}
      </td>
    </tr>
  );
}

function Notice({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-4 py-6 text-center text-[12px] text-muted", className)}>{children}</div>;
}
