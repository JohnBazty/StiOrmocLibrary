import {expect,it} from 'vitest'
import {PAPER_SIZE_PRESETS,paperSizeLabel} from './paper-size-presets'

it('keeps all eight supplied paper dimensions, including A3+ and the supplied B sizes',()=>{
  expect(PAPER_SIZE_PRESETS.map(size=>size.name)).toEqual(['A4','Letter','Legal','A3','A3+','A2','B4','B3'])
  expect(PAPER_SIZE_PRESETS.find(size=>size.name==='A3+')).toMatchObject({width:329,height:483})
  expect(PAPER_SIZE_PRESETS.find(size=>size.name==='B4')).toMatchObject({width:257,height:364})
  expect(PAPER_SIZE_PRESETS.find(size=>size.name==='B3')).toMatchObject({width:364,height:515})
})
it('shows inch presets and actual custom dimensions without replacing different saved measurements',()=>{
  expect(paperSizeLabel('Letter',{width:215.9,height:279.4,dimension_unit:'mm'})).toBe('Letter · 8½ × 11 in')
  expect(paperSizeLabel('Legal',{width:8.5,height:14,dimension_unit:'in'})).toBe('Legal · 8½ × 14 in')
  expect(paperSizeLabel('Custom',{width:200,height:300,dimension_unit:'mm'})).toBe('Custom · 200 × 300 mm')
  expect(paperSizeLabel('A4',{width:200,height:300,dimension_unit:'mm'})).toBe('A4 · 200 × 300 mm')
  expect(paperSizeLabel('Long')).toBe('Long')
})
