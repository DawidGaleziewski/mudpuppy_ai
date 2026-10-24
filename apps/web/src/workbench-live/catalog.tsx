// The live Workbench's A2UI catalog (spec 075): the designer's catalog id and component names
// (`packages/workbench-contract/workbench/a2ui/catalog.json`), our placeholder React parts, and the
// spike's own `Choice`. A component the spike does not draw yet shows as a named grey box.

import { z } from 'zod';
import { Catalog, type ComponentApi } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { Choice, CommandCard, RecordCard, RecordList, View } from './catalog-cards';
import { ErrorCard, LiveMap, Narration, PageDetail, PageMiniature, ScanMeter } from './catalog-scan';

export const CATALOG_ID = 'https://mudpuppy.local/a2ui/catalogs/workbench/v1/catalog.json';

/** In the designer's catalog, not drawn in the spike (Troubleshoot, Explain: phase 2 and later). */
export const LATER = ['StepShot', 'EventTail', 'FixChoices', 'AttemptList', 'Compare', 'DecisionTable', 'FindingCard'];

const later = (name: string) =>
  createComponentImplementation({ name, schema: z.object({}).passthrough() }, () => <div className="wbx-box wbx-muted">{name} (not in the spike yet)</div>);

export const DRAWN = [View, CommandCard, Choice, LiveMap, ScanMeter, Narration, ErrorCard, PageDetail, PageMiniature, RecordCard, RecordList];

export const liveCatalog = new Catalog<ComponentApi>(CATALOG_ID, 'v0.9', [...DRAWN, ...LATER.map(later)]);
