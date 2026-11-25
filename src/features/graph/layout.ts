import type { CommitSummary } from "./types";

export const ROW_HEIGHT = 32;
export const VISIBLE_LANES = 8;
const PALETTE_SIZE = 8;

interface Lane {
  target: string;
  path: number;
}

interface Point {
  lane: number;
  y: number;
}

export interface GraphSegment {
  from: Point;
  to: Point;
  color: number;
}

export interface GraphRow {
  lane: number;
  color: number;
  segments: GraphSegment[];
}

export function computeGraphLayout(commits: readonly Pick<CommitSummary, "hash" | "parents">[]) {
  const lanes: (Lane | null)[] = [];
  let nextPath = 0;
  let laneCount = 0;
  const middle = ROW_HEIGHT / 2;

  function reserve(target: string): number {
    const free = lanes.indexOf(null);
    const lane = free < 0 ? lanes.length : free;
    const path = nextPath++;
    lanes[lane] = { target, path };
    laneCount = Math.max(laneCount, lane + 1);
    return lane;
  }

  const rows = commits.map(({ hash, parents }): GraphRow => {
    const segments: GraphSegment[] = [];
    const arriving: { lane: number; path: number }[] = [];
    const waiting = new Map<string, number>();

    function connect(from: number, start: number, to: number, end: number, path: number) {
      if (from < VISIBLE_LANES || to < VISIBLE_LANES) {
        segments.push({ from: { lane: from, y: start }, to: { lane: to, y: end }, color: path % PALETTE_SIZE });
      }
    }

    for (const [lane, pending] of lanes.entries()) {
      if (!pending) continue;
      if (pending.target === hash) {
        arriving.push({ lane, path: pending.path });
      } else {
        connect(lane, 0, lane, ROW_HEIGHT, pending.path);
        const existing = waiting.get(pending.target);
        if (existing === undefined || pending.path < lanes[existing]!.path) {
          waiting.set(pending.target, lane);
        }
      }
    }

    // When several first-parent paths reach the same commit, the earliest path continues.
    const owner = arriving.reduce<(typeof arriving)[number] | undefined>(
      (earliest, current) => !earliest || current.path < earliest.path ? current : earliest,
      undefined,
    );
    const lane = owner?.lane ?? reserve(hash);
    const path = lanes[lane]!.path;
    lanes[lane] = null;

    for (const incoming of arriving) {
      connect(incoming.lane, 0, lane, middle, incoming.path);
      lanes[incoming.lane] = null;
    }

    const [firstParent, ...otherParents] = parents;
    if (firstParent) {
      lanes[lane] = { target: firstParent, path };
      waiting.set(firstParent, lane);
      connect(lane, middle, lane, ROW_HEIGHT, path);
    }
    for (const parent of otherParents) {
      const target = waiting.get(parent) ?? reserve(parent);
      waiting.set(parent, target);
      connect(lane, middle, target, ROW_HEIGHT, lanes[target]!.path);
    }
    while (lanes.length > 0 && lanes.at(-1) === null) lanes.pop();

    return { lane, color: path % PALETTE_SIZE, segments };
  });

  return { rows, laneCount };
}
