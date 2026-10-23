import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button.js';
import { Cluster, Split, Stack } from './Layout.js';
import { Segmented } from './Segmented.js';
import { Text } from './Text.js';

export interface RecordingDialogProps {
  /** Shown as a modal while true; the page keeps it in its address (`?recording=`). */
  open: boolean;
  /** Esc, × or the dialog closing some other way: the page drops `recording=`. */
  onClose: () => void;
  /** "Kalkulator · variant r1 · recording". */
  heading: ReactNode;
  /** The visit: scan, time, release, persona. */
  meta?: ReactNode;
  /** Screenshot or wireframe, when both exist. */
  view: 'shot' | 'wire';
  onView?: ((view: 'shot' | 'wire') => void) | undefined;
  /** The picture with its marks (a `Shot`). */
  figure: ReactNode;
  /** About this recording: facts, what to show on the picture, amendments, the way to the scan. */
  aside: ReactNode;
  /** Earlier / later, where it is in the set, Copy link. */
  foot?: ReactNode;
}

/**
 * A recording (one visit of a screen) in the wide picture dialog with a facts column (designer
 * Q10, `.sy-dialog__main` + `.sy-dialog__aside`): it opens over the Screen page; under 1024 px
 * the facts go under the picture.
 */
export function RecordingDialog({ open, onClose, heading, meta, view, onView, figure, aside, foot }: RecordingDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal?.();
    if (!open && el.open) el.close?.();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="sy-dialog sy-dialog--wide sy-dialog--recording"
      aria-label={typeof heading === 'string' ? heading : 'Recording'}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <header className="sy-dialog__head">
            <Split>
              <Stack>
                <h2 className="sy-h3 sy-case-normal">{heading}</h2>
                {meta && <Text small muted>{meta}</Text>}
              </Stack>
              <Cluster>
                {onView && (
                  <Segmented
                    label="Show as"
                    selected={view}
                    onSelect={(v) => onView(v === 'wire' ? 'wire' : 'shot')}
                    items={[
                      { value: 'shot', label: 'Screenshot' },
                      { value: 'wire', label: 'Wireframe' },
                    ]}
                  />
                )}
                <Button size="md" className="sy-btn--icon sy-dialog__close" aria-label="Close (Esc)" onClick={onClose}>
                  ×
                </Button>
              </Cluster>
            </Split>
          </header>
          <div className="sy-dialog__main">
            {/* it scrolls a tall picture: keyboard users reach it too (axe scrollable-region-focusable) */}
            <figure className="sy-dialog__figure" data-fit="width" tabIndex={0} aria-label="The recorded picture">
              {figure}
            </figure>
            <aside className="sy-dialog__aside" aria-label="About this recording">
              {aside}
            </aside>
          </div>
          {foot && <footer className="sy-dialog__foot">{foot}</footer>}
        </>
      )}
    </dialog>
  );
}
