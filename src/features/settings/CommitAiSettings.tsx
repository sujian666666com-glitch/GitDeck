import { useState } from "react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/toast";
import { readCommitAiConfig, saveCommitAiConfig } from "./commitAiConfig";

const fields = [
  ["baseUrl", "API 地址", "https://api.example.com/v1"],
  ["model", "模型名", "服务提供的模型 ID"],
  ["apiKey", "API Key", "服务无需密钥时可留空"],
] as const;

export function CommitAiSettings() {
  const [config, setConfig] = useState(readCommitAiConfig);
  return (
    <details className="mt-4 border-t border-line pt-3">
      <summary className="cursor-pointer py-1 text-[13px] font-medium">AI 提交信息</summary>
      <p className="my-2 text-xs leading-relaxed text-muted">
        点击生成时，会将本次变更摘要发送到你配置的 Chat Completions 兼容接口。Key 保存在本机应用数据中。
      </p>
      <form className="space-y-2" onSubmit={event => {
        event.preventDefault();
        try {
          saveCommitAiConfig(config);
          notify.success("已保存 AI 设置");
        } catch (err) {
          notify.error(err, "保存 AI 设置失败");
        }
      }}>
        {fields.map(([key, label, placeholder]) => (
          <label key={key} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-muted">{label}</span>
            <input value={config[key]} placeholder={placeholder} spellCheck={false} autoComplete="off"
              type={key === "apiKey" ? "password" : key === "baseUrl" ? "url" : "text"}
              onChange={event => setConfig({ ...config, [key]: event.target.value })}
              className="h-8 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-ink outline-none placeholder:text-faint focus:border-accent" />
          </label>
        ))}
        <div className="flex justify-end"><Button type="submit" size="sm" variant="outline">保存 AI 设置</Button></div>
      </form>
    </details>
  );
}
