import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { notify } from "@/components/ui/toast";
import { emitRepoChanged } from "@/lib/events";
import { terminalApi } from "./api";

function theme() {
  const styles = getComputedStyle(document.documentElement);
  const color = (token: string) => styles.getPropertyValue("--color-" + token).trim();
  return { background: color("app"), foreground: color("ink"), cursor: color("ink"),
    selectionBackground: color("line-strong"), blue: color("st-untracked"), green: color("st-added"),
    red: color("st-deleted"), cyan: color("lane-5") };
}

export default function TerminalPane({ path, visible, dark }: { path: string; visible: boolean; dark: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Terminal | null>(null);
  useEffect(() => {
    const el = host.current!;
    const term = new Terminal({ theme: theme(), fontSize: 13, scrollback: 1000, disableStdin: true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    instance.current = term;
    let disposed = false;
    let exited = false;
    let id: string | undefined;
    let input = Promise.resolve();
    function report(err: unknown) {
      if (!disposed && !exited) notify.error(err, "终端操作失败");
    }
    const observer = new ResizeObserver(() => { if (el.clientWidth && el.clientHeight) fit.fit(); });
    observer.observe(el);
    term.onResize(({ cols, rows }) => {
      if (id && !exited) void terminalApi.resize(id, cols, rows).catch(report);
    });
    term.onData(data => {
      input = input.then(async () => {
        if (id && !disposed && !exited) await terminalApi.write(id, data);
      }).catch(report);
    });
    async function start() {
      if (disposed) return;
      if (el.clientWidth) fit.fit();
      const session = await terminalApi.open(path, term.cols, term.rows, event => {
        if (disposed) return;
        if (event.type === "output") term.write(Uint8Array.from(event.data));
        else {
          exited = true;
          term.options.disableStdin = true;
          term.writeln("\r\n[终端会话已结束]");
          emitRepoChanged(path);
        }
      });
      if (disposed) { await terminalApi.close(session); return; }
      id = session;
      if (!exited) {
        term.options.disableStdin = false;
        await terminalApi.resize(id, term.cols, term.rows);
      }
    }
    queueMicrotask(() => { void start().catch(err => {
      if (!disposed) term.writeln("终端启动失败，请关闭后重试。");
      report(err);
    }); });
    return () => {
      disposed = true;
      observer.disconnect();
      instance.current = null;
      term.dispose();
      if (id) void terminalApi.close(id).catch(err => notify.error(err, "关闭终端失败"));
    };
  }, [path]);
  useEffect(() => { if (instance.current) instance.current.options.theme = theme(); }, [dark]);
  useEffect(() => { if (visible) instance.current?.focus(); }, [visible]);
  return <div ref={host} hidden={!visible} aria-label="仓库终端" onBlur={e => {
    if (!e.currentTarget.contains(e.relatedTarget)) emitRepoChanged(path);
  }} className="mx-5 mb-2 h-[28vh] min-h-24 max-h-96 overflow-hidden py-1" />;
}
