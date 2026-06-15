import * as THREE from 'three';

/** Flat stylized materials — no texture maps */
export function createProceduralTextures() {
  return null;
}

export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: typeof color === 'number' ? color : 0xffffff,
    roughness: opts.roughness ?? 0.82,
    metalness: opts.metalness ?? 0,
    flatShading: true,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
}

export function accentMat(color, emissive, intensity = 0.35) {
  return mat(color, { emissive, emissiveIntensity: intensity, roughness: 0.7 });
}
