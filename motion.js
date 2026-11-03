(() => {
  'use strict';

  const initialise = () => {
    const page = document.documentElement;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const shouldReduceMotion = () => page.dataset.siteMotion !== 'always' && reducedMotion.matches;
    const releaseBoot = () => {
      clearTimeout(window.cosmoMotionFallback);
      delete window.cosmoMotionFallback;
      page.classList.remove('motion-boot');
    };

    // Without motion support the original content remains immediately readable.
    if (shouldReduceMotion() || !('IntersectionObserver' in window)) {
      releaseBoot();
      page.classList.remove('motion-ready');
      return;
    }

    const definitions = [
      ['.spec-strip', ':scope > div', 75],
      ['.hero-stage', '.scene-switcher, .interface-frame, .hero-watermark, .hero-target, .hero-effects, .stage-caption', 80],
      ['.section-heading', '.section-kicker, h2, p', 85],
      ['.feature-card', ':scope > .card-top, :scope > h3, :scope > p, .hud-playground, .hud-toolbar, .visual-preview, .visual-controls, .cosmetic-text, .character-stage, .benefit-visual, .marker-demo, .config-demo, .watermark-demo', 55],
      ['#comparison', null, 0],
      ['.showcase-copy', ':scope > .section-kicker, h2, p, .plain-features, .button', 75],
      ['.showcase-scene', '.showcase-gui, .showcase-score, .showcase-boss', 100],
      ['.ad-intro', ':scope > *', 65],
      ['.ad-layout', ':scope > .ad-panel, .ad-side > .ad-panel', 100],
      ['.faq-intro', ':scope > *', 75],
      ['.faq-list', ':scope > details', 65],
      ['.final-cta', '.cta-copy, .cta-character', 90],
    ];

    const groups = new Map();
    const owners = new WeakMap();
    const duration = 1350;
    definitions.forEach(([selector, itemSelector, step]) => {
      document.querySelectorAll(selector).forEach((root) => {
        const items = itemSelector ? [...root.querySelectorAll(itemSelector)] : [root];
        if (!items.length) return;
        const group = { root, items, step, started: false, settled: false, timer: null };
        root.setAttribute('data-motion-group', '');
        items.forEach((item, index) => {
          item.setAttribute('data-motion-item', '');
          item.style.setProperty('--motion-delay', `${Math.min(index * step, 320)}ms`);
          owners.set(item, group);
        });
        groups.set(root, group);
      });
    });

    const settle = (group) => {
      if (group.settled) return;
      clearTimeout(group.timer);
      group.started = true;
      group.settled = true;
      group.items.forEach((item) => item.classList.add('motion-entered', 'motion-settled'));
    };

    const reveal = (group) => {
      if (group.started) return;
      group.started = true;
      group.items.forEach((item) => item.classList.add('motion-entered'));
      const lastDelay = Math.min((group.items.length - 1) * group.step, 320);
      // Release compositor layers and restore native shadows after the entrance.
      group.timer = setTimeout(() => settle(group), duration + lastDelay + 100);
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveal(groups.get(entry.target));
        observer.unobserve(entry.target);
      });
    }, { threshold: 0, rootMargin: '0px 0px 64px 0px' });

    page.classList.add('motion-ready');
    releaseBoot();
    // Let the browser establish the blurred starting styles before revealing.
    requestAnimationFrame(() => {
      if (!shouldReduceMotion()) groups.forEach((group) => observer.observe(group.root));
    });

    // Focusing a control immediately finishes its connected group, including
    // when keyboard navigation reaches content before it scrolls into view.
    document.addEventListener('focusin', (event) => {
      const item = event.target.closest('[data-motion-item]');
      const group = item && owners.get(item);
      if (!group) return;
      settle(group);
      observer.unobserve(group.root);
    });

    reducedMotion.addEventListener('change', (event) => {
      if (!event.matches || !shouldReduceMotion()) return;
      observer.disconnect();
      groups.forEach(settle);
      page.classList.remove('motion-ready');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) groups.forEach((group) => { if (group.started) settle(group); });
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
})();
