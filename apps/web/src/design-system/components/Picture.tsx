import { useRef, useState, type CSSProperties } from 'react';
import { Button, LinkButton } from './Button.js';
import { Segmented } from './Segmented.js';
import { Split } from './Layout.js';
import { Text } from './Text.js';

export interface PictureProps {
  /** The screenshot's URL; the thumbnail shows it, else the wireframe. */
  shot?: string | null | undefined;
  /** The wireframe's URL. */
  wire?: string | null | undefined;
  /** The screen's title, the dialog's heading. */
  title: string;
  route?: string | null;
  /** How many scans saw it, under the large picture. */
  scans?: number;
  /** The recorded page, the dialog's way on. */
  href?: string;
  /** `sm`: a 96 px thumbnail in a row or a table cell; by default it fills its box (a screen's page). */
  size?: 'sm';
}

// Layout only (no paint): the library has no class for the thumbnail's button nor a wide dialog;
// the designer is asked for both (spec 052). Until then they stay here, never in a page.
const BUTTON: CSSProperties = { display: 'block', width: '100%', padding: 0, border: 0, background: 'none', cursor: 'zoom-in' };
const SMALL: CSSProperties = { ...BUTTON, width: 96, flex: 'none' };
const WIDE: CSSProperties = { width: 'min(960px, calc(100vw - 32px))' };
const LARGE: CSSProperties = { display: 'block', maxWidth: '100%', maxHeight: '65vh', margin: '0 auto' };

/**
 * A recorded screen's picture: a thumbnail that opens a dialog with the large screenshot, a
 * Screenshot / Wireframe switch and the way to the recorded page. It never selects anything.
 */
export function Picture({ shot, wire, title, route, scans, href, size }: PictureProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState(shot ? 'shot' : 'wire');
  const thumb = shot ?? wire;
  if (!thumb) {
    return (
      <Text small muted block>
        No picture was recorded.
      </Text>
    );
  }
  const large = view === 'shot' ? shot : wire;
  return (
    <>
      <button type="button" style={size === 'sm' ? SMALL : BUTTON} aria-label={`Picture of ${title}`} onClick={() => dialog.current?.showModal()}>
        <img className="sy-thumb" src={thumb} alt="" loading="lazy" />
      </button>
      <dialog ref={dialog} className="sy-dialog" style={WIDE} aria-label={title}>
        <div className="sy-dialog__head">
          <Split>
            <h2 className="sy-h3 sy-case-normal">{title}</h2>
            <Button size="sm" variant="quiet" onClick={() => dialog.current?.close()}>
              Close
            </Button>
          </Split>
        </div>
        <div className="sy-dialog__body">
          <Split>
            <span className="sy-route">{route}</span>
            {scans !== undefined && (
              <Text small muted>
                seen in {scans} scan{scans === 1 ? '' : 's'}
              </Text>
            )}
          </Split>
          <Segmented
            label="Picture"
            selected={view}
            onSelect={setView}
            items={[
              { value: 'shot', label: 'Screenshot' },
              { value: 'wire', label: 'Wireframe' },
            ]}
          />
          {large ? (
            <img style={LARGE} src={large} alt={`${view === 'shot' ? 'Screenshot' : 'Wireframe'} of ${title}`} />
          ) : (
            <Text small muted block>
              Nothing recorded for this view.
            </Text>
          )}
        </div>
        {href && (
          <div className="sy-dialog__foot">
            <LinkButton href={href}>Open the recorded page</LinkButton>
          </div>
        )}
      </dialog>
    </>
  );
}
