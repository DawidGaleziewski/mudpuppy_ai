import type { ReactNode } from 'react';
import { Text } from '../atoms/Text.js';
import { Cluster, Split, Stack } from '../layout/Layout.js';
import { Segmented } from '../molecules/Segmented.js';
import { Dialog } from './Dialog.js';

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
  return (
    <Dialog open={open} onClose={onClose} label={typeof heading === 'string' ? heading : 'Recording'} size="recording">
      <Dialog.Head>
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
            <Dialog.Close />
          </Cluster>
        </Split>
      </Dialog.Head>
      <Dialog.Main>
        <Dialog.Figure label="The recorded picture">{figure}</Dialog.Figure>
        <Dialog.Aside label="About this recording">{aside}</Dialog.Aside>
      </Dialog.Main>
      {foot && <Dialog.Foot>{foot}</Dialog.Foot>}
    </Dialog>
  );
}
