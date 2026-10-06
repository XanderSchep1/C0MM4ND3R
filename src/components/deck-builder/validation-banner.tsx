"use client";

import type { ValidationIssue } from "./types";

export function ValidationBanner({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-[#0ca30c]/30 bg-[#0ca30c]/10 px-3 py-2 text-sm text-[#006300] dark:text-[#0ca30c]">
        <span aria-hidden>✓</span>
        <span>Legal 100-card Commander deck.</span>
      </div>
    );
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <div className="flex flex-col gap-2">
      {errors.length > 0 && (
        <div className="rounded-md border border-[#d03b3b]/30 bg-[#d03b3b]/10 px-3 py-2 text-sm text-[#d03b3b]">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <span aria-hidden>⚠</span>
            <span>{errors.length} issue{errors.length === 1 ? "" : "s"} to fix</span>
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-[#a92c2c] dark:text-[#e88484]">
            {errors.map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md border border-[#fab219]/40 bg-[#fab219]/10 px-3 py-2 text-sm">
          <ul className="list-inside list-disc space-y-0.5 text-[#8a5a00] dark:text-[#fab219]">
            {warnings.map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
