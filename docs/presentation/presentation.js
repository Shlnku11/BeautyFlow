(() => {
  const slides = Array.from(document.querySelectorAll('.slide'));
  const previousButton = document.getElementById('previous-slide');
  const nextButton = document.getElementById('next-slide');
  const themeButton = document.getElementById('theme-toggle');
  const fullscreenButton = document.getElementById('fullscreen-toggle');
  const numberOutput = document.getElementById('slide-number');
  const totalOutput = document.getElementById('slide-total');
  const titleOutput = document.getElementById('slide-title');
  const progressTrack = document.getElementById('progress-track');
  const progressFill = document.getElementById('progress-fill');
  const liveRegion = document.getElementById('slide-live-region');
  const dotsContainer = document.getElementById('slide-dots');
  const preferredColorScheme = window.matchMedia('(prefers-color-scheme: light)');
  const printMode = new URLSearchParams(window.location.search).has('print-pdf');
  let currentIndex = 0;

  function slideFromHash() {
    const match = window.location.hash.match(/^#slide-(\d+)$/);
    if (!match) return 0;
    return Math.min(slides.length - 1, Math.max(0, Number(match[1]) - 1));
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').setAttribute('content', theme === 'light' ? '#fcf9fc' : '#201b21');
    themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
    themeButton.setAttribute('aria-label', theme === 'dark' ? 'Включена тёмная тема. Переключить на светлую' : 'Включена светлая тема. Переключить на тёмную');
    themeButton.title = theme === 'dark' ? 'Сменить на светлую тему (T)' : 'Сменить на тёмную тему (T)';
    document.querySelectorAll('[data-theme-image]').forEach((image) => {
      const lightSource = image.closest('picture')?.querySelector('[data-theme-source="light"]');
      if (lightSource) lightSource.media = theme === 'light' ? 'all' : 'not all';
      image.src = image.dataset[theme];
      image.alt = image.alt.replace(/тёмной|светлой/gi, theme === 'light' ? 'светлой' : 'тёмной');
      if (printMode) image.loading = 'eager';
    });
  }

  function updateControls() {
    const slide = slides[currentIndex];
    const displayNumber = String(currentIndex + 1).padStart(2, '0');
    numberOutput.textContent = displayNumber;
    titleOutput.textContent = slide.dataset.title || '';
    previousButton.disabled = currentIndex === 0;
    nextButton.disabled = currentIndex === slides.length - 1;
    progressTrack.setAttribute('aria-valuemax', String(slides.length));
    progressTrack.setAttribute('aria-valuenow', String(currentIndex + 1));
    progressFill.style.width = String(((currentIndex + 1) / slides.length) * 100) + '%';
    liveRegion.textContent = 'Слайд ' + (currentIndex + 1) + ' из ' + slides.length + ': ' + (slide.dataset.title || '');
    Array.from(dotsContainer.children).forEach((dot, index) => {
      if (index === currentIndex) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  }

  function goToSlide(index, options) {
    const target = Math.max(0, Math.min(slides.length - 1, index));
    if (target === currentIndex && slides[target].classList.contains('is-active')) return;
    currentIndex = target;
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === currentIndex;
      slide.classList.toggle('is-active', active);
      slide.classList.toggle('is-past', slideIndex < currentIndex);
      slide.inert = !active;
      slide.setAttribute('aria-hidden', String(!active));
    });
    updateControls();
    if (!options || options.updateHash !== false) {
      const hash = '#slide-' + (currentIndex + 1);
      if (window.location.hash !== hash) {
        try { window.history.pushState({ beautyFlowSlide: currentIndex }, '', hash); }
        catch { window.location.hash = hash; }
      }
    }
    if (options && options.focus) document.getElementById('presentation-stage').focus({ preventScroll: true });
  }

  slides.forEach((slide, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'slide-dot';
    dot.setAttribute('aria-label', 'Перейти к слайду ' + (index + 1) + ': ' + (slide.dataset.title || ''));
    dot.addEventListener('click', () => goToSlide(index));
    dotsContainer.append(dot);
  });
  totalOutput.textContent = String(slides.length).padStart(2, '0');

  previousButton.addEventListener('click', () => goToSlide(currentIndex - 1));
  nextButton.addEventListener('click', () => goToSlide(currentIndex + 1));
  document.querySelectorAll('[data-next]').forEach((button) => button.addEventListener('click', () => goToSlide(currentIndex + 1)));
  document.querySelectorAll('[data-restart]').forEach((button) => button.addEventListener('click', () => goToSlide(0)));

  themeButton.addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  preferredColorScheme.addEventListener('change', (event) => {
    setTheme(event.matches ? 'light' : 'dark');
  });

  fullscreenButton.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      fullscreenButton.title = 'Полноэкранный режим недоступен в этом браузере';
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const active = Boolean(document.fullscreenElement);
    fullscreenButton.setAttribute('aria-pressed', String(active));
    fullscreenButton.setAttribute('aria-label', active ? 'Выйти из полноэкранного режима' : 'Включить полноэкранный режим');
    fullscreenButton.title = active ? 'Выйти из полного экрана (Esc)' : 'Полный экран (F)';
  });

  window.addEventListener('popstate', () => goToSlide(slideFromHash(), { updateHash: false }));
  window.addEventListener('hashchange', () => goToSlide(slideFromHash(), { updateHash: false }));

  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(event.key)) {
      event.preventDefault();
      goToSlide(currentIndex + 1);
    } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(event.key)) {
      event.preventDefault();
      goToSlide(currentIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      goToSlide(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      goToSlide(slides.length - 1);
    } else if (event.key.toLowerCase() === 't') {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    } else if (event.key.toLowerCase() === 'f') {
      fullscreenButton.click();
    }
  });

  const stage = document.getElementById('presentation-stage');
  let pointerStart = null;
  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || event.target.closest('a, button')) return;
    pointerStart = { x: event.clientX, y: event.clientY };
  }, { passive: true });
  stage.addEventListener('pointerup', (event) => {
    if (!pointerStart) return;
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(deltaX) > 64 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) goToSlide(currentIndex + (deltaX < 0 ? 1 : -1));
  }, { passive: true });
  stage.addEventListener('pointercancel', () => { pointerStart = null; }, { passive: true });

  setTheme(preferredColorScheme.matches ? 'light' : 'dark');
  currentIndex = slideFromHash();
  slides.forEach((slide, index) => {
    const active = index === currentIndex;
    slide.classList.toggle('is-active', active);
    slide.classList.toggle('is-past', index < currentIndex);
    slide.inert = !active;
    slide.setAttribute('aria-hidden', String(!active));
  });
  updateControls();

  if (printMode) {
    document.documentElement.classList.add('print-pdf');
    slides.forEach((slide) => { slide.inert = false; });
    document.querySelectorAll('[data-theme-image]').forEach((image) => { image.loading = 'eager'; });
  }

  const ready = Promise.all([
    document.fonts ? document.fonts.ready.catch(() => undefined) : Promise.resolve(),
    printMode ? Promise.all(Array.from(document.querySelectorAll('[data-theme-image]'), (image) => image.decode().catch(() => undefined))) : Promise.resolve()
  ]);
  ready.then(() => { window.BeautyFlowDeckReady = true; });
})();
