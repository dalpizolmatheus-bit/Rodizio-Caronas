// Service worker do Rodízio de Caronas — cuida só do "esqueleto" do app (o HTML/CSS/JS e os
// ícones), pra ele abrir rápido e continuar aparecendo mesmo sem internet. Os DADOS de verdade
// (config e viagens da planilha) NUNCA são cacheados aqui: isso já é responsabilidade do próprio
// app (ver noCacheUrl()/reconcilePendingRides() no rodizio-caronas.html), e cachear a API por
// engano quebraria a sincronização. Sempre que o app for atualizado de novo, muda o CACHE_NAME
// abaixo pra forçar todo mundo a buscar a versão nova.
var CACHE_NAME = 'rodizio-caronas-shell-v1';
var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache){ return cache.addAll(APP_SHELL); })
      .catch(function(){ /* alguma URL do shell falhou (ex.: ícone renomeado) — não trava o install */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(
        names.filter(function(n){ return n !== CACHE_NAME; }).map(function(n){ return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event){
  var url = event.request.url;
  // Chamadas ao Google Apps Script (config/viagens) sempre direto na rede, nunca do cache.
  if(url.indexOf('script.google.com') !== -1) return;
  if(event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(function(cached){
      var network = fetch(event.request).then(function(response){
        if(response && response.ok){
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        }
        return response;
      }).catch(function(){ return cached; });
      return cached || network;
    })
  );
});
