import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {StocktakeCameraScanner} from './StocktakeCameraScanner'

const camera=vi.hoisted(()=>({
  onDecode:null as null|((text:string)=>void),
  start:vi.fn(async(..._args:unknown[])=>{}),
  stop:vi.fn(async()=>{}),
  cameras:[{id:'cam-1',label:'Built-in webcam'}] as Array<{id:string;label:string}>,
  failStart:null as null|Error,
  config:null as unknown,
}))
vi.mock('html5-qrcode',()=>({
  Html5QrcodeSupportedFormats:{CODE_128:5},
  Html5Qrcode:class{
    isScanning=false
    static getCameras=async()=>camera.cameras
    constructor(_id:string,config:unknown){camera.config=config}
    clear(){}
    async start(_source:unknown,_config:unknown,onSuccess:(text:string)=>void){
      if(camera.failStart)throw camera.failStart
      this.isScanning=true;camera.onDecode=onSuccess;await camera.start(_source,_config)
    }
    async stop(){this.isScanning=false;await camera.stop()}
  },
}))

const read=(text:string)=>act(()=>{camera.onDecode?.(text)})
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-20T08:00:00Z'));camera.failStart=null;camera.cameras=[{id:'cam-1',label:'Built-in webcam'}];camera.start.mockReset().mockResolvedValue(undefined);camera.stop.mockReset().mockResolvedValue(undefined)})
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks()})
const open=(props:Partial<Parameters<typeof StocktakeCameraScanner>[0]>={})=>{
  const onDetected=vi.fn();render(<StocktakeCameraScanner paused={false} onDetected={onDetected} {...props}/>);return onDetected
}

it('starts the camera and reads only Code 128 labels',async()=>{
  open();await waitFor(()=>expect(camera.start).toHaveBeenCalled())
  expect((camera.config as {formatsToSupport:number[]}).formatsToSupport).toEqual([5])
})
it('accepts a code only after the same value is read twice in a row',async()=>{
  const onDetected=open();await waitFor(()=>expect(camera.start).toHaveBeenCalled())
  await read('000123');expect(onDetected).not.toHaveBeenCalled()
  await read('000999');expect(onDetected).not.toHaveBeenCalled()
  await read('000999');expect(onDetected).toHaveBeenCalledTimes(1);expect(onDetected).toHaveBeenCalledWith('000999')
})
it('drops a first read that is never confirmed within a second',async()=>{
  const onDetected=open();await waitFor(()=>expect(camera.start).toHaveBeenCalled())
  await read('000123');vi.setSystemTime(new Date('2026-11-20T08:00:02Z'));await read('000123')
  expect(onDetected).not.toHaveBeenCalled()
})
it('ignores the same label for 3 seconds so one label is not counted twice',async()=>{
  const onDetected=open();await waitFor(()=>expect(camera.start).toHaveBeenCalled())
  await read('000123');await read('000123');expect(onDetected).toHaveBeenCalledTimes(1)
  await read('000123');await read('000123');expect(onDetected).toHaveBeenCalledTimes(1)
  vi.setSystemTime(new Date('2026-11-20T08:00:04Z'));await read('000123');await read('000123');expect(onDetected).toHaveBeenCalledTimes(2)
})
it('ignores reads while paused (for example while the condition pop-up is open)',async()=>{
  const onDetected=open({paused:true});await waitFor(()=>expect(camera.start).toHaveBeenCalled())
  await read('000123');await read('000123');expect(onDetected).not.toHaveBeenCalled()
})
it('rejects empty, whitespace-only and control-character reads, and trims surrounding spaces',async()=>{
  const onDetected=open();await waitFor(()=>expect(camera.start).toHaveBeenCalled())
  await read('');await read('');await read('   ');await read('   ');await read('bad\u0007code');await read('bad\u0007code');expect(onDetected).not.toHaveBeenCalled()
  await read(' 000123 ');await read(' 000123 ');expect(onDetected).toHaveBeenCalledTimes(1);expect(onDetected).toHaveBeenCalledWith('000123')
})
it('explains a blocked camera and keeps typing available',async()=>{
  camera.failStart=Object.assign(new Error('Permission denied'),{name:'NotAllowedError'});open()
  expect((await screen.findByRole('alert')).textContent).toMatch(/Camera access is blocked/i)
  expect(screen.getByRole('button',{name:'Try camera again'})).toBeTruthy()
})
it('explains when no camera is found',async()=>{
  camera.failStart=Object.assign(new Error('Requested device not found'),{name:'NotFoundError'});open()
  expect((await screen.findByRole('alert')).textContent).toMatch(/No camera was found/i)
})
it('lets staff pick another camera when several are connected',async()=>{
  camera.cameras=[{id:'cam-1',label:'Built-in webcam'},{id:'cam-2',label:'USB webcam'}];open()
  expect(await screen.findByLabelText('Camera')).toBeTruthy()
})
it('releases the camera when closed',async()=>{
  open();await waitFor(()=>expect(camera.start).toHaveBeenCalled());cleanup();await waitFor(()=>expect(camera.stop).toHaveBeenCalled())
})
it('finishes stopping the first camera before starting the newly chosen camera',async()=>{
  const events:string[]=[]
  let resolveStop!:()=>void
  camera.cameras=[{id:'cam-1',label:'Built-in webcam'},{id:'cam-2',label:'USB webcam'}]
  camera.start.mockImplementation(async()=>{events.push('start')})
  camera.stop.mockImplementation(()=>new Promise<void>(resolve=>{events.push('stop-start');resolveStop=()=>{events.push('stop-end');resolve()}}))
  open()
  const picker=await screen.findByLabelText('Camera')
  fireEvent.change(picker,{target:{value:'cam-2'}})
  await waitFor(()=>expect(events).toEqual(['start','stop-start']))
  await act(async()=>{resolveStop()})
  await waitFor(()=>expect(events).toEqual(['start','stop-start','stop-end','start']))
})
