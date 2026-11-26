import { TILE } from './worldGen.js';
export const PLACEABLE_TOOLS=['barbed_wire','gas_bottle','mine'];
export function nearestPackChest(chests,x,z,range=30){let best=null;for(const chest of chests??[]){if(!chest.slots?.some(item=>item?.kind==='material'&&item.key?.endsWith('_pack')))continue;const distance=Math.hypot(chest.x-x,chest.z-z);if(distance<range*TILE&&(!best||distance<best.distance))best={chest,distance,distanceMetres:distance/TILE};}return best;}
export function segmentDistance(x,z,ax,az,bx,bz){const dx=bx-ax,dz=bz-az;const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-ax-t*dx,z-az-t*dz);}
