// No offline response cache: authenticated library and payment pages always use the server.
self.addEventListener('push', event => {
 event.waitUntil(self.registration.showNotification('STI Library announcement', {
  body:'Open your library inbox to view current announcements.',
  icon:'/favicon.jpg',badge:'/favicon.jpg',tag:'library-announcement',
  data:{path:'/inbox'},
 }))
})
self.addEventListener('notificationclick', event => {
 event.notification.close()
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true})
  const target=windows.find(client=>new URL(client.url).origin===self.location.origin)
  if(target){await target.navigate('/inbox');await target.focus()}
  else await self.clients.openWindow('/inbox')
 })())
})
