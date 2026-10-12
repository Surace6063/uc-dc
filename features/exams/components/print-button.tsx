"use client"

import { PrinterIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

// Prints the report card (the print stylesheet hides everything else);
// "Save as PDF" in the print dialog gives a PDF.
export function PrintButton({ label = "Print / save PDF" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()} className="print:hidden">
      <PrinterIcon data-icon="inline-start" />
      {label}
    </Button>
  )
}
