// src/js/main.js
// Idempotent guard: предотвращаем повторную инициализацию
if (window._manasInitialized) {
  console.warn('Manas script already initialized — skipping duplicate init.');
} else {
  window._manasInitialized = true;

  const LANG_KEY = 'manas_lang';
  let LANG = localStorage.getItem(LANG_KEY) || 'ru';

  // Определяем, находимся ли мы на странице места (url содержит /places/<slug>.html)
  const isPlacePage = /\/places\/([a-z0-9\-]+)\.html$/i.test(location.pathname);
  const placeSlugMatch = location.pathname.match(/\/places\/([a-z0-9\-]+)\.html$/i);
  const PLACE_SLUG = placeSlugMatch ? placeSlugMatch[1] : null;

  /* -------------------------
     Утилиты загрузки JSON
     ------------------------- */
  async function fetchJSON(path){
    const res = await fetch(path);
    if(!res.ok) throw new Error(`not found: ${path}`);
    return res.json();
  }

  async function loadPlaces(lang){
    try{
      return await fetchJSON(`../src/data/places.${lang}.json`);
    }catch(e){
      if(lang !== 'ru') return loadPlaces('ru');
      return [];
    }
  }

  async function loadI18n(lang){
    try{
      return await fetchJSON(`../src/data/i18n.${lang}.json`);
    }catch(e){
      if(lang !== 'ru') return loadI18n('ru');
      return {};
    }
  }

  /* -------------------------
     Рендер карточек (index)
     ------------------------- */
  function createCard(place){
    const el = document.createElement('article');
    el.className = 'card';
    el.setAttribute('role','listitem');
    el.innerHTML = `
      <div class="thumb">
        <img src="../public/assets/images/${place.image}" alt="${place.title}" loading="lazy">
      </div>
      <h3>${place.title}</h3>
      <p class="muted">${place.short}</p>
      <div class="meta">
        <a href="places/${place.slug}.html">Подробнее</a>
        <span class="kicker">${place.type || ''}</span>
      </div>
    `;
    return el;
  }

  async function renderIndex(){
    console.debug('renderIndex', LANG);
    const places = await loadPlaces(LANG);
    const list = document.getElementById('places-list');
    if(!list) return;
    // очистка контейнера перед рендером (предотвращает дубли)
    list.innerHTML = '';
    places.forEach(p => list.appendChild(createCard(p)));
    initMap(places);
  }

  /* -------------------------
     Карта (Leaflet)
     ------------------------- */
  function initMap(places) {
  const mapEl = document.getElementById('map');
  if (!mapEl || typeof L === 'undefined') return;

  // 1. Корректное удаление старой карты
  if (window._manasMap) {
    window._manasMap.remove();
    window._manasMap = null;
  }

  // 2. Инициализация карты
  // Устанавливаем начальный вид на Кыргызстан
  const map = L.map('map', {
    scrollWheelZoom: false // Совет: отключаем зум скроллом, чтобы не мешал прокрутке страницы
  }).setView([41.5, 74.5], 7); 
  
  window._manasMap = map;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  const group = L.featureGroup();
  
  places.forEach(p => {
    // Проверяем, что координаты — это числа и они не пустые
    const lat = parseFloat(p.lat);
    const lng = parseFloat(p.lng);
    
    if (!isNaN(lat) && !isNaN(lng)) {
      const marker = L.marker([lat, lng]);
      marker.bindPopup(`
        <div style="font-family: sans-serif;">
          <strong>${p.title}</strong><br>
          <span style="font-size: 0.9em; color: #666;">${p.short}</span><br>
          <a href="places/${p.slug}.html" style="color: #0b6efd; text-decoration: none; font-weight: bold;">Подробнее</a>
        </div>
      `);
      marker.addTo(group);
    }
  });

  if (group.getLayers().length) {
    group.addTo(map);
    // 3. Автоматический подбор масштаба под все точки
    map.fitBounds(group.getBounds().pad(0.2));
  }

  // 4. ГЛАВНОЕ ИСПРАВЛЕНИЕ: Ждем завершения отрисовки DOM
  setTimeout(() => {
    map.invalidateSize();
  }, 250);
}
  /* -------------------------
     i18n: статические тексты
     ------------------------- */
  let I18N = {};
  async function translateStaticTexts(){
    I18N = await loadI18n(LANG);
    document.querySelectorAll('[data-i18n]').forEach(el=>{
      const key = el.getAttribute('data-i18n');
      if(I18N[key]) el.textContent = I18N[key];
    });
  }

  /* -------------------------
     Управление языком
     ------------------------- */
  function updateActiveLangButton(){
    document.querySelectorAll('.lang').forEach(b=>{
      b.classList.toggle('active', b.dataset.lang === LANG);
    });
  }

  // Универсальная функция смены языка (вызывается из UI и мобильного меню)
  window.setLanguage = async function(newLang){
    if(!newLang) return;
    LANG = newLang;
    localStorage.setItem(LANG_KEY, LANG);
    updateActiveLangButton();
    await translateStaticTexts();
    if(isPlacePage) await renderPlacePage();
    else await renderIndex();
  };

  function setupLangSwitch(){
    document.querySelectorAll('.lang').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        const newLang = e.currentTarget.dataset.lang;
        if(!newLang) return;
        await window.setLanguage(newLang);
      });
    });
    updateActiveLangButton();
  }

  /* -------------------------
     UI: тема, плавный скролл
     ------------------------- */
  (function(){
    const root = document.documentElement;
    const key = 'manas_theme';
    const saved = localStorage.getItem(key) || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if(saved === 'dark') root.setAttribute('data-theme','dark');

    window.toggleTheme = function(){
      const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      if(next === 'dark') root.setAttribute('data-theme','dark'); else root.removeAttribute('data-theme');
      localStorage.setItem(key, next);
    };
  })();

  document.addEventListener('click', (e)=>{
    const a = e.target.closest('a[href^="#"]');
    if(!a) return;
    e.preventDefault();
    const id = a.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
  });

  /* -------------------------
     Мобильное меню и карта
     ------------------------- */
  (function(){
    if (window._manasMobileMenuInit) return;
    window._manasMobileMenuInit = true;

    const menuToggle = document.getElementById('menuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    if(menuToggle && mobileMenu){
      function toggleMenu(ev){
        ev.stopPropagation();
        const isOpen = mobileMenu.classList.toggle('open');
        menuToggle.classList.toggle('open', isOpen);
        menuToggle.setAttribute('aria-expanded', String(isOpen));
        mobileMenu.setAttribute('aria-hidden', String(!isOpen));
      }
      menuToggle.addEventListener('click', toggleMenu);

      // Закрыть меню при клике вне
      document.addEventListener('click', (e)=>{
        if(!mobileMenu.contains(e.target) && !menuToggle.contains(e.target)){
          if(mobileMenu.classList.contains('open')){
            mobileMenu.classList.remove('open');
            menuToggle.classList.remove('open');
            menuToggle.setAttribute('aria-expanded','false');
            mobileMenu.setAttribute('aria-hidden','true');
          }
        }
      });

      // Закрыть по Escape
      document.addEventListener('keydown', (e)=>{
        if(e.key === 'Escape' && mobileMenu.classList.contains('open')){
          mobileMenu.classList.remove('open');
          menuToggle.classList.remove('open');
          menuToggle.setAttribute('aria-expanded','false');
          mobileMenu.setAttribute('aria-hidden','true');
          menuToggle.focus();
        }
      });

      // Языковые кнопки в мобильном меню
      mobileMenu.querySelectorAll('.lang').forEach(btn=>{
        btn.addEventListener('click', async (ev)=>{
          const lang = ev.currentTarget.dataset.lang;
          if(!lang) return;
          if(typeof window.setLanguage === 'function'){
            await window.setLanguage(lang);
          } else {
            localStorage.setItem('manas_lang', lang);
            location.reload();
          }
          // Закрыть меню после выбора
          mobileMenu.classList.remove('open');
          menuToggle.classList.remove('open');
          menuToggle.setAttribute('aria-expanded','false');
          mobileMenu.setAttribute('aria-hidden','true');
        });
      });
    }

    // Map collapse button (создаётся динамически)
    const mapSection = document.querySelector('.map-section');
    if(mapSection){
      if(!mapSection.querySelector('.map-toggle')){
        const btn = document.createElement('button');
        btn.className = 'map-toggle';
        btn.type = 'button';
        btn.textContent = 'Свернуть карту';
        mapSection.insertBefore(btn, mapSection.querySelector('#map'));

        let collapsed = false;
        btn.addEventListener('click', ()=>{
          collapsed = !collapsed;
          if(collapsed){
            mapSection.classList.add('map-collapsed');
            btn.textContent = 'Показать карту';
          } else {
            mapSection.classList.remove('map-collapsed');
            btn.textContent = 'Свернуть карту';
            if(window._manasMap && typeof window._manasMap.invalidateSize === 'function'){
              setTimeout(()=> window._manasMap.invalidateSize(), 300);
            }
          }
        });
      }
    }
  })();

  /* -------------------------
     Инициализация приложения
     ------------------------- */
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      setupLangSwitch();
      await translateStaticTexts();
      if(isPlacePage) await renderPlacePage();
      else await renderIndex();
      console.debug('Manas app initialized');
    }catch(err){
      console.error('Initialization error', err);
    }
  });

} // end idempotent guard
