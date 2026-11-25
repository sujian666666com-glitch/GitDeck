/** 相对时间：刚刚 / 5 分钟前 / 3 小时前 / 昨天 / 4 天前 / 2025-03-01 */
export function formatRelativeTime(unixSeconds: number, now: number = Date.now()): string {
  const diff = Math.max(0, Math.floor(now / 1000) - unixSeconds);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  return formatDate(unixSeconds);
}

/** 2025-03-01 */
export function formatDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 2025-03-01 14:05 */
export function formatDateTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${formatDate(unixSeconds)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 路径拆成目录与文件名：`src/auth/login.ts` → { dir: "src/auth", name: "login.ts" } */
export function splitPath(path: string): { dir: string; name: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { dir: "", name: path } : { dir: path.slice(0, i), name: path.slice(i + 1) };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
