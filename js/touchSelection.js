// Long press shares the desktop selection model without intercepting ordinary drags.
export function bindTouchSelection(root, { enabled, resolve, toggle, clear, cancelDrag }) {
  let press=null, suppressed=null;
  const stop=()=>{if(press)clearTimeout(press.timer);press=null;};
  root.addEventListener('pointerdown',event=>{
    if(!enabled() || event.pointerType!=='touch')return;
    const entry=resolve(event.target);if(!entry)return;
    event.touchMultiSelection=true;
    stop();
    const current=press={id:event.pointerId,x:event.clientX,y:event.clientY,entry,selected:entry.slot.classList.contains('item-multi-selected'),moved:false,fired:false};
    current.timer=setTimeout(()=>{
      if(press!==current||current.moved)return;
      current.fired=true;
      cancelDrag(current.id);
      toggle(current.entry);
      suppressed={slot:current.entry.slot,until:performance.now()+1000};
    },1500);
  },true);
  document.addEventListener('pointermove',event=>{
    if(!press||press.id!==event.pointerId)return;
    if(!press.moved&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>8){press.moved=true;clearTimeout(press.timer);if(!press.selected)clear();}
  },true);
  document.addEventListener('pointerup',event=>{
    if(!press||press.id!==event.pointerId)return;
    const current=press;clearTimeout(current.timer);press=null;
    if(current.fired){suppressed={slot:current.entry.slot,until:performance.now()+700};event.preventDefault();}
    else if(!current.moved)clear();
  },true);
  document.addEventListener('pointercancel',event=>{if(press?.id===event.pointerId)stop();},true);
  window.addEventListener('blur',stop);
  root.addEventListener('click',event=>{
    if(suppressed&&performance.now()<suppressed.until&&suppressed.slot.contains(event.target)){
      event.preventDefault();event.stopImmediatePropagation();suppressed=null;
    }
  },true);
}
