const { test, expect } = require('playwright/test');

async function login(page, password = 'clave-local-de-pruebas') {
    await page.goto('/');
    await page.getByLabel('Usuario', { exact: true }).fill('operador');
    await page.getByLabel('Contraseña').fill(password);
    await page.getByRole('button', { name: 'Entrar' }).click();
}

test('valida credenciales, conserva la sesión al recargar y permite salir', async ({ page }) => {
    await login(page, 'incorrecta');
    await expect(page.getByRole('alert')).toHaveText('Usuario o contraseña incorrectos');
    await login(page);
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    expect((await page.request.get('/api/products')).status()).toBe(401);
});

for (const flow of [
    {
        title: 'Usuarios', singular: 'usuario',
        initial: { Nombre: 'Ana Ejemplo', 'Correo electrónico': 'ana@example.com' },
        updated: { Nombre: 'Ana Editada', 'Correo electrónico': 'editada@example.com' },
        result: 'editada@example.com'
    },
    {
        title: 'Productos', singular: 'producto',
        initial: { Nombre: 'Teclado', 'Precio (MXN)': '129.99', Existencias: '4' },
        updated: { Nombre: 'Teclado editado', 'Precio (MXN)': '150.50', Existencias: '8' },
        result: '$150.50'
    }
]) {
    test(flow.title + ' permite crear, consultar, editar y eliminar', async ({ page }) => {
        await login(page);
        await page.getByRole('button', { name: flow.title, exact: true }).click();
        await page.getByRole('button', { name: 'Agregar ' + flow.singular }).click();
        let dialog = page.getByRole('dialog');
        for (const [label, value] of Object.entries(flow.initial)) await dialog.getByLabel(label).fill(value);
        await dialog.getByRole('button', { name: 'Guardar' }).click();
        const initial = page.getByRole('row').filter({ hasText: flow.initial.Nombre });
        await expect(initial).toBeVisible();
        await initial.getByRole('button', { name: 'Editar ' + flow.initial.Nombre }).click();
        for (const [label, value] of Object.entries(flow.updated)) await dialog.getByLabel(label).fill(value);
        await dialog.getByRole('button', { name: 'Guardar' }).click();
        await page.reload();
        await page.getByRole('button', { name: flow.title, exact: true }).click();
        await page.getByRole('searchbox').fill(flow.updated.Nombre);
        const updated = page.getByRole('row').filter({ hasText: flow.updated.Nombre });
        await expect(updated).toContainText(flow.result);
        await updated.getByRole('button', { name: 'Eliminar ' + flow.updated.Nombre }).click();
        await dialog.getByRole('button', { name: 'Cancelar' }).click();
        await expect(updated).toBeVisible();
        await updated.getByRole('button', { name: 'Eliminar ' + flow.updated.Nombre }).click();
        await dialog.getByRole('button', { name: 'Eliminar', exact: true }).click();
        await expect(page.getByRole('status')).toHaveText('Registro eliminado.');
        await expect(updated).toHaveCount(0);
    });
}
