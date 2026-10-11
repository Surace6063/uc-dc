"use client"

import * as React from "react"
import { SearchIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useDebounced } from "@/hooks/use-url-filters"

// Building blocks for server-filtered list toolbars (students, teachers, ...).

export const labelOptions = <K extends string>(labels: Record<K, string>) =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }))

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
  disabled,
}: {
  label: string
  value: string | number | undefined
  onChange: (value: string | null) => void
  options: { value: string; label: string }[]
  allLabel?: string
  disabled?: boolean
}) {
  const id = `filter-${label.toLowerCase().replace(/\W+/g, "-")}`
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <NativeSelect
        id={id}
        value={value === undefined ? "" : String(value)}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className="w-full"
      >
        <NativeSelectOption value="">{allLabel}</NativeSelectOption>
        {options.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  )
}

export function SearchBox({
  value,
  onSearch,
  placeholder,
  label,
}: {
  value: string
  onSearch: (q: string | null) => void
  placeholder: string
  label: string
}) {
  const [text, setText] = React.useState(value)
  const debounced = useDebounced(text)
  const last = React.useRef(value)

  // Keep in sync when the URL changes elsewhere (e.g. "clear all").
  React.useEffect(() => {
    if (value !== last.current) {
      last.current = value
      setText(value)
    }
  }, [value])

  React.useEffect(() => {
    if (debounced.trim() !== last.current) {
      last.current = debounced.trim()
      onSearch(debounced.trim() || null)
    }
  }, [debounced, onSearch])

  return (
    <div className="relative w-full sm:w-72">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-8 pl-9"
        maxLength={100}
      />
    </div>
  )
}

// Active filters as removable chips, plus "Clear all".
export function FilterChips({
  chips,
  onRemove,
  onClear,
}: {
  chips: { key: string; label: string }[]
  onRemove: (key: string) => void
  onClear: () => void
}) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <Badge key={chip.key} variant="secondary" className="h-6 gap-1 pr-1">
          {chip.label}
          <button
            type="button"
            aria-label={`Remove filter ${chip.label}`}
            onClick={() => onRemove(chip.key)}
            className="rounded-full p-0.5 hover:bg-foreground/10"
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <Button variant="ghost" size="xs" onClick={onClear}>
        Clear all
      </Button>
    </div>
  )
}
