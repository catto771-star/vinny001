import type { ReactNode } from "react";

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warning"; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className={`notice notice-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
