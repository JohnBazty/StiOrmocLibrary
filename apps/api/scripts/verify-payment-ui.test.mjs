import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {once} from 'node:events'
import {fileURLToPath} from 'node:url'
import {test} from 'node:test'

const root=fileURLToPath(new URL('../../../',import.meta.url))
const origin='http://127.0.0.1:47145'

// Run --phase6 acceptance first to generate the ignored synthetic report JSON files.
test('payment UI fixture serves each actual report without substituting fine records', {timeout:45000}, async()=>{
  // Refuse to attach to or stop another session's servers.
  for(const port of [47145,5174]){
    const probe=createServer()
    probe.listen(port,'127.0.0.1')
    await once(probe,'listening')
    await new Promise(resolve=>probe.close(resolve))
  }
  const child=spawn(process.execPath,['apps/api/scripts/verify-payment-ui.mjs'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']})
  let started=false
  try{
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Payment fixture did not start.')),20000)
      child.once('error',error=>{clearTimeout(timeout);reject(error)})
      child.once('exit',()=>{clearTimeout(timeout);reject(new Error('Payment fixture exited before readiness.'))})
      child.stdout.on('data',chunk=>{
        if(chunk.toString().includes('Disposable payment UI at')){clearTimeout(timeout);started=true;resolve()}
      })
    })
    for(const kind of ['payments','printRevenue','onlinePayments']){
      const response=await fetch(origin+'/api/v1/admin/reports?kind='+kind,{signal:AbortSignal.timeout(5000)})
      assert.equal(response.status,200)
      const body=await response.json()
      assert.equal(body.success,true)
      assert.equal(body.data.kind,kind,'Fixture must not substitute another report')
      if(kind==='onlinePayments'){
        assert.ok(body.data.metrics.captured_needing_review>0)
        assert.ok(body.data.rows.some(row=>row.status==='Review'&&row.provider_reference))
      }
    }
    const unsupported=await fetch(origin+'/api/v1/admin/reports?kind=attendance',{signal:AbortSignal.timeout(5000)})
    assert.equal(unsupported.status,400)
  }finally{
    if(child.exitCode===null&&child.signalCode===null){
      const exited=once(child,'exit',{signal:AbortSignal.timeout(10000)})
      if(started){
        try{await fetch(origin+'/qa/stop',{method:'POST',signal:AbortSignal.timeout(5000)})}
        catch{child.kill()}
      }else child.kill()
      await exited
    }
  }
})
