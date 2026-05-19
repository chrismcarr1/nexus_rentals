"use client";

import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export function ReportExportMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div ref={menuRef} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
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
            className="flex items-start gap-3 rounded-2xl px-3 py-2.5 text-sm hover:bg-slate-100"
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
            className="flex items-start gap-3 rounded-2xl px-3 py-2.5 text-sm hover:bg-slate-100"
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
