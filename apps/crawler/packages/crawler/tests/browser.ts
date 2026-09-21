import { chromium, type Browser } from 'playwright';

/** True when a headless Chromium can start here (needs `playwright install --with-deps chromium`). */
export async function browserAvailable(): Promise<boolean> {
  try {
    const b = await chromium.launch();
    await b.close();
    return true;
  } catch {
    return false;
  }
}

export async function launch(): Promise<Browser> {
  return chromium.launch();
}
