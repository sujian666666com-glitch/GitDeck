import { useLayoutEffect, useState } from "react";
import { isMac } from "@/lib/runtime";

export const actions = { terminal: "打开／收起终端", graph: "切换到 Git Graph", changes: "切换到 Changes" };
export type Action = keyof typeof actions;
export type Mode = "system" | "light" | "dark";
const mod = isMac ? "Meta" : "Ctrl";
export const defaults = { terminal: "Ctrl+Backquote", graph: mod + "+Digit1", changes: mod + "+Digit2" };
export type Preferences = { mode: Mode; keys: Record<Action, string> };
const storageKey = "gitdeck.preferences.v1";

export function chord(e: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "metaKey" | "shiftKey" | "code">) {
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Meta"].filter(Boolean);
  if (!mods.length || !/^(Key[A-Z]|Digit[0-9]|Backquote|F\d{1,2})$/.test(e.code)) return "";
  return [...mods, e.code].join("+");
}

export function label(key: string) {
  return key.replace("Meta", "⌘").replace("Backquote", "`").replace("Digit", "").replace("Key", "");
}

function read(): Preferences {
  const initial: Preferences = { mode: "system", keys: { ...defaults } };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    if (["system", "light", "dark"].includes(saved?.mode)) initial.mode = saved.mode;
    for (const action of Object.keys(actions) as Action[]) {
      if (typeof saved?.keys?.[action] === "string") initial.keys[action] = saved.keys[action];
    }
  } catch { /* 未保存有效偏好时使用默认设置 */ }
  return initial;
}

export function usePreferences() {
  const [prefs, setPrefs] = useState(read);
  const [dark, setDark] = useState(false);
  useLayoutEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(prefs));
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const active = prefs.mode === "dark" || (prefs.mode === "system" && media.matches);
      document.documentElement.dataset.theme = active ? "dark" : "light";
      setDark(active);
    };
    apply();
    if (prefs.mode === "system") media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [prefs]);
  return { prefs, setPrefs, dark };
}
