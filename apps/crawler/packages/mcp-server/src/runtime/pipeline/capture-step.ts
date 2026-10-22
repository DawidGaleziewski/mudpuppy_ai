import type { NetworkObservation, SettleOutcome } from '@mudpuppy/crawler';
import { capturePage, type PageCapture } from './capture-v2.js';
import { event, reported, step, type StepContext } from './context.js';

/**
 * `model_capture` (spec 039 design § 5.2–5.6): the page's step result, the builds of its scopes and
 * the calls it made, after `fingerprint`. Reads the meta build marker when the portal names one.
 */
export function modelCaptureStep(
  sc: StepContext,
  page: {
    url: string;
    masked: string;
    net: NetworkObservation;
    stabilization: SettleOutcome['result'];
  },
): Promise<PageCapture> {
  const { rs } = sc;
  return step(sc, 'model_capture', async () => {
    const meta = rs.effective.portal.model.build_marker?.meta;
    const metaMarker = meta
      ? await rs.session.page
          .locator(`meta[name=${JSON.stringify(meta)}]`)
          .first()
          .getAttribute('content', { timeout: 500 })
          .catch(() => null)
      : null;
    const capture = capturePage(rs, {
      url: page.url,
      masked: page.masked,
      net: page.net,
      settled: page.stabilization === 'settled',
      metaMarker,
    });
    return reported(capture, [
      event('model_capture', {
        result: capture.result,
        builds: capture.builds.map((b) => `${b.scope}:${b.source}`),
        calls: capture.calls.length,
      }),
    ]);
  });
}
