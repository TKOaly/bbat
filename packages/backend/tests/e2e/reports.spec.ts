import { expect } from '@playwright/test';
import { test } from './fixtures';

const reportTypes = [
  {
    name: 'debt ledger',
    button: 'New Debt Ledger',
  },
  {
    name: 'payment ledger',
    button: 'New Payment Ledger',
  },
  {
    name: 'debt status report',
    button: 'New Debt Status Report',
  },
];

for (const { name, button } of reportTypes) {
  test(`Generate a ${name} with default options`, async ({ page, bbat }) => {
    test.slow();

    await page.goto(bbat.url);

    await page
      .context()
      .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

    await bbat.login({});

    await page.goto(`${bbat.url}/admin/reports`);

    await page.getByRole('button', { name: button }).click();
    await bbat.getDialog().getByRole('button', { name: 'Generate' }).click();
    const table = bbat.table(page.getByRole('table'));
    await expect(table.rows()).toHaveCount(1);
    const row = table.row(0);

    await expect(row.getCell('Generated by')).toHaveText('Teppo Testaaja');

    await bbat.navigate('Jobs');

    const jobsTable = bbat.table(page.getByRole('table'));

    await expect(jobsTable.rows()).toHaveCount(1);

    await expect(jobsTable.row(0).getCell('Duration')).not.toHaveText(/-/, {
      timeout: 20000,
    });

    await bbat.navigate('Reports');

    await expect(row.getCell('Status')).toHaveText('Finished');
  });
}
