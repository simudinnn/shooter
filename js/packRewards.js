import { getItemDisplayName, getItemIconSrc } from './loot.js';
import { setElementPixelText, setElementWrappedPixelText, PIXEL_TEXT_SCALE_SM } from './pixelText.js';

export function showPackRewards(host, pack, rewards) {
  const dialog = document.createElement('dialog');
  dialog.className = 'raid-quantity-dialog pack-rewards-dialog';
  dialog.setAttribute('aria-label', 'Pack contents');
  const heading = document.createElement('h2');
  setElementWrappedPixelText(heading, getItemDisplayName({ ...pack, amount: 1 }), 300, PIXEL_TEXT_SCALE_SM);
  const list = document.createElement('ul');
  for (const reward of rewards) {
    const row = document.createElement('li');
    const icon = document.createElement('img');
    icon.src = getItemIconSrc(reward);
    icon.alt = '';
    const label = document.createElement('span');
    const name = getItemDisplayName(reward);
    label.setAttribute('aria-label', name);
    setElementWrappedPixelText(label, name, 240, PIXEL_TEXT_SCALE_SM);
    row.append(icon, label);
    list.append(row);
  }
  const form = document.createElement('form');
  form.method = 'dialog';
  const button = document.createElement('button');
  button.className = 'ui-slice-button';
  button.setAttribute('aria-label', 'Continue');
  setElementPixelText(button, 'CONTINUE', PIXEL_TEXT_SCALE_SM);
  form.append(button);
  dialog.append(heading, list, form);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  host.append(dialog);
  dialog.showModal();
}
