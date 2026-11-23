import type { Channel } from "@tauri-apps/api/core";
import type { MockHandlers } from "@/mock/types";
import type { TerminalEvent } from "./api";

const sessions = new Map<string, { path: string; channel: Channel<TerminalEvent>; input: string }>();
function output(channel: Channel<TerminalEvent>, text: string) {
  channel.onmessage({ type: "output", data: Array.from(new TextEncoder().encode(text)) });
}

export const terminalMock: MockHandlers = {
  terminal_open({ repoPath, onEvent }) {
    const id = crypto.randomUUID();
    sessions.set(id, { path: repoPath, channel: onEvent, input: "" });
    output(onEvent, "浏览器预览 · 可输入 pwd 查看仓库路径\r\n$ ");
    return id;
  },
  terminal_write({ sessionId, data }) {
    const session = sessions.get(sessionId);
    if (!session) return;
    for (const ch of data) {
      if (ch === "\r") {
        const cmd = session.input.trim();
        output(session.channel, "\r\n" + (cmd === "pwd" ? session.path + "\r\n" : cmd ? "请在桌面端执行命令\r\n" : "") + "$ ");
        session.input = "";
      } else if (ch === "\x7f") {
        if (session.input) output(session.channel, "\b \b");
        session.input = session.input.slice(0, -1);
      } else if (ch >= " ") {
        session.input += ch;
        output(session.channel, ch);
      }
    }
  },
  terminal_resize() {},
  terminal_close({ sessionId }) { sessions.delete(sessionId); },
};
