import { Dialog } from "radix-ui";
import { Settings as Gear, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { actions, chord, defaults, label, type Action, type Preferences } from "./preferences";

const modes = [["system", "跟随系统"], ["light", "白色"], ["dark", "黑色"]] as const;

export function Settings({ prefs, save }: { prefs: Preferences; save: (prefs: Preferences) => void }) {
  const [editing, edit] = useState<Action | null>(null);
  const [error, setError] = useState("");

  function record(event: KeyboardEvent<HTMLButtonElement>, action: Action) {
    if (editing !== action || event.key === "Tab" || event.key === "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    const value = chord(event.nativeEvent);
    if (!value) {
      if (!["Control", "Alt", "Shift", "Meta"].includes(event.key)) setError("请用修饰键搭配字母、数字、反引号或功能键");
      return;
    }
    if (["Ctrl+KeyC", "Ctrl+KeyD", "Ctrl+KeyZ"].includes(value)) {
      setError("此组合由终端控制命令使用");
      return;
    }
    if (Object.entries(prefs.keys).some(([other, key]) => other !== action && value === key)) {
      setError("此组合已绑定其他操作");
      return;
    }
    save({ ...prefs, keys: { ...prefs.keys, [action]: value } });
    edit(null);
    setError("");
  }

  function reset() {
    save({ ...prefs, keys: { ...defaults } });
    edit(null);
    setError("");
  }

  return (
    <Dialog.Root onOpenChange={() => { edit(null); setError(""); }}>
      <Dialog.Trigger asChild>
        <button aria-label="设置" title="设置" className="m-2 self-start rounded-lg p-2 text-muted hover:bg-hover hover:text-ink">
          <Gear size={17} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25" />
        <Dialog.Content aria-describedby={undefined} className="fixed top-1/2 left-1/2 z-50 w-96 -translate-1/2 rounded-card border border-line bg-surface p-5 text-ink shadow-pop">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">设置</Dialog.Title>
            <Dialog.Close asChild><IconButton noTip label="关闭设置"><X /></IconButton></Dialog.Close>
          </div>
          <div className="flex items-center justify-between">
            <span id="theme-label">系统颜色</span>
            <div role="group" aria-labelledby="theme-label" className="flex gap-1 rounded-lg bg-subtle p-1">
              {modes.map(([mode, text]) => (
                <button key={mode} aria-pressed={prefs.mode === mode} onClick={() => save({ ...prefs, mode })}
                  className="rounded-md px-2 py-1 text-muted aria-pressed:bg-surface aria-pressed:text-ink">
                  {text}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 mb-2 flex items-center justify-between border-t border-line pt-4">
            <h2>快捷键</h2>
            <Button size="sm" variant="ghost" onClick={reset}>恢复默认</Button>
          </div>
          {(Object.keys(actions) as Action[]).map(action => (
            <div key={action} className="flex items-center justify-between py-1">
              <span>{actions[action]}</span>
              <Button size="sm" variant="outline" aria-label={actions[action] + "快捷键"}
                onBlur={() => edit(null)} onClick={() => { edit(action); setError(""); }}
                onKeyDown={event => record(event, action)}>
                {editing === action ? "请按组合键…" : label(prefs.keys[action])}
              </Button>
            </div>
          ))}
          {error && <p role="alert" className="mt-2 text-st-deleted">{error}</p>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
