// Service worker do Rodízio de Caronas — cuida só do "esqueleto" do app (o HTML/CSS/JS e os
// ícones), pra ele abrir rápido e continuar aparecendo mesmo sem internet. Os DADOS de verdade
// (config e viagens da planilha) NUNCA são cacheados aqui: isso já é responsabilidade do próprio
// app (ver noCacheUrl()/reconcilePendingRides() no index.html), e cachear a API por engano
// quebraria a sincronização.
//
// Estratégia: o HTML (o "documento" que abre o app) sempre tenta a REDE primeiro — só usa a cópia
// guardada se o celular estiver realmente sem internet. Isso evita o problema de ficar preso numa
// versão antiga do app mesmo depois de publicar uma atualização (antes, dependia de mudar o
// CACHE_NAME manualmente toda vez, e era fácil esquecer). Ícones/manifesto (que quase nunca
// mudam) continuam cache-primeiro, pra abrir rápido.
var CACHE_NAME = 'rodizio-caronas-shell-v2';
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

  var isPage = event.request.mode === 'navigate' ||
    (event.request.destination === 'document') ||
    url.indexOf('index.html') !== -1 ||
    url.slice(-1) === '/';

  if(isPage){
    // Rede primeiro: garante que a versão mais nova do app apareça assim que publicada,
    // sem depender de ninguém mudar CACHE_NAME ou limpar cache manualmente. Só cai pro
    // cache guardado se a rede falhar de verdade (sem internet).
    event.respondWith(
      fetch(event.request).then(function(response){
        if(response && response.ok){
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        }
        return response;
      }).catch(function(){
        return caches.match(event.request).then(function(cached){ return cached || caches.match('./index.html'); });
      })
    );
    return;
  }

  // Resto do shell (ícones, manifest): cache primeiro, atualiza em segundo plano.
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
