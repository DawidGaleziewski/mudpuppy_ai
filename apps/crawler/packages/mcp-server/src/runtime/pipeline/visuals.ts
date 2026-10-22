import { maskText } from '@mudpuppy/core';
import { captureVisuals } from '@mudpuppy/crawler';
import { saveWireframe, setStateVisuals } from '../../services/index.js';
import { ANSI_STYLE, decision, event, reported, step, type StepContext } from './context.js';

/**
 * A new state's picture, before anything acts on the page (spec 008 FR-005, FR-008), and its
 * wireframe, drawn from the snapshot just stored (FR-014).
 */
export async function newStateVisuals(
  sc: StepContext,
  state: { id: string; title: string; snapshot: string },
): Promise<void> {
  const { ctx } = sc;
  await captureStateVisuals(sc, state.id);
  await step(sc, 'wireframe', async () => {
    try {
      await saveWireframe(ctx, { id: state.id, title: state.title, ariaYaml: state.snapshot });
      return reported(undefined);
    } catch (e) {
      const error = maskText(e instanceof Error ? e.message : String(e)).slice(0, 300);
      return reported(undefined, [
        event('capture_failed', { state_id: state.id, stage: 'wireframe', error }),
        decision({
          kind: 'warning',
          rule: 'wireframe_failed',
          reason: `wireframe of the new state not drawn: ${error}`,
          subject_ref: state.id,
        }),
      ]);
    }
  });
}

/**
 * Screenshot and layout of a newly created state (spec 008 research R3). Never fails the state or
 * the run: a failed capture is a decision-log warning and a `capture_failed` event (FR-009).
 */
function captureStateVisuals(sc: StepContext, stateId: string): Promise<void> {
  const { ctx, rs } = sc;
  return step(sc, 'capture', async () => {
    try {
      const capture = ctx.captureVisuals ?? captureVisuals;
      const { png, layout } = await capture(
        rs.session.page,
        rs.effective.portal.pii_scrub ? { mask: maskText } : {},
      );
      const screenshot_ref = await ctx.evidence.storeBinary(png, 'png');
      const layout_ref = await ctx.evidence.storeJson(layout);
      await setStateVisuals(ctx, stateId, { screenshot_ref, layout_ref });
      return reported(undefined, [
        event('visuals_captured', {
          state_id: stateId,
          screenshot_ref,
          layout_ref,
          bytes: png.byteLength,
          elements: layout.elements.length,
          boxed: layout.elements.filter((e) => e.box !== null).length,
          cut: layout.cut,
        }),
      ]);
    } catch (e) {
      const error = maskText(e instanceof Error ? e.message : String(e))
        .replace(ANSI_STYLE, '')
        .slice(0, 300);
      return reported(undefined, [
        event('capture_failed', { state_id: stateId, stage: 'screenshot', error }),
        decision({
          kind: 'warning',
          rule: 'capture_failed',
          reason: `screenshot of the new state not recorded: ${error}`,
          subject_ref: stateId,
        }),
      ]);
    }
  });
}
