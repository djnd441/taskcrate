import type { CSSProperties } from "react";

export interface TagProps {
  label: string;
  color?: string | null;
  onRemove?: () => void;
}

export function Tag({ label, color, onRemove }: TagProps) {
  const style = color
    ? ({ "--tag-color": color } as CSSProperties)
    : undefined;
  return (
    <span className="ui-tag" style={style}>
      <span
        className="ui-tag__dot"
        style={{ background: color ?? "var(--ui-color-primary)" }}
        aria-hidden="true"
      />
      {label}
      {onRemove ? (
        <button
          type="button"
          className="ui-tag__remove"
          aria-label={`移除${label}`}
          onClick={onRemove}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
