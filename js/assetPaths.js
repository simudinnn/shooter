// Keep authored maps compatible with the former world asset folder.
export function canonicalAsset(asset) {
  if(typeof asset!=='string')return asset;
  return asset.replace(/^assets\/buildings\/walls\/((?:bars[12]|white_fence)\.png)(#[^/]+)?$/i,(_,name,brush='')=>'assets/buildings/fences/'+name+brush).replace(/^assets\/world\/([^/#]+)(#[^/]+)?$/i,(_,name,brush='')=>{
    const folder=/^fol+iage/i.test(name)?'foliage':/^floor/i.test(name)?'floor':/^hatch_/i.test(name)?'misc':null;
    return folder?'assets/buildings/'+folder+'/'+name+brush:'assets/world/'+name+brush;
  }).replace(/^(assets\/buildings\/floor\/)floor_([^/#]+)(#[^/]+)?$/i,(_,folder,name,brush='')=>folder+name+brush);
}

export const BASE_GRASS_ASSET='assets/buildings/floor/base_grass.png';
export const GRASS_OVERLAY_ASSET='assets/buildings/floor/grass.png';
export function canonicalGround(asset) {
  const path=canonicalAsset(asset);
  return !path || path===GRASS_OVERLAY_ASSET ? BASE_GRASS_ASSET : path;
}
export function floorTileLayout(image,asset) {
  const w=image.naturalWidth||image.width||16,h=image.naturalHeight||image.height||16;
  const base=canonicalAsset(asset)===BASE_GRASS_ASSET;
  const width=base?16:Math.max(16,w),height=base?16:Math.max(16,h);
  return {width,height,x:(16-width)/2,y:(16-height)/2,
    sx:base?Math.max(0,(w-16)/2):0,sy:base?Math.max(0,(h-16)/2):0,
    sw:base?Math.min(16,w):w,sh:base?Math.min(16,h):h};
}
export function drawFloorTile(ctx,image,asset,x,y) {
  const tile=floorTileLayout(image,asset);
  ctx.drawImage(image,tile.sx,tile.sy,tile.sw,tile.sh,x+tile.x,y+tile.y,tile.width,tile.height);
}

