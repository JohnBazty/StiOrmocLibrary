import {useEffect,useState} from 'react'
import {Button,SectionCard} from '../../components/ui'
import {notificationApi} from './notification-api'

export function DeviceNotifications(){
 const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false)
 const supported=typeof window!=='undefined'&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window
 useEffect(()=>{let active=true;if(supported)void navigator.serviceWorker.getRegistration('/').then(async r=>{const sub=await r?.pushManager.getSubscription();const status=sub?await notificationApi.pushStatus(sub.endpoint):{enabled:false};if(active){setEnabled(status.enabled);setReady(true)}}).catch(()=>{if(active)setReady(true)});return()=>{active=false}},[supported])
 async function toggle(){setBusy(true);setError('');try{
  if(enabled){const r=await navigator.serviceWorker.getRegistration('/');const sub=await r?.pushManager.getSubscription();if(sub){await notificationApi.disablePush(sub.endpoint);await sub.unsubscribe()}setEnabled(false);return}
  if(await Notification.requestPermission()!=='granted')throw new Error('Notifications are blocked. Allow them in browser settings, then try again.')
  const {publicKey}=await notificationApi.pushConfiguration();if(!publicKey)throw new Error('Device notifications are not available yet. Your library inbox still works.')
  await navigator.serviceWorker.register('/push-worker.js',{scope:'/'})
  const registration=await navigator.serviceWorker.ready
  const key=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))
  const sub=await registration.pushManager.getSubscription()??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key})
  await notificationApi.enablePush(sub.endpoint);setEnabled(true)
 }catch(e){setError(e instanceof Error?e.message:'Device notifications could not be updated.')}finally{setBusy(false)}}
 return <SectionCard className="mb-5 space-y-3 p-5"><h2 className="text-balance font-bold">Announcements on this device</h2><p className="text-pretty text-sm opacity-80">Receive a private announcement alert even when this page is closed. Internet and browser permission are required. On iPhone or iPad, add this website to your Home Screen first. Browser and device settings can delay delivery.</p>{supported?<Button variant="secondary" disabled={busy||!ready} onClick={()=>void toggle()}>{busy?'Updating…':enabled?'Turn off device alerts':'Enable device alerts'}</Button>:<p className="text-sm">This browser does not support device alerts. Read announcements in your inbox.</p>}{enabled?<p role="status" data-tone="success" className="text-sm">Device permission enabled. Alerts follow the account that last enabled them here.</p>:null}{error?<p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p>:null}</SectionCard>
}
