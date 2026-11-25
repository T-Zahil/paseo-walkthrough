import { useEffect, useRef } from "react";
import { Platform } from "react-native";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface DomNode {
  contains(other: unknown): boolean;
  getClientRects(): { length: number };
}
interface KeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  target: { tagName?: string; isContentEditable?: boolean } | null;
  preventDefault(): void;
}
declare const document: {
  activeElement: unknown;
  body: unknown;
  addEventListener(type: string, listener: (event: never) => void, capture?: boolean): void;
  removeEventListener(type: string, listener: (event: never) => void, capture?: boolean): void;
};

/**
 * j / k / x shortcuts on desktop and web. They fire only when the panel is visible, the last click
 * landed inside it, and no text field has focus, so they never steal keys from the composer.
 */
export function usePanelKeys(handlers: Record<string, () => void>) {
  const nodeRef = useRef<unknown>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    let armed = false;
    const onPointer = (event: { target: unknown }) => {
      const node = nodeRef.current as DomNode | null;
      armed = !!node && typeof node.contains === "function" && node.contains(event.target);
    };
    const onKey = (event: KeyEvent) => {
      const node = nodeRef.current as DomNode | null;
      if (!armed || !node || node.getClientRects().length === 0) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || event.target?.isContentEditable) return;
      const active = document.activeElement;
      if (active && active !== document.body && !node.contains(active)) return;
      const handler = handlersRef.current[event.key];
      if (!handler) return;
      event.preventDefault();
      handler();
    };
    document.addEventListener("pointerdown", onPointer as never, true);
    document.addEventListener("keydown", onKey as never);
    return () => {
      document.removeEventListener("pointerdown", onPointer as never, true);
      document.removeEventListener("keydown", onKey as never);
    };
  }, []);

  return nodeRef;
}
