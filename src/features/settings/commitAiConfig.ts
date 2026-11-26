import type { CommitAiConfig } from "@/features/changes/types";

const storageKey = "gitdeck.commit-ai.v1";

export function readCommitAiConfig(): CommitAiConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (typeof saved?.baseUrl === "string" && typeof saved.model === "string" && typeof saved.apiKey === "string") {
      return saved;
    }
  } catch { /* 无有效配置时，从空表单开始。 */ }
  return { baseUrl: "", model: "", apiKey: "" };
}

export function saveCommitAiConfig(config: CommitAiConfig) {
  localStorage.setItem(storageKey, JSON.stringify(config));
}
