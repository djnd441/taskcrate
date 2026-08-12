import type { InputHTMLAttributes } from "react";

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label className={["ui-checkbox", className].filter(Boolean).join(" ")}>
      <input type="checkbox" {...rest} />
      {label ? <span>{label}</span> : null}
    </label>
  );
}
