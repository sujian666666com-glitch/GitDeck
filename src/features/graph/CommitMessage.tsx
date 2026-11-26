type MessageBlock =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; items: string[] }
  | { kind: "id"; label: string; value: string };

export function CommitMessage({ subject, body }: { subject: string; body: string }) {
  return (
    <div className="space-y-2 wrap-anywhere select-text">
      <h3 className="text-[14px] leading-snug font-semibold text-ink">{inlineCode(subject || "（无标题）")}</h3>
      {messageBlocks(body).map((block, index) => {
        if (block.kind === "id") return (
          <p key={index} className="text-[12px] text-ink-2">
            <span className="text-muted">{block.label} </span><code className="font-mono">{block.value}</code>
          </p>
        );
        if (block.kind === "list") return (
          <ul key={index} className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-ink-2 marker:text-muted">
            {block.items.map((item, i) => <li key={i}>{inlineCode(item)}</li>)}
          </ul>
        );
        return <p key={index} className="text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">{inlineCode(block.lines.join("\n"))}</p>;
      })}
    </div>
  );
}

function messageBlocks(body: string) {
  const blocks: MessageBlock[] = [];
  let current: MessageBlock | undefined;
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) {
      current = undefined;
      continue;
    }
    const id = /^(change-id:)\s+(\S+)\s*$/i.exec(line);
    if (id) {
      blocks.push({ kind: "id", label: id[1], value: id[2] });
      current = undefined;
      continue;
    }
    const bullet = /^[-*]\s+(.+)/.exec(line);
    if (bullet) {
      if (current?.kind !== "list") {
        current = { kind: "list", items: [] };
        blocks.push(current);
      }
      current.items.push(bullet[1]);
    } else if (current?.kind === "list" && /^\s/.test(line)) {
      current.items[current.items.length - 1] += " " + line.trimStart();
    } else {
      if (current?.kind !== "paragraph") {
        current = { kind: "paragraph", lines: [] };
        blocks.push(current);
      }
      current.lines.push(line);
    }
  }
  return blocks;
}

function inlineCode(text: string) {
  return text.split(/(`[^`\n]+`)/g).map((part, i) => i % 2 === 0 ? part : (
    <code key={i} className="rounded bg-subtle px-1 font-mono text-[0.92em]">{part.slice(1, -1)}</code>
  ));
}
