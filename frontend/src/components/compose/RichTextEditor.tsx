import {
  AlignCenter,
  AlignStartVertical,
  Bold,
  ChevronsUpDown,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Type,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';

export interface RichTextEditorHandle {
  focus: () => void;
}

interface Props {
  onChange: (html: string, text: string) => void;
  placeholder?: string;
}

/**
 * Lightweight WYSIWYG editor (contentEditable + execCommand) with the toolbar from the Figma design.
 * The HTML is sanitized on the backend before it is stored or sent.
 */
export const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(function RichTextEditor(
  { onChange, placeholder = 'Type Your Reply...' },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => editorRef.current?.focus() }));

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (el) onChange(el.innerHTML, el.innerText.trim());
  }, [onChange]);

  const exec = useCallback(
    (command: string, value?: string) => {
      editorRef.current?.focus();
      document.execCommand(command, false, value);
      emit();
    },
    [emit],
  );

  return (
    <div className="rounded-lg bg-surface">
      <div className="px-3 pt-3 text-[13px] text-ink-faint">{placeholder}</div>
      <div className="sticky top-0 z-10 px-3 pt-3">
        <div
          role="toolbar"
          aria-label="Formatting"
          className="flex flex-wrap items-center gap-0.5 rounded-full bg-white px-3 py-1"
        >
          <ToolButton icon={Undo2} label="Undo" onClick={() => exec('undo')} />
          <ToolButton icon={Redo2} label="Redo" onClick={() => exec('redo')} />
          <Divider />
          <MenuButton
            label="Font size"
            trigger={
              <>
                <Type className="h-4 w-4" strokeWidth={1.75} />
                <ChevronsUpDown className="h-3 w-3" strokeWidth={1.75} />
              </>
            }
            options={[
              { label: 'Small', run: () => exec('fontSize', '2') },
              { label: 'Normal', run: () => exec('fontSize', '3') },
              { label: 'Large', run: () => exec('fontSize', '5') },
              { label: 'Huge', run: () => exec('fontSize', '6') },
            ]}
          />
          <Divider />
          <ToolButton icon={Bold} label="Bold" onClick={() => exec('bold')} />
          <ToolButton icon={Italic} label="Italic" onClick={() => exec('italic')} />
          <ToolButton icon={Underline} label="Underline" onClick={() => exec('underline')} />
          <Divider />
          <MenuButton
            label="Alignment"
            trigger={
              <>
                <AlignCenter className="h-4 w-4" strokeWidth={1.75} />
                <ChevronsUpDown className="ml-1.5 h-4 w-4" strokeWidth={1.75} />
              </>
            }
            options={[
              { label: 'Align left', run: () => exec('justifyLeft') },
              { label: 'Align center', run: () => exec('justifyCenter') },
              { label: 'Align right', run: () => exec('justifyRight') },
              { label: 'Justify', run: () => exec('justifyFull') },
            ]}
          />
          <Divider />
          <ToolButton icon={ListOrdered} label="Numbered list" onClick={() => exec('insertOrderedList')} />
          <ToolButton icon={List} label="Bulleted list" onClick={() => exec('insertUnorderedList')} />
          <ToolButton icon={IndentIncrease} label="Indent" onClick={() => exec('indent')} />
          <ToolButton icon={IndentDecrease} label="Outdent" onClick={() => exec('outdent')} />
          <ToolButton icon={Quote} label="Quote" onClick={() => exec('formatBlock', 'blockquote')} />
          <ToolButton icon={AlignStartVertical} label="Clear formatting" onClick={() => exec('removeFormat')} />
          <Divider />
          <ToolButton icon={Strikethrough} label="Strikethrough" onClick={() => exec('strikeThrough')} />
        </div>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Email body"
        onInput={emit}
        onBlur={emit}
        className="rich-content min-h-[260px] px-4 py-4 outline-none"
      />
    </div>
  );
});

const keepSelection = (e: MouseEvent) => e.preventDefault();

function Divider() {
  return <span className="mx-1.5 h-4 w-px bg-line" aria-hidden="true" />;
}

function ToolButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={keepSelection}
      onClick={onClick}
      className="rounded p-1.5 text-ink-muted hover:bg-field hover:text-ink"
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}

function MenuButton({
  label,
  trigger,
  options,
}: {
  label: string;
  trigger: ReactNode;
  options: { label: string; run: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onMouseDown={keepSelection}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center rounded p-1.5 text-ink-muted hover:bg-field hover:text-ink"
      >
        {trigger}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-36 rounded-lg border border-line bg-white py-1 text-xs shadow-popover">
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              onMouseDown={keepSelection}
              onClick={() => {
                o.run();
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left hover:bg-field"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
