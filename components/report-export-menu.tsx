"use client";

import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useClickOutside } from "@/components/use-click-outside";

export function ReportExportMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setOpen(false), open);

  return (
    <div ref={menuRef} className="relative">
      <Button
        type="button"
        variant="secondary"
        className="gap-2"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Download className="h-4 w-4" />
        Export data
        <ChevronDown className="h-4 w-4" />
      </Button>
      {open ? (
        <div className="surface-panel absolute right-0 top-[calc(100%+8px)] z-20 w-56 p-2" role="menu">
          <a
            href="/api/export/financials?format=csv"
            className="row-action-item flex items-start gap-3 text-sm"
            download
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <FileText className="mt-0.5 h-4 w-4 text-[var(--brand)]" />
            <span>
              <span className="block font-semibold">CSV</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">Spreadsheet-friendly text file</span>
            </span>
          </a>
          <a
            href="/api/export/financials?format=xlsx"
            className="row-action-item flex items-start gap-3 text-sm"
            download
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <FileSpreadsheet className="mt-0.5 h-4 w-4 text-[var(--brand)]" />
            <span>
              <span className="block font-semibold">Excel</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">Workbook download (.xlsx)</span>
            </span>
          </a>
        </div>
      ) : null}
    </div>
  );
}
