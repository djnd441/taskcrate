import { forwardRef, type ButtonHTMLAttributes } from "react";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "sm" | "md";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", className, type = "button", ...rest },
  ref,
) {
  const classes = ["ui-icon-button", `ui-icon-button--${size}`, className]
    .filter(Boolean)
    .join(" ");
  return <button ref={ref} type={type} aria-label={label} title={label} className={classes} {...rest} />;
});
