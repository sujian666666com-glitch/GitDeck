import { describe, expect, it } from "vitest";
import { computeGraphLayout, ROW_HEIGHT, VISIBLE_LANES } from "./layout";

function commit(hash: string, ...parents: string[]) {
  return { hash, parents };
}

describe("Git Graph 布局", () => {
  it("在线性历史中保持一条泳道及同一颜色，根提交没有下边", () => {
    const { rows, laneCount } = computeGraphLayout([commit("c", "b"), commit("b", "a"), commit("a")]);
    expect(laneCount).toBe(1);
    expect(rows.map(({ lane, color }) => [lane, color])).toEqual([[0, 0], [0, 0], [0, 0]]);
    expect(rows.map(({ segments }) => segments.length)).toEqual([1, 2, 1]);
    expect(rows[2].segments[0].to.y).toBe(ROW_HEIGHT / 2);
  });

  it("分叉汇入共同祖先后回收泳道", () => {
    const { rows, laneCount } = computeGraphLayout([
      commit("left", "root"), commit("right", "root"), commit("root"), commit("other"),
    ]);
    expect(laneCount).toBe(2);
    expect(rows.map(({ lane }) => lane)).toEqual([0, 1, 0, 0]);
    expect(rows[2].segments).toContainEqual({
      from: { lane: 1, y: 0 }, to: { lane: 0, y: ROW_HEIGHT / 2 }, color: 1,
    });
    expect(rows[3].color).toBe(2);
  });

  it("合并提交为第二父提交开启新泳道，主父链路同色", () => {
    const { rows } = computeGraphLayout([
      commit("merge", "main", "feature"), commit("feature", "root"),
      commit("main", "root"), commit("root"),
    ]);
    expect(rows.map(({ lane, color }) => [lane, color])).toEqual([[0, 0], [1, 1], [0, 0], [0, 0]]);
    expect(rows[0].segments).toContainEqual({
      from: { lane: 0, y: ROW_HEIGHT / 2 }, to: { lane: 1, y: ROW_HEIGHT }, color: 1,
    });
    expect(rows[1].segments).toContainEqual({
      from: { lane: 0, y: 0 }, to: { lane: 0, y: ROW_HEIGHT }, color: 0,
    });
    expect(rows[3].segments.some(({ from, to }) => from.lane === 1 && to.lane === 0)).toBe(true);
  });

  it("多个分支并行时保持连续，颜色按八色循环", () => {
    const tips = Array.from({ length: 10 }, (_, lane) => commit(`tip-${lane}`, `base-${lane}`));
    const bases = Array.from({ length: 10 }, (_, lane) => commit(`base-${lane}`));
    const { rows, laneCount } = computeGraphLayout([...tips, ...bases]);
    expect(laneCount).toBe(10);
    expect(rows.slice(0, 10).map(({ color }) => color)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 1]);
    expect(rows.slice(10).map(({ lane, color }) => [lane, color])).toEqual(rows.slice(0, 10).map(({ lane, color }) => [lane, color]));
    expect(rows[9].segments).toHaveLength(VISIBLE_LANES);
  });

  it("未加载的父提交延伸到底部，追加分页时已有行不移动", () => {
    const prefix = [commit("merge", "main", "side"), commit("main", "root")];
    const { rows } = computeGraphLayout(prefix);
    expect(rows[1].segments.filter(({ to }) => to.y === ROW_HEIGHT).map(({ to }) => to.lane)).toEqual([1, 0]);
    const appended = computeGraphLayout([...prefix, commit("side", "root"), commit("root")]);
    expect(appended.rows.slice(0, 2)).toEqual(rows);
  });

  it("在 200ms 内布局一万条含并行和合并的提交", () => {
    const commits = [];
    for (let block = 0; block < 1000; block++) {
      const parents = Array.from({ length: 9 }, (_, branch) => `branch-${block}-${branch}`);
      const next = block === 999 ? [] : [`merge-${block + 1}`];
      commits.push(commit(`merge-${block}`, ...parents), ...parents.map((parent) => commit(parent, ...next)));
    }
    const start = performance.now();
    const layout = computeGraphLayout(commits);
    const elapsed = performance.now() - start;
    console.info(`Git Graph · ${layout.rows.length} 条提交，最多 ${layout.laneCount} 条泳道 · ${elapsed.toFixed(1)}ms`);
    expect(layout.rows).toHaveLength(10_000);
    expect(layout.laneCount).toBe(9);
    expect(elapsed).toBeLessThan(200);
  });
});
