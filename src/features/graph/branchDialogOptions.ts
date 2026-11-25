const preferences = {
  checkout: { key: "gitdeck.graph.createBranch.checkout", fallback: false },
  noFf: { key: "gitdeck.graph.mergeBranch.noFf", fallback: true },
} as const;

type Preference = keyof typeof preferences;

export function readBranchPreference(option: Preference, storage?: Pick<Storage, "getItem">): boolean {
  const { key, fallback } = preferences[option];
  try {
    const value = (storage ?? window.localStorage).getItem(key);
    if (value === "true" || value === "false") return value === "true";
  } catch {
    // The dialog still works when storage access is blocked.
  }
  return fallback;
}

export function saveBranchPreference(option: Preference, value: boolean, storage?: Pick<Storage, "setItem">) {
  try {
    (storage ?? window.localStorage).setItem(preferences[option].key, String(value));
  } catch {
    // A failed preference write must not prevent the Git operation.
  }
}

export function validateBranchName(name: string): string | null {
  if (!name) return "请输入分支名称";
  if (name.startsWith("-")) return "分支名称不能以 - 开头";
  if (
    name === "HEAD" || name.endsWith(".") || name.includes("..") || name.includes("@{") ||
    /[~^:?*\[\\]/u.test(name) || Array.from(name).some((char) => char <= " " || char === "\u007f") ||
    name.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock"))
  ) return "分支名称包含 Git 不允许的字符或格式";
  return null;
}
