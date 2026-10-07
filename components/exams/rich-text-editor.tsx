"use client"

import * as React from "react"
import TextAlign from "@tiptap/extension-text-align"
import { EditorContent, useEditor, useEditorState } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  Redo2Icon,
  UnderlineIcon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"

function ToolbarButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(active && "bg-muted text-foreground")}
    >
      <Icon />
    </Button>
  )
}

export function RichTextEditor({
  id,
  value,
  onChange,
}: {
  id?: string
  value: string
  onChange: (html: string) => void
}) {
  const [linkUrl, setLinkUrl] = React.useState("")
  const [linkOpen, setLinkOpen] = React.useState(false)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true },
      }),
      TextAlign.configure({ types: ["paragraph"] }),
    ],
    content: value,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        class:
          "min-h-36 max-h-72 overflow-y-auto px-3 py-2 text-sm outline-none [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  })

  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      underline: editor?.isActive("underline") ?? false,
      bulletList: editor?.isActive("bulletList") ?? false,
      orderedList: editor?.isActive("orderedList") ?? false,
      link: editor?.isActive("link") ?? false,
      left: editor?.isActive({ textAlign: "left" }) ?? false,
      center: editor?.isActive({ textAlign: "center" }) ?? false,
      right: editor?.isActive({ textAlign: "right" }) ?? false,
      canUndo: editor?.can().undo() ?? false,
      canRedo: editor?.can().redo() ?? false,
    }),
  })

  function applyLink() {
    if (!editor) return
    const chain = editor.chain().focus().extendMarkRange("link")
    if (linkUrl.trim()) chain.setLink({ href: linkUrl.trim() }).run()
    else chain.unsetLink().run()
    setLinkOpen(false)
  }

  const run = (fn: () => void) => () => editor && fn()

  return (
    <div className="overflow-hidden rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1">
        <ToolbarButton
          icon={Undo2Icon}
          label="Undo"
          disabled={!state?.canUndo}
          onClick={run(() => editor!.chain().focus().undo().run())}
        />
        <ToolbarButton
          icon={Redo2Icon}
          label="Redo"
          disabled={!state?.canRedo}
          onClick={run(() => editor!.chain().focus().redo().run())}
        />
        <Separator orientation="vertical" className="mx-1 h-5!" />
        <ToolbarButton
          icon={BoldIcon}
          label="Bold"
          active={state?.bold}
          onClick={run(() => editor!.chain().focus().toggleBold().run())}
        />
        <ToolbarButton
          icon={ItalicIcon}
          label="Italic"
          active={state?.italic}
          onClick={run(() => editor!.chain().focus().toggleItalic().run())}
        />
        <ToolbarButton
          icon={UnderlineIcon}
          label="Underline"
          active={state?.underline}
          onClick={run(() => editor!.chain().focus().toggleUnderline().run())}
        />
        <Separator orientation="vertical" className="mx-1 h-5!" />
        <ToolbarButton
          icon={AlignLeftIcon}
          label="Align left"
          active={state?.left}
          onClick={run(() =>
            editor!.chain().focus().setTextAlign("left").run()
          )}
        />
        <ToolbarButton
          icon={AlignCenterIcon}
          label="Align center"
          active={state?.center}
          onClick={run(() =>
            editor!.chain().focus().setTextAlign("center").run()
          )}
        />
        <ToolbarButton
          icon={AlignRightIcon}
          label="Align right"
          active={state?.right}
          onClick={run(() =>
            editor!.chain().focus().setTextAlign("right").run()
          )}
        />
        <Separator orientation="vertical" className="mx-1 h-5!" />
        <ToolbarButton
          icon={ListIcon}
          label="Bullet list"
          active={state?.bulletList}
          onClick={run(() => editor!.chain().focus().toggleBulletList().run())}
        />
        <ToolbarButton
          icon={ListOrderedIcon}
          label="Numbered list"
          active={state?.orderedList}
          onClick={run(() => editor!.chain().focus().toggleOrderedList().run())}
        />
        <Separator orientation="vertical" className="mx-1 h-5!" />
        <Popover
          open={linkOpen}
          onOpenChange={(open) => {
            setLinkOpen(open)
            if (open) setLinkUrl(editor?.getAttributes("link").href ?? "")
          }}
        >
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Link"
                className={cn(state?.link && "bg-muted text-foreground")}
              />
            }
          >
            <LinkIcon />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <div className="flex gap-2">
              <Input
                autoFocus
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    applyLink()
                  }
                }}
                placeholder="https://"
                aria-label="Link URL"
              />
              <Button
                type="button"
                size="sm"
                className="h-8"
                onClick={applyLink}
              >
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
