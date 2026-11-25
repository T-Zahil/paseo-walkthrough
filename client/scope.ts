import type { ScopeInfo, ScopeKind } from "../shared/walkthrough";
import type { T } from "./messages";

export function scopeTitle(t: T, kind: ScopeKind, short = false): string {
  if (kind === "branch") return short ? t("scope.short.branch") : t("scope.branch");
  if (kind === "uncommitted") return short ? t("scope.short.uncommitted") : t("scope.uncommitted");
  return short ? t("scope.short.lastCommit") : t("scope.lastCommit");
}

export function describeScope(t: T, info: ScopeInfo): string {
  switch (info.kind) {
    case "branch":
      return t("scope.describe.branch", {
        branch: info.branch ? t("scope.quoted", { name: info.branch }) : "HEAD",
        base: info.baseRef ?? "",
      });
    case "uncommitted":
      return t("scope.describe.uncommitted");
    case "last-commit":
      return t("scope.describe.lastCommit", { commit: info.commit ?? "HEAD" });
    case "empty-repo":
      return t("scope.describe.emptyRepo");
    case "no-base":
      return t("scope.describe.noBase");
  }
}
