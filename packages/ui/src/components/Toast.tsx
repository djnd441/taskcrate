import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { IconButton } from "./IconButton";

export type ToastType = "info" | "success" | "warning" | "danger";

export interface ToastInput {
  type?: ToastType;
  title: string;
  message?: string;
}

interface ToastItem {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  push: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((input: ToastInput) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setItems((prev) => [
      ...prev,
      { id, type: input.type ?? "info", title: input.title, message: input.message },
    ]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ui-toast-stack" aria-live="polite">
        {items.map((item) => (
          <ToastCard
            key={item.id}
            item={item}
            onClose={() => setItems((prev) => prev.filter((entry) => entry.id !== item.id))}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const icon = {
    info: <Info size={18} />,
    success: <CheckCircle2 size={18} />,
    warning: <TriangleAlert size={18} />,
    danger: <XCircle size={18} />,
  }[item.type];
  return (
    <div className={`ui-toast ui-toast--${item.type}`}>
      <span aria-hidden="true">{icon}</span>
      <div>
        <p className="ui-toast__title">{item.title}</p>
        {item.message ? <p className="ui-toast__message">{item.message}</p> : null}
      </div>
      <IconButton label="关闭通知" size="sm" onClick={onClose}>
        <X size={14} />
      </IconButton>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast 必须在 ToastProvider 内使用");
  }
  return context;
}
