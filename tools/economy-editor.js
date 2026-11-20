import economy from '../js/economy-data.js';
import { MATERIAL_KEYS } from '../js/materials.js';
import { CRAFT_MAX_MATERIALS } from '../js/crafting.js';

const notes = {
  shop: 'Price je cijena paketa. Level je minimalni level za kupnju.',
  sellPrices: 'Cijene su po komadu. Cijene opreme i oružja vrijede za 100% durabilityja.',
  crafting: 'Costs su količine materijala. Output je rezultat. Level vrijedi i u bazi i u raidu.',
  recycling: 'Items omogućuje recept po predmetu, primjerice "weapon.glock". Za municiju se prinos računa po paketu.',
  recycleLevels: 'Koristi vrstu predmeta ili ključ poput "material.upgrade_kit". Bez unosa vrijedi level 1.',
  economy: 'Početni cash vrijedi za nove profile. Uspješna ekstrakcija ne daje automatsku novčanu nagradu.',
};
const drafts = Object.fromEntries(Object.entries(economy).map(([key, value]) => [key, JSON.stringify(value, null, 2)]));
const section = document.querySelector('#section');
const data = document.querySelector('#data');
const help = document.querySelector('#help');
const status = document.querySelector('#status');
let active = section.value;

function showSection() {
  data.value = drafts[active];
  help.textContent = notes[active];
}

section.addEventListener('change', () => {
  drafts[active] = data.value;
  active = section.value;
  showSection();
});

function requireValid(condition, label) {
  if (!condition) throw new Error(label);
}

function validate(config) {
  const positive = (n) => Number.isSafeInteger(n) && n > 0;
  const material = (key) => MATERIAL_KEYS.includes(key);
  const item = (entry) => typeof entry?.kind === 'string'
    && typeof (entry.key ?? entry.ammoType ?? entry.kind) === 'string'
    && positive(entry.amount ?? 1);
  const yields = (entries) => Array.isArray(entries)
    && entries.every((entry) => material(entry.key) && positive(entry.amount));
  for (const kind of ['material', 'equipment', 'weapon', 'melee']) {
    const prices = config.sellPrices?.[kind];
    requireValid(prices && typeof prices === 'object' && !Array.isArray(prices)
      && Object.values(prices).every(positive), 'Neispravne prodajne cijene: ' + kind);
  }
  requireValid(Array.isArray(config.shop) && config.shop.every((offer) =>
    positive(offer.price) && positive(offer.level) && item(offer.item)), 'Shop ima neispravnu ponudu.');
  const recipeIds = new Set();
  requireValid(Array.isArray(config.crafting), 'Crafting mora sadržavati listu recepata.');
  for (const recipe of config.crafting) {
    const costs = Object.entries(recipe.costs ?? {});
    requireValid(typeof recipe.id === 'string' && recipe.id && !recipeIds.has(recipe.id)
      && item(recipe.output) && positive(recipe.level ?? 1) && costs.length > 0
      && costs.length <= CRAFT_MAX_MATERIALS
      && costs.every(([key, amount]) => material(key) && positive(amount)),
    'Neispravan crafting recept: ' + recipe.id);
    recipeIds.add(recipe.id);
  }
  for (const key of ['weapon', 'melee', 'bandage', 'ammo']) {
    requireValid(yields(config.recycling[key]), 'Neispravan recycling recept: ' + key);
  }
  for (const key of ['material', 'items']) {
    requireValid(config.recycling[key] && !Array.isArray(config.recycling[key])
      && typeof config.recycling[key] === 'object' && Object.values(config.recycling[key]).every(yields),
    'Neispravan recycling odjeljak: ' + key);
  }
  requireValid(Object.values(config.recycleLevels).every(positive), 'Leveli za recycling moraju biti pozitivni cijeli brojevi.');
  for (const key of Object.keys(economy.economy)) {
    const value = config.economy[key];
    requireValid(Number.isSafeInteger(value) && value >= (key === 'ammoRecycleBatch' ? 1 : 0),
      'Neispravna vrijednost: ' + key);
  }
}

document.querySelector('#export').addEventListener('click', () => {
  drafts[active] = data.value;
  try {
    const config = Object.fromEntries(Object.entries(drafts).map(([key, value]) => {
      try {
        return [key, JSON.parse(value)];
      } catch {
        throw new Error('Provjeri JSON u odjeljku ' + key + '.');
      }
    }));
    validate(config);
    const url = URL.createObjectURL(new Blob(['export default ' + JSON.stringify(config, null, 2) + ';\n'],
      { type: 'text/javascript' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'economy-data.js';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.classList.remove('error');
    status.textContent = 'Datoteka je spremna za preuzimanje.';
  } catch (error) {
    status.classList.add('error');
    status.textContent = error.message;
  }
});

showSection();
