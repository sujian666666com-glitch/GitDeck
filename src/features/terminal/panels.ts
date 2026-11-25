export interface Panel {
  open: boolean;
  sessions: number[];
  active: number;
}

type Action = { path: string } & (
  { type: "toggle" | "add" | "close" } | { type: "select"; session: number }
);

export function updatePanels(previous: Map<string, Panel>, action: Action) {
  const panels = new Map(previous);
  const panel = panels.get(action.path);
  if (!panel) {
    if (action.type === "toggle" || action.type === "add") {
      panels.set(action.path, { open: true, sessions: [1], active: 1 });
    }
    return panels;
  }

  switch (action.type) {
    case "toggle":
      panels.set(action.path, { ...panel, open: !panel.open });
      break;
    case "add": {
      const id = panel.sessions[panel.sessions.length - 1] + 1;
      panels.set(action.path, { open: true, sessions: [...panel.sessions, id], active: id });
      break;
    }
    case "select":
      panels.set(action.path, { ...panel, active: action.session });
      break;
    case "close": {
      const index = panel.sessions.indexOf(panel.active);
      const sessions = panel.sessions.filter(id => id !== panel.active);
      if (sessions.length) panels.set(action.path, { ...panel, sessions, active: sessions[Math.min(index, sessions.length - 1)] });
      else panels.delete(action.path);
      break;
    }
  }
  return panels;
}
