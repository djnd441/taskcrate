import type { ReactNode } from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  onSelect: () => void;
}

export interface MenuProps {
  items: MenuItem[];
  onClose?: () => void;
}

export function Menu({ items, onClose }: MenuProps) {
  return (
    <div role="menu" className="ui-menu">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={["ui-menu__item", item.danger ? "ui-menu__item--danger" : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={() => {
            item.onSelect();
            onClose?.();
          }}
        >
          {item.icon}
          {item.label}
          {item.shortcut ? <span className="ui-menu__shortcut">{item.shortcut}</span> : null}
        </button>
      ))}
    </div>
  );
}
