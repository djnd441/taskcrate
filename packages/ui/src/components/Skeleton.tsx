import type { CSSProperties } from "react";

export interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps) {
  return <span aria-hidden="true" className={["ui-skeleton", className].filter(Boolean).join(" ")} style={style} />;
}
