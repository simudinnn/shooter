import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function scanMapAssets(root) {
  const catalog = { tiles: [], props: [], loot: [] };
  async function scan(folder, classify) {
    for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
      const path = folder + '/' + entry.name;
      if (entry.isDirectory()) await scan(path, classify);
      else if (entry.isFile() && /\.png$/i.test(path)) {
        const layer = classify(path);
        if (layer) catalog[layer].push(path);
      }
    }
  }
  await Promise.all([
    scan('assets/world', (path) => /\/floor/i.test(path) ? 'tiles' : /fol+iage|foli+age|hatch_closed/i.test(path) ? 'props' : null),
    scan('assets/buildings', (path) => /\/floor\//i.test(path) ? 'tiles'
      : /\/(walls|windows|doors|misc|chests|foliage|folliage)\//i.test(path) ? 'props' : null),
    scan('assets/items', () => 'loot'),
  ]);
  for (const assets of Object.values(catalog)) assets.sort();
  return catalog;
}
