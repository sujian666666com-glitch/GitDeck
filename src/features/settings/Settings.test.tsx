// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Settings } from "./Settings";
import { defaults } from "./preferences";

it("点击录入按钮后主动获得焦点，并保存发往焦点元素的快捷键", () => {
  const save = vi.fn();
  render(<Settings prefs={{ mode: "system", keys: defaults }} save={save} />);
  fireEvent.click(screen.getByRole("button", { name: "设置" }));
  const recorder = screen.getByRole("button", { name: "打开／收起终端快捷键" });
  fireEvent.click(recorder);
  expect(document.activeElement).toBe(recorder);
  fireEvent.keyDown(document.activeElement!, { key: "T", code: "KeyT", ctrlKey: true, shiftKey: true });
  expect(save).toHaveBeenCalledWith({ mode: "system", keys: { ...defaults, terminal: "Ctrl+Shift+KeyT" } });
});
