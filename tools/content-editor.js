import savedContent from '../js/custom-content-data.js';
import { validateContent } from '../js/customContent.js';

const fieldsByGroup = {
  enemies: [
    ['id', 'ID'], ['name', 'Ime', 'Forest Spider'], ['behavior', 'Ponašanje', ['hostile', 'passive']],
    ['idle', 'PNG u mirovanju', 'assets/enemies/spider.png'],
    ['walk', 'PNG hodanja', 'assets/enemies/spider_walk.png'],
    ['dead', 'PNG tijela', 'assets/enemies/spider_dead.png'],
    ['frameSize', 'Dimenzija kvadratnog kadra (px)', 24], ['axis', 'Smjer kadrova', ['y', 'x']],
    ['fps', 'Kadrova u sekundi', 10], ['health', 'Zdravlje', 85], ['speed', 'Brzina', 10],
    ['damage', 'Šteta izbliza', 12], ['attackRate', 'Sekunde između napada', 0.8],
    ['attackRange', 'Domet napada', 2.1], ['detectRange', 'Domet detekcije na ekranu', 24],
    ['spawnWeight', 'Težina pojavljivanja (100 = svi osnovni neprijatelji zajedno)', 10],
  ],
  items: [
    ['id', 'ID'], ['name', 'Ime', 'Metal Shard'], ['icon', 'PNG ikone', 'assets/items/materials/metal.png'],
  ],
  weapons: [
    ['id', 'ID'], ['name', 'Ime', 'Custom Pistol'],
    ['icon', 'PNG ikone', 'assets/items/weapons/glock.png'],
    ['sprite', 'PNG oružja u ruci', 'assets/weapons/glock.png'],
    ['shot', 'PNG pucnja', 'assets/weapons/glock_shot.png'],
    ['ammoType', 'Vrsta streljiva', ['pistol', 'rifle', 'shotgun', 'sniper']],
    ['damage', 'Šteta po projektilu', 10], ['magSize', 'Kapacitet spremnika', 12],
    ['reloadTime', 'Sekunde za punjenje', 1.6], ['fireRate', 'Sekunde između automatskih pucnjeva (0 = poluautomatski)', 0],
    ['bulletSpeed', 'Brzina projektila', 150], ['spread', 'Raspršenje (radijani)', 0.04],
    ['pellets', 'Projektila po pucnju', 1],
  ],
  loot: [
    ['id', 'ID zapisa'], ['group', 'Vrsta sadržaja', ['items', 'weapons']],
    ['target', 'ID predmeta ili oružja'], ['weight', 'Težina u škrinji', 25],
    ['amount', 'Količina materijala (oružje je uvijek 1)', 1],
  ],
};

const byId = (id) => document.getElementById(id);
const group = byId('group');
const entries = byId('entry');
const fields = byId('fields');
const editor = byId('editor');
let draft = validateContent(savedContent);

function status(message, error = false) {
  byId('status').textContent = message;
  byId('status').classList.toggle('error', error);
}

function refreshList(selected = '') {
  const options = [new Option('+ Novi zapis', '')];
  for (const item of draft[group.value]) {
    options.push(new Option(item.name ? `${item.name} (${item.id})` : item.id, item.id));
  }
  entries.replaceChildren(...options);
  entries.value = selected;
  renderFields();
}

function renderFields() {
  const current = draft[group.value].find((item) => item.id === entries.value);
  fields.replaceChildren();
  byId('remove').disabled = !current;
  for (const [key, title, initial = ''] of fieldsByGroup[group.value]) {
    const label = document.createElement('label');
    label.textContent = title;
    const control = document.createElement(Array.isArray(initial) ? 'select' : 'input');
    if (Array.isArray(initial)) {
      control.replaceChildren(...initial.map((value) => new Option(value, value)));
    } else {
      control.type = typeof initial === 'number' ? 'number' : 'text';
      if (control.type === 'number') control.step = 'any';
    }
    control.name = key;
    control.required = true;
    control.value = current?.[key] ?? (Array.isArray(initial) ? initial[0] : initial);
    if (current && key === 'id') control.readOnly = true;
    label.append(control);
    fields.append(label);
  }
}

function updateDraft(change, selection) {
  try {
    const next = structuredClone(draft);
    change(next[group.value]);
    draft = validateContent(next);
    refreshList(selection);
    status('Radna verzija ažurirana. Izvezi katalog da bi ga igra učitala.');
  } catch (error) {
    status(error.message, true);
  }
}

group.addEventListener('change', () => refreshList());
entries.addEventListener('change', renderFields);
editor.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = new FormData(editor);
  const item = Object.fromEntries(fieldsByGroup[group.value].map(([key, , initial]) => [
    key, typeof initial === 'number' ? Number(values.get(key)) : values.get(key),
  ]));
  updateDraft((list) => {
    const index = list.findIndex((entry) => entry.id === entries.value);
    if (index < 0) list.push(item);
    else list[index] = item;
  }, item.id);
});
byId('remove').addEventListener('click', () => {
  updateDraft((list) => list.splice(list.findIndex((entry) => entry.id === entries.value), 1), '');
});

byId('import').addEventListener('change', async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    const source = (await file.text()).trim().replace(/^export default\s+/, '').replace(/;$/, '');
    draft = validateContent(JSON.parse(source));
    refreshList();
    status('Katalog učitan u radnu verziju.');
  } catch (error) {
    status(error.message, true);
  } finally {
    event.target.value = '';
  }
});

byId('save').addEventListener('click', async () => {
  const button = byId('save');
  button.disabled = true;
  try {
    const paths = new Set(Object.values(draft).flatMap((entries) =>
      entries.flatMap((entry) => Object.values(entry).filter((value) => typeof value === 'string' && value.startsWith('assets/')))));
    const invalid = await Promise.all([...paths].map(async (path) => {
      const img = new Image();
      img.src = new URL(`../${path}`, location.href);
      return img.decode().then(() => null, () => path);
    }));
    const missing = invalid.filter(Boolean);
    if (missing.length) throw Error(`Provjeri PNG datoteke:\n${missing.join('\n')}`);
    const source = `export default ${JSON.stringify(draft, null, 2)};\n`;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'custom-content-data.js';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('Izvoz preuzet. Spremi ga preko js/custom-content-data.js i ponovno učitaj igru.');
  } catch (error) {
    status(error.message, true);
  } finally {
    button.disabled = false;
  }
});
refreshList();
