import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

export interface PopoverProps {
  trigger: ReactElement<Record<string, unknown>>;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  panelClassName?: string;
}

export function Popover({ trigger, children, align = "start", panelClassName }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const triggerElement = isValidElement(trigger)
    ? cloneElement(trigger, {
        onClick: (event: ReactMouseEvent<HTMLElement>) => {
          const originalOnClick = trigger.props.onClick as
            | ((event: ReactMouseEvent<HTMLElement>) => void)
            | undefined;
          originalOnClick?.(event);
          setOpen((value) => !value);
        },
        "aria-expanded": open,
        "aria-haspopup": "menu",
      })
    : trigger;

  return (
    <div ref={rootRef} className="ui-popover">
      {triggerElement}
      {open ? (
        <div className={["ui-popover__panel", panelClassName].filter(Boolean).join(" ")} data-align={align}>
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}
