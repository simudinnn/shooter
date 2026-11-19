export const isCash=item=>item?.kind==='material'&&item.key==='cash';
export function cashTotal(profile){return [...(profile.stash??[]),...(profile.kit?.itemSlots??[])].reduce((sum,item)=>sum+(isCash(item)?item.amount??1:0),0);}
export function changeCash(profile,delta){
 if(delta<0&&cashTotal(profile)<-delta)return false;
 if(delta>0){const slots=profile.stash??(profile.stash=[]);const stack=slots.find(isCash);if(stack)stack.amount+=delta;else {const index=slots.findIndex(item=>!item);const item={kind:'material',key:'cash',amount:delta};if(index<0)slots.push(item);else slots[index]=item;}}
 else {let left=-delta;for(const slots of [profile.stash??[],profile.kit?.itemSlots??[]])for(let i=0;i<slots.length&&left>0;i++){if(!isCash(slots[i]))continue;const take=Math.min(left,slots[i].amount);slots[i].amount-=take;left-=take;if(!slots[i].amount)slots[i]=null;}}
 profile.cash=cashTotal(profile);return true;
}
export function migrateCash(profile){if(!profile.cashItemVersion){const amount=Math.max(0,Math.floor(profile.cash??0));changeCash(profile,amount);profile.cashItemVersion=1;}profile.cash=cashTotal(profile);return profile;}
