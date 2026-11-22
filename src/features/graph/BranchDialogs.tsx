import { Dialog } from "radix-ui";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { readBranchPreference, saveBranchPreference, validateBranchName } from "./branchDialogOptions";

interface DialogProps {
  close: () => void;
}

export function CreateBranchDialog({ from, close, create }: DialogProps & {
  from: string;
  create: (name: string, checkout: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState(() => readBranchPreference("checkout"));
  const errorId = useId();

  function submit() {
    const message = validateBranchName(name);
    setError(message);
    if (message) return;
    saveBranchPreference("checkout", checkout);
    create(name, checkout);
  }

  return (
    <BranchDialog title="创建分支" description={`基于 ${from} 创建本地分支。`} close={close} confirmText="创建" submit={submit}>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-[12px] text-ink-2">分支名称</span>
        <input
          value={name}
          placeholder="feature/login"
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          className={cn(
            "h-9 w-full rounded-[10px] border bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-faint",
            error ? "border-st-deleted" : "border-line-strong focus:border-accent",
          )}
        />
      </label>
      {error && <p id={errorId} role="alert" className="mt-1.5 text-[12px] text-st-deleted">{error}</p>}
      <BranchOption checked={checkout} change={setCheckout}>创建后切换到新分支</BranchOption>
    </BranchDialog>
  );
}

export function MergeBranchDialog({ from, into, close, merge }: DialogProps & {
  from: string;
  into: string;
  merge: (noFf: boolean) => void;
}) {
  const [noFf, setNoFf] = useState(() => readBranchPreference("noFf"));

  return (
    <BranchDialog
      title="合并到当前分支？"
      description={`将 ${from} 合并到当前分支 ${into}。`}
      close={close}
      confirmText="合并"
      submit={() => {
        saveBranchPreference("noFf", noFf);
        merge(noFf);
      }}
    >
      <BranchOption checked={noFf} change={setNoFf}>始终创建合并提交（--no-ff）</BranchOption>
    </BranchDialog>
  );
}

function BranchDialog({ title, description, close, confirmText, submit, children }: DialogProps & {
  title: string;
  description: string;
  confirmText: string;
  submit: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/15" />
        <Dialog.Content className="fixed top-[20%] left-1/2 z-50 w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-card border border-line bg-surface p-5 shadow-pop outline-none">
          <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <Dialog.Title className="text-[15px] font-semibold text-ink">{title}</Dialog.Title>
            <Dialog.Description className="mt-1.5 text-[13px] leading-relaxed break-all text-muted select-text">{description}</Dialog.Description>
            {children}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>取消</Button>
              <Button type="submit" variant="primary">{confirmText}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function BranchOption({ checked, change, children }: {
  checked: boolean;
  change: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="mt-4 flex w-fit items-center gap-2 text-[13px] text-ink-2">
      <input type="checkbox" checked={checked} onChange={(event) => change(event.target.checked)} className="size-4 accent-accent focus-visible:ring-2 focus-visible:ring-focus" />
      <span>{children}</span>
    </label>
  );
}
