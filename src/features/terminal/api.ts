import { Channel } from "@tauri-apps/api/core";
import { call } from "@/lib/tauri";

export type TerminalEvent = { type: "output"; data: number[] } | { type: "exit" };

export const terminalApi = {
  open(repoPath: string, cols: number, rows: number, receive: (event: TerminalEvent) => void) {
    const onEvent = new Channel<TerminalEvent>(receive);
    return call<string>("terminal_open", { repoPath, cols, rows, onEvent });
  },
  write: (sessionId: string, data: string) => call<void>("terminal_write", { sessionId, data }),
  resize: (sessionId: string, cols: number, rows: number) => call<void>("terminal_resize", { sessionId, cols, rows }),
  close: (sessionId: string) => call<void>("terminal_close", { sessionId }),
};
