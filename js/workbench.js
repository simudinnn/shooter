import {
  CRAFT_RECIPES,
  canCraftRecipe,
  craftRecipe,
  formatRecipeCosts,
  getRecipeLabel,
} from './crafting.js';
import { getItemIconSrc } from './loot.js';

const ANIM_MS = 240;

export const WORKBENCH_ICON = 'assets/ui/workbench.png';

export class WorkbenchUI {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.animating = false;
    this.root = document.getElementById('workbench');
    this.panel = document.getElementById('workbench-panel');
    this.craftListEl = document.getElementById('workbench-craft-list');
    this.backdrop = this.root?.querySelector('.wb-backdrop');
    this.backdrop?.addEventListener('pointerdown', () => this.close());
    this.panel?.addEventListener('click', (e) => e.stopPropagation());
  }

  isOpen() { return this.open; }

  toggle() {
    if (this.animating) return;
    if (this.open) this.close();
    else this.openPanel();
  }

  openPanel() {
    if (!this.running()) return;
    this.animating = false;
    this.game.inventoryUI?.forceClose();
    this.open = true;
    this.animating = true;
    this.game.player?.melee && (this.game.player.melee.charging = false);
    this.game.mouseDown = false;
    this.game.prevMouseDown = false;
    this.root?.classList.remove('hidden');
    document.activeElement?.blur?.();
    this.render();
    requestAnimationFrame(() => {
      this.root?.classList.add('open');
      setTimeout(() => { this.animating = false; }, ANIM_MS);
    });
  }

  close() {
    if (!this.open || this.animating) return;
    this.animating = true;
    this.root?.classList.remove('open');
    setTimeout(() => {
      this.root?.classList.add('hidden');
      this.open = false;
      this.animating = false;
    }, ANIM_MS);
  }

  forceClose() {
    this.open = false;
    this.animating = false;
    this.root?.classList.remove('open');
    this.root?.classList.add('hidden');
  }

  running() {
    return this.game.running && this.game.player?.alive;
  }

  render() {
    if (!this.craftListEl) return;
    const player = this.game.player;
    this.craftListEl.innerHTML = '';
    if (!player) return;

    for (const recipe of CRAFT_RECIPES) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'wb-craft-row';
      const canCraft = canCraftRecipe(player, recipe);
      if (!canCraft) row.classList.add('wb-craft-disabled');

      const icon = document.createElement('img');
      icon.className = 'wb-craft-icon';
      icon.src = getItemIconSrc(recipe.output);
      icon.alt = '';
      icon.draggable = false;

      const text = document.createElement('div');
      text.className = 'wb-craft-text';
      text.innerHTML = `
        <span class="wb-craft-name">${getRecipeLabel(recipe)}</span>
        <span class="wb-craft-cost">${formatRecipeCosts(recipe.costs)}</span>
      `;

      row.appendChild(icon);
      row.appendChild(text);
      row.addEventListener('click', () => {
        if (!canCraftRecipe(player, recipe)) {
          this.game.items?.setPickupMsg?.('Missing materials or space', { error: true });
          return;
        }
        if (!craftRecipe(player, recipe)) {
          this.game.items?.setPickupMsg?.('Craft failed', { error: true });
          return;
        }
        this.game.audio?.inventoryPlace();
        this.game.items?.setPickupMsg?.(`Crafted ${getRecipeLabel(recipe)}`);
        this.render();
      });
      this.craftListEl.appendChild(row);
    }
  }
}
