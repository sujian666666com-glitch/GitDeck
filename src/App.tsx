import { Tooltip } from "radix-ui";
import { AppStateProvider } from "@/app/AppState";
import { Shell } from "@/app/Shell";
import { DialogHost } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/toast";

export default function App() {
  return (
    <AppStateProvider>
      <Tooltip.Provider delayDuration={450} skipDelayDuration={150}>
        <Shell />
        <DialogHost />
        <Toaster />
      </Tooltip.Provider>
    </AppStateProvider>
  );
}
