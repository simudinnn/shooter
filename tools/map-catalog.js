export async function loadMapCatalog(fetcher = fetch) {
  const errors=[];
  for (const [index,url] of ['map-editor-assets.json?catalog=2','map-editor-catalog.json'].entries()) {
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),4000);
    try {
      const response=await fetcher(url,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const catalog=await response.json();
      if(catalog?.version!==2 || !['tiles','props','loot'].every(layer=>Array.isArray(catalog[layer])&&catalog[layer].every(asset=>typeof asset==='string'))
        || !catalog.tiles.length || !catalog.props.length)throw new Error('zastarjeli ili neispravan popis');
      return {catalog,fallback:index===1};
    } catch(error) { errors.push(error.message); }
    finally { clearTimeout(timeout); }
  }
  throw new Error('Paleta spriteova nije dostupna ('+errors.join('; ')+'). Pokreni npm start iz foldera igre.');
}
