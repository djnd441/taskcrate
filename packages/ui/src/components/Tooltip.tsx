import { cloneElement, isValidElement, useState, type ReactElement } from "react";

export interface TooltipProps {
  label: string;
  side?: "top" | "bottom";
  children: ReactElement<Record<string, unknown>>;
}

export function Tooltip({ label, side = "top", children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const show = () => setVisible(true);
  const hide = () => setVisible(false);
  const trigger = isValidElement(children)
    ? cloneElement(children, {
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
      })
    : children;

  return (
    <span className="ui-tooltip">
      {trigger}
      {visible ? (
        <span role="tooltip" className="ui-tooltip__tip" data-side={side}>
          {label}
        </span>
      ) : null}
    </span>
  );
}
