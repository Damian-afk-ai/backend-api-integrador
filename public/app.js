const byId = id => document.getElementById(id);
const access = byId('access');
const panel = byId('panel');
const search = byId('search');
const editor = byId('editor');
const confirmation = byId('confirmation');
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const stock = new Intl.NumberFormat('es-MX');
const views = {
    users: {
        title: 'Usuarios', singular: 'usuario', description: 'Administra los registros de usuarios.',
        fields: [
            { key: 'name', label: 'Nombre', type: 'text', minLength: 2, maxLength: 50 },
            { key: 'email', label: 'Correo electrónico', type: 'email' }
        ],
        cells: row => [row.name, row.email]
    },
    products: {
        title: 'Productos', singular: 'producto', description: 'Administra el catálogo, los precios y las existencias.',
        fields: [
            { key: 'name', label: 'Nombre', type: 'text', maxLength: 100 },
            { key: 'priceCents', label: 'Precio (MXN)', type: 'number', min: 0, max: 9999999.99, step: 0.01 },
            { key: 'stock', label: 'Existencias', type: 'number', min: 0, max: 999999999, step: 1 }
        ],
        cells: row => [row.name, money.format(row.priceCents / 100), stock.format(row.stock)]
    }
};
let current = 'users';
let records = [];
let requestId = 0;

function message(element, value = '', error = false) {
    element.textContent = value;
    element.hidden = !value;
    element.classList.toggle('error', error);
}

async function api(path, method = 'GET', body) {
    const response = await fetch('/api/' + path, {
        method,
        ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    });
    const result = await response.json();
    if (!response.ok) {
        if (response.status === 401 && path !== 'login' && path !== 'session') showLogin('La sesión terminó. Vuelve a entrar.');
        throw new Error(typeof result.data === 'string' ? result.data : 'Revisa los datos e inténtalo otra vez');
    }
    return result.data;
}

function showLogin(error = '') {
    requestId++;
    for (const dialog of [editor, confirmation]) if (dialog.open) dialog.close();
    panel.hidden = true;
    access.hidden = false;
    byId('login').reset();
    message(byId('login-error'), error, true);
    byId('login').elements.username.focus();
}

function showPanel(session) {
    byId('account-name').textContent = session.username;
    access.hidden = true;
    panel.hidden = false;
    changeView('users');
}

function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
}

function action(label, row, onClick) {
    const button = element('button', label);
    button.type = 'button';
    button.setAttribute('aria-label', label + ' ' + row.name);
    button.onclick = () => onClick(row);
    return button;
}

function renderRows() {
    const view = views[current];
    const term = search.value.trim().toLocaleLowerCase('es-MX');
    const visible = records.filter(row => view.cells(row).some(value => value.toLocaleLowerCase('es-MX').includes(term)));
    const rows = document.createDocumentFragment();
    for (const record of visible) {
        const row = document.createElement('tr');
        const actions = document.createElement('td');
        const buttons = document.createElement('div');
        buttons.className = 'row-actions';
        buttons.append(action('Editar', record, openEditor), action('Eliminar', record, openDelete));
        actions.append(buttons);
        row.append(...view.cells(record).map(value => element('td', value)), actions);
        rows.append(row);
    }
    byId('rows').replaceChildren(rows);
    message(byId('empty'), visible.length ? '' : term ? 'No hay coincidencias.' : 'Todavía no hay registros.');
    byId('count').textContent = visible.length === 1 ? '1 registro' : visible.length + ' registros';
}

async function loadRecords(feedback = '') {
    const id = ++requestId;
    try {
        const data = await api(current);
        if (id !== requestId) return;
        records = data;
        renderRows();
        message(byId('status'), feedback);
    } catch (error) {
        if (id === requestId) {
            if (!records.length) message(byId('empty'));
            message(byId('status'), error.message, true);
        }
    }
}

function changeView(key) {
    current = key;
    records = [];
    search.value = '';
    const view = views[key];
    byId('section-title').textContent = view.title;
    byId('section-description').textContent = view.description;
    byId('add').textContent = 'Agregar ' + view.singular;
    byId('columns').replaceChildren(...[...view.fields.map(field => field.label), 'Acciones'].map(label => {
        const header = element('th', label);
        header.scope = 'col';
        return header;
    }));
    for (const button of document.querySelectorAll('[data-view]')) {
        if (button.dataset.view === key) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    }
    renderRows();
    message(byId('empty'), 'Cargando registros…');
    message(byId('status'));
    loadRecords();
}

async function submit(form, errorElement, operation) {
    const controls = [...form.querySelectorAll('button')];
    controls.forEach(button => { button.disabled = true; });
    message(errorElement);
    try { await operation(); }
    catch (error) { message(errorElement, error.message, true); }
    finally { controls.forEach(button => { button.disabled = false; }); }
}

function openEditor(record) {
    const key = current;
    const view = views[key];
    const form = byId('record-form');
    byId('editor-title').textContent = (record ? 'Editar ' : 'Agregar ') + view.singular;
    message(byId('editor-error'));
    byId('fields').replaceChildren(...view.fields.map(({ key: field, label, ...attributes }) => {
        const container = element('label', label);
        const input = Object.assign(document.createElement('input'), attributes, { name: field, required: true });
        if (record) input.value = field === 'priceCents' ? (record.priceCents / 100).toFixed(2) : record[field];
        container.append(input);
        return container;
    }));
    form.onsubmit = event => {
        event.preventDefault();
        const body = Object.fromEntries(new FormData(form));
        body.name = body.name.trim();
        if (key === 'products') {
            body.priceCents = Math.round(Number(body.priceCents) * 100);
            body.stock = Number(body.stock);
        } else body.email = body.email.trim();
        submit(form, byId('editor-error'), async () => {
            await api(record ? key + '/' + record.id : key, record ? 'PUT' : 'POST', body);
            editor.close();
            await loadRecords(record ? 'Cambios guardados.' : 'Registro agregado.');
        });
    };
    editor.showModal();
}

function openDelete(record) {
    const key = current;
    const form = byId('delete-form');
    byId('confirmation-title').textContent = 'Eliminar ' + views[key].singular;
    byId('confirmation-text').textContent = '¿Quieres eliminar «' + record.name + '»?';
    message(byId('delete-error'));
    form.onsubmit = event => {
        event.preventDefault();
        submit(form, byId('delete-error'), async () => {
            await api(key + '/' + record.id, 'DELETE');
            confirmation.close();
            await loadRecords('Registro eliminado.');
        });
    };
    confirmation.showModal();
}

const login = byId('login');
login.onsubmit = event => {
    event.preventDefault();
    submit(login, byId('login-error'), async () => {
        showPanel(await api('login', 'POST', Object.fromEntries(new FormData(login))));
        login.reset();
    });
};
for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => changeView(button.dataset.view);
for (const dialog of [editor, confirmation]) {
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.oncancel = event => {
        if (dialog.querySelector('button:disabled')) event.preventDefault();
    };
}
search.oninput = renderRows;
byId('add').onclick = () => openEditor();
byId('logout').onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
        await api('logout', 'POST');
        showLogin();
    } catch (error) {
        message(byId('status'), error.message, true);
    } finally {
        button.disabled = false;
    }
};
api('session').then(showPanel, error => showLogin(error.message === 'Inicia sesión para continuar' ? '' : error.message));
