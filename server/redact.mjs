// Что видит каждая сторона: без чужой руки, порядка колод, чужих капканов, чужого дара хаоса и зерна генератора.
const HIDDEN = { uid: 0, id: '?' };
const hide = arr => arr.map(() => HIDDEN);

export function redactState(st, side) {
  const o = side === 'w' ? 'b' : 'w';
  const out = {
    ...st,
    rng: 0,
    hand: { [side]: st.hand[side], [o]: hide(st.hand[o]) },
    deck: { w: hide(st.deck.w), b: hide(st.deck.b) },
    traps: st.traps.filter(t => t.owner === side),
  };
  if (st.chaos) out.chaos = { ...st.chaos, gift: { [side]: st.chaos.gift[side], [o]: st.chaos.gift[o] ? [] : null } };
  if (st.pending && st.pending.side !== side) out.pending = { k: st.pending.k, side: st.pending.side };
  return out;
}

export function redactEvents(events, side) {
  const out = [];
  for (const e of events) {
    if (e.side && e.side !== side) {
      if (e.t === 'draw') { out.push({ ...e, card: HIDDEN }); continue; }
      if (e.t === 'trapSet') continue;
      if (e.t === 'card' && e.id === 'trap') { out.push({ ...e, tg: [] }); continue; }
    }
    out.push(e);
  }
  return out;
}

export function redactAction(a, side, actor) {
  if (!a || actor === side) return a;
  if (a.k === 'c' && a.id === 'trap') return { ...a, tg: [], uid: 0 };
  if (a.k === 'c' || a.k === 'd') return { ...a, uid: 0 };
  if (a.k === 'g') return { k: 'g', id: '?' };
  return a;
}

// Зритель: обе руки и все капканы скрыты.
export function redactSpectator(st) {
  const out = { ...redactState(st, 'w'), hand: { w: hide(st.hand.w), b: hide(st.hand.b) }, traps: [] };
  if (st.chaos) out.chaos = { ...st.chaos, gift: { w: st.chaos.gift.w ? [] : null, b: st.chaos.gift.b ? [] : null } };
  if (st.pending) out.pending = { k: st.pending.k, side: st.pending.side };
  return out;
}
