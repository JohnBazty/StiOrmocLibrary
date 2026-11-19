/** Dimensions supplied by the owner; B sizes here follow the supplied JIS dimensions. */
export const PAPER_SIZE_PRESETS = [
  {name:'A4',width:210,height:297,label:'A4 · 210 × 297 mm'},
  {name:'Letter',width:215.9,height:279.4,label:'Letter · 8½ × 11 in'},
  {name:'Legal',width:215.9,height:355.6,label:'Legal · 8½ × 14 in'},
  {name:'A3',width:297,height:420,label:'A3 · 297 × 420 mm'},
  {name:'A3+',width:329,height:483,label:'A3+ · 329 × 483 mm'},
  {name:'A2',width:420,height:594,label:'A2 · 420 × 594 mm'},
  {name:'B4',width:257,height:364,label:'B4 · 257 × 364 mm'},
  {name:'B3',width:364,height:515,label:'B3 · 364 × 515 mm'},
] as const

export type PaperDimensions={width?:number|string|null;height?:number|string|null;dimension_unit?:'mm'|'cm'|'in'|null}
export function paperSizeLabel(name:string,dimensions:PaperDimensions={}) {
  const preset=PAPER_SIZE_PRESETS.find(item=>item.name===name)
  if(dimensions.width==null||dimensions.height==null)return preset?.label??name
  const multiplier=dimensions.dimension_unit==='in'?25.4:dimensions.dimension_unit==='cm'?10:1
  if(preset&&Math.abs(Number(dimensions.width)*multiplier-preset.width)<0.01&&Math.abs(Number(dimensions.height)*multiplier-preset.height)<0.01)return preset.label
  return `${name} · ${Number(dimensions.width)} × ${Number(dimensions.height)} ${dimensions.dimension_unit??'mm'}`
}
