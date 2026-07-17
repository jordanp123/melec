/* Network-first service worker.
   Online: every request goes to the network, so a deployed fix is picked up
   immediately, and each successful response refreshes the offline copy.
   Offline (or stalled past NETWORK_TIMEOUT_MS on marginal signal): the
   last-good copy is served from Cache Storage instead.
   NOTE: this file is served with the site's CSP header; the worker's own
   fetch() calls are governed by that policy's connect-src 'self'. */
"use strict";
var CACHE="melec-v3";
var NETWORK_TIMEOUT_MS=4000;

self.addEventListener("install",function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){return c.addAll(["/"]);})
      .then(function(){return self.skipWaiting();})
  );
});

self.addEventListener("activate",function(e){
  e.waitUntil(
    caches.keys()
      .then(function(keys){
        return Promise.all(keys.filter(function(k){return k!==CACHE;})
          .map(function(k){return caches.delete(k);}));
      })
      .then(function(){return self.clients.claim();})
  );
});

/* Abort a fetch that stalls on weak signal so the cached copy takes over
   quickly. NOTE: the timer only covers time-to-first-byte — once headers
   arrive, the body streams on the browser's own (much longer) timeout.
   Without AbortController the plain fetch still fails fast when fully
   offline. */
function fetchWithTimeout(req){
  if(typeof AbortController==="undefined")return fetch(req);
  var ctrl=new AbortController();
  var timer=setTimeout(function(){ctrl.abort();},NETWORK_TIMEOUT_MS);
  return fetch(req,{signal:ctrl.signal}).then(
    function(res){clearTimeout(timer);return res;},
    function(err){clearTimeout(timer);throw err;}
  );
}

self.addEventListener("fetch",function(e){
  var req=e.request;
  if(req.method!=="GET")return;
  if(new URL(req.url).origin!==self.location.origin)return;
  e.respondWith(
    fetchWithTimeout(req).then(function(res){
      /* Only full 200s: cache.put() throws on 206 partials, and errors/404s
         must never overwrite a good offline copy. The key is the URL minus
         its query string, so campaign links (/?utm=...) refresh the same
         single entry that the ignoreSearch read finds, instead of accreting
         stale variants that would shadow it. waitUntil keeps the worker
         alive until the write lands; a failed write (quota) just means the
         previous good copy stays. */
      if(res&&res.status===200){
        var copy=res.clone();
        var key=new URL(req.url);
        key.search="";
        e.waitUntil(
          caches.open(CACHE)
            .then(function(c){return c.put(key.href,copy);})
            .catch(function(){})
        );
      }
      return res;
    }).catch(function(err){
      return caches.match(req,{ignoreSearch:true}).then(function(hit){
        if(hit)return hit;
        /* Any bookmarked path still opens the tool offline. */
        if(req.mode==="navigate")return caches.match("/").then(function(shell){
          if(shell)return shell;
          throw err;
        });
        throw err;
      });
    })
  );
});
