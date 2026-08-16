import { Inbox, X } from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { Button } from "@task-manager/ui";
import { createCaptureTask } from "../bridge";
import { getAdapters } from "../adapters";
import { shouldIgnoreEnter } from "../lib/ime";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function GlobalCapture() {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("");
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const hideWindow = () => {
    if (!isTauri()) {
      return;
    }
    try {
      void getCurrentWindow().hide();
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const submit = async (mode: "inbox" | "main" = "inbox") => {
    const title = value.trim();
    if (!title) {
      return;
    }
    try {
      if (mode === "main" && isTauri()) {
        await emit("taskcrate:open-quick-create", { title });
        setValue("");
        setStatus("");
        setConfirming(false);
        hideWindow();
        return;
      }
      if (isTauri()) {
        await createCaptureTask(title);
      } else {
        await getAdapters().tasks.create({
          title,
          projectId: null,
          taskKind: "main",
        });
      }
      setValue("");
      setStatus("已存入收件箱");
      setConfirming(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  return (
    <div className="capture-window" role="dialog" aria-label="全局速记">
      <div className="capture-window__bar">
        <span className="capture-window__brand">
          <Inbox size={14} />
          TaskCrate 速记
        </span>
        <button
          type="button"
          className="capture-window__close"
          onClick={hideWindow}
          aria-label="关闭速记"
        >
          <X size={15} />
        </button>
      </div>
      <div className="capture-window__body">
        <input
          ref={inputRef}
          className="capture-window__input"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setStatus("");
            setConfirming(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              hideWindow();
            }
            if (event.key === "Enter" && !shouldIgnoreEnter(event)) {
              event.preventDefault();
              if (confirming) {
                void submit("inbox");
              } else {
                setConfirming(true);
                setStatus("确认存入方式");
              }
            }
          }}
          placeholder="输入想法，回车确认存入方式"
          aria-label="速记内容"
        />
        {confirming ? (
          <div className="capture-window__actions" aria-label="速记确认动作">
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
              继续编辑
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void submit("inbox")}>
              存入收件箱
            </Button>
            <Button size="sm" onClick={() => void submit("main")}>
              转为主任务
            </Button>
          </div>
        ) : null}
        <span className="capture-window__hint">
          {status || "Enter 确认 · 再次 Enter 存入收件箱 · Esc 关闭"}
        </span>
      </div>
    </div>
  );
}
