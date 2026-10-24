import { chromium } from '@playwright/test';

const projectId = '9f1ead00-1c44-4000-8000-000000000002';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`http://127.0.0.1:4200/projects/${projectId}/gates`);
  await page.getByRole('heading', { name: 'Os cinco Gates' }).waitFor();
  for (let i = 0; i <= 4; i++) await page.getByText(`Gate ${i} · Fase ${i}`, { exact: false }).first().waitFor();
  await page.screenshot({ path: '.local/screenshots/etapa-4-gates-desktop.png', fullPage: true });
  const gate0 = page.locator('.gate-list-card').first();
  await gate0.click();
  await page.getByRole('heading', { name: /Gate 0/ }).waitFor();
  await page.getByRole('heading', { name: 'Critérios e evidências' }).waitFor();
  await page.getByText('PARECER TÉCNICO JGM4').waitFor();
  await page.getByText('DECISÃO OLLEM').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  if (width > 390) throw new Error(`Layout mobile excede viewport: ${width}px`);
  await page.screenshot({ path: '.local/screenshots/etapa-4-gates-mobile.png', fullPage: true });
  console.log('Etapa 4: listagem e detalhe dos Gates passaram em desktop e mobile.');
} finally { await browser.close(); }
