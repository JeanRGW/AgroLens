/**
 * E2E spec — admin management flows.
 *
 * Covers the remaining admin UI journeys requested for E2E:
 *   - Create a user via the register dialog, verify the row, and change role
 *   - Grant/revoke access via the access page autocomplete fields
 *   - Filter the audit page by event/date/resource and export CSV
 */

import { test, expect, type Page } from '@playwright/test';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { loginAsBrowser } from './helpers';

interface ProvisionedData {
  ownerEmail: string;
  ownerPassword: string;
  adminEmail: string;
  adminPassword: string;
  ownerIsAdmin: boolean;
  uploadId: string;
  propertyId: string;
}

interface CreatedUser {
  fullName: string;
  email: string;
  password: string;
  userId: string;
}

function loadProvisioned(): ProvisionedData {
  const p = path.join(__dirname, '.auth', 'provisioned.json');
  if (!fs.existsSync(p)) {
    throw new Error(
      'Provisioned data not found at ' + p + '. Global setup may have failed. Run: npm run e2e',
    );
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

const data = loadProvisioned();

async function loginAsAdmin(page: Page) {
  const creds = data.ownerIsAdmin
    ? { email: data.ownerEmail, password: data.ownerPassword }
    : { email: data.adminEmail, password: data.adminPassword };

  await loginAsBrowser(page, creds.email, creds.password);
  await expect(page.locator('.shell-container')).toBeVisible();
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

async function createUserViaUi(page: Page): Promise<CreatedUser> {
  const suffix = uniqueSuffix();
  const fullName = `E2E Admin ${suffix}`;
  const email = `e2e-admin-${suffix}@test.local`;
  const password = randomBytes(18).toString('base64url');

  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Gestão de Usuários' })).toBeVisible();

  await page.getByRole('button', { name: /Registrar novo usuário/ }).click();
  const dialog = page.locator('mat-dialog-container');
  await expect(dialog.getByText('Registrar novo usuário')).toBeVisible();

  // Material applies initial focus after the opening animation finishes.
  const nameInput = dialog.getByLabel('Nome completo');
  await expect(nameInput).toBeFocused();
  await nameInput.fill(fullName);
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Telefone').fill('(11) 91234-5678');
  await dialog.getByRole('combobox', { name: 'Perfil' }).click();
  await page.getByRole('option', { name: 'Usuário' }).click();
  await dialog.locator('input[formcontrolname="password"]').fill(password);
  await dialog.locator('input[formcontrolname="confirmPassword"]').fill(password);
  await dialog.getByRole('button', { name: /Registrar usuário/ }).click();

  await expect(dialog.getByText('Usuário registrado com sucesso!')).toBeVisible();

  await dialog.getByRole('button', { name: /Concluir/ }).click();
  await expect(dialog).not.toBeVisible();

  const row = await searchUserRow(page, email);
  // The ID cell renders <app-copy-id-button>: its text is the shortened ID plus
  // the "content_copy" icon ligature, so read the full UUID from the title.
  const copyButton = row.locator('button.uid-copy').first();
  await expect(copyButton).toBeVisible({ timeout: 15_000 });
  const userId = (await copyButton.getAttribute('title'))?.trim();
  expect(userId).toBeTruthy();
  expect(userId).toMatch(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );

  return {
    fullName,
    email,
    password,
    userId: userId!,
  };
}

async function searchUserRow(page: Page, term: string) {
  await page.getByLabel('Buscar por nome, ID ou email').fill(term);
  const row = page.locator('.users-table tbody tr').filter({ hasText: term });
  await expect(row).toBeVisible({ timeout: 15_000 });
  return row;
}

async function changeUserRoleViaUi(page: Page, user: CreatedUser, roleLabel: string) {
  const row = await searchUserRow(page, user.email);
  await row.getByRole('combobox').click();
  await page.getByRole('option', { name: roleLabel }).click();

  const confirmDialog = page.locator('mat-dialog-container').last();
  await expect(confirmDialog).toContainText('Alterar função do usuário');
  await confirmDialog.getByRole('button', { name: 'Confirmar' }).click();
  await expect(confirmDialog).not.toBeVisible();
  await expect(row).toContainText(roleLabel);
}

async function grantAndRevokeAccessViaUi(page: Page, user: CreatedUser) {
  await page.goto('/admin/access');
  await expect(page.getByRole('heading', { name: 'Gestão de Permissões' })).toBeVisible();

  const userSearch = page.getByLabel('Buscar usuário por nome ou email');
  await userSearch.fill(user.email);
  const userOption = page.getByRole('option').filter({ hasText: user.email }).first();
  await expect(userOption).toBeVisible({ timeout: 15_000 });
  await userOption.click();
  await expect(page.getByText('Usuário Selecionado:')).toBeVisible();

  await page.getByRole('combobox', { name: 'Tipo de recurso' }).click();
  await page.getByRole('option', { name: 'Propriedade' }).click();

  const resourceSearch = page.getByLabel('Buscar por nome ou ID');
  await resourceSearch.fill(data.propertyId);
  const resourceOption = page.getByRole('option').filter({ hasText: data.propertyId }).first();
  await expect(resourceOption).toBeVisible({ timeout: 15_000 });
  await resourceOption.click();

  await page.getByLabel('Comentário sobre a concessão').fill('E2E admin access grant');
  await page.getByRole('button', { name: 'Conceder Acesso' }).click();

  const grantsTable = page.locator('.grants-table tbody');
  const grantRow = grantsTable.locator('tr').filter({ hasText: data.propertyId });
  await expect(grantRow).toContainText('Propriedade', { timeout: 15_000 });
  const revokeButton = grantRow.locator('button').first();
  await expect(revokeButton).toBeVisible();

  await revokeButton.click();
  const revokeDialog = page.locator('mat-dialog-container').last();
  await expect(revokeDialog).toContainText('Revogar acesso');
  await revokeDialog.getByRole('button', { name: 'Revogar' }).click();
  await expect(revokeDialog).not.toBeVisible();
  await expect(grantRow).toContainText('Revogado');
}

test.describe('Admin management flows', () => {
  test('creates a user and updates the role via UI', async ({ page }) => {
    await loginAsAdmin(page);

    const user = await createUserViaUi(page);

    await searchUserRow(page, user.email);
    const row = page.locator('.users-table tbody tr').filter({ hasText: user.email });
    await expect(row).toContainText(user.fullName);
    await expect(row).toContainText('Usuário');

    await row.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Administrador' }).click();
    const confirmDialog = page.locator('mat-dialog-container').last();
    await expect(confirmDialog).toContainText('Alterar função do usuário');
    await confirmDialog.getByRole('button', { name: 'Confirmar' }).click();
    await expect(confirmDialog).not.toBeVisible();
    await expect(row).toContainText('Administrador');
  });

  test('grants and revokes access via UI autocomplete', async ({ page }) => {
    await loginAsAdmin(page);

    const user = await createUserViaUi(page);
    await grantAndRevokeAccessViaUi(page, user);
  });

  test('filters audit events and exports CSV', async ({ page }) => {
    test.setTimeout(180_000);

    await loginAsAdmin(page);

    const user = await createUserViaUi(page);
    await changeUserRoleViaUi(page, user, 'Administrador');
    await grantAndRevokeAccessViaUi(page, user);

    await page.goto('/admin/audit');
    await expect(page.getByRole('heading', { name: 'Auditoria de Acessos' })).toBeVisible();

    const date = todayIsoDate();
    await page.getByLabel('Data inicial').fill(date);
    await page.getByLabel('Data final').fill(date);

    await page.getByRole('combobox', { name: 'Evento' }).click();
    await page.getByRole('option', { name: 'Concessão' }).click();
    await page.getByRole('combobox', { name: 'Recurso' }).click();
    await page.getByRole('option', { name: 'Propriedade' }).click();
    await page.getByLabel('ID do Recurso').fill(data.propertyId);
    await page.getByRole('button', { name: 'Atualizar' }).click();

    const auditBody = page.locator('.audit-table tbody');
    await expect(auditBody).toContainText('Concessão');
    // The table shows the resolved resource name (e.g. "Propriedade: E2E Farm ...");
    // the raw UUID is kept in the copy button's title attribute.
    await expect(auditBody).toContainText('Propriedade');
    await expect(
      auditBody.locator(`button.uid-copy[title="${data.propertyId}"]`).first(),
    ).toBeVisible();

    await page.getByRole('combobox', { name: 'Evento' }).click();
    await page.getByRole('option', { name: 'Revogação' }).click();
    await page.getByRole('combobox', { name: 'Recurso' }).click();
    await page.getByRole('option', { name: 'Todos' }).click();
    await page.getByLabel('ID do Recurso').fill('');
    await page.getByRole('button', { name: 'Atualizar' }).click();
    await expect(auditBody).toContainText('Revogação');
    await expect(
      auditBody.locator(`button.uid-copy[title="${data.propertyId}"]`).first(),
    ).toBeVisible();

    await page.getByRole('combobox', { name: 'Evento' }).click();
    await page.getByRole('option', { name: 'Papel alterado' }).click();
    await page.getByRole('combobox', { name: 'Recurso' }).click();
    await page.getByRole('option', { name: 'Todos' }).click();
    await page.getByLabel('ID do Recurso').fill('');
    await page.getByLabel('ID do Alvo').fill(user.userId);
    await page.getByRole('button', { name: 'Atualizar' }).click();
    await expect(auditBody).toContainText('Papel alterado');
    await expect(auditBody).toContainText(user.fullName);
    await expect(
      auditBody.locator(`button.uid-copy[title="${user.userId}"]`).first(),
    ).toBeVisible();

    await page.getByRole('combobox', { name: 'Evento' }).click();
    await page.getByRole('option', { name: 'Todos' }).click();
    await page.getByRole('combobox', { name: 'Recurso' }).click();
    await page.getByRole('option', { name: 'Todos' }).click();
    await page.getByLabel('ID do Recurso').fill('');
    await page.getByLabel('ID do Alvo').fill('');
    await page.getByRole('button', { name: 'Atualizar' }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar CSV' }).click();
    const download = await downloadPromise;
    const downloadPath = path.join(__dirname, '.auth', `audit-${Date.now()}.csv`);
    await download.saveAs(downloadPath);

    const csv = fs.readFileSync(downloadPath, 'utf-8');
    expect(csv).toContain(
      'eventType,actorUserId,actorName,targetUserId,targetName,resourceType,resourceId,createdAt,before,after',
    );
    expect(csv).toContain('access_grant');
    expect(csv).toContain('access_revoke');
    expect(csv).toContain('role_change');
    expect(csv).toContain(data.propertyId);
    expect(csv).toContain(user.userId);

    fs.unlinkSync(downloadPath);
  });
});
