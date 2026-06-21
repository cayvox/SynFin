import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Proof bento enter animations (DESIGN.md §9): when the RouterCard enters view
 * its allocation bars fill once (warm-white) and the edge "+47.8" counts up once
 * and locks; the edge-stat card's "+47.8" likewise. Tabular - no layout shift.
 *
 * Progressive enhancement: bars are full and the numbers read "+47.8" by default
 * (CSS / DOM). Only when motion is allowed do we set the pre-state (bars 0,
 * number 0) - and only for below-the-fold cards, so there is no first-paint
 * flash - then fill/count on enter and clear. No JS / reduced motion → final.
 */
function init(): void {
  const prefersReduced = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  if (prefersReduced) return; // bars full, numbers "+47.8" by default

  const bars = gsap.utils.toArray<HTMLElement>('.rc-bar__fill');
  const counters = gsap.utils.toArray<HTMLElement>('[data-count-to]');
  if (!bars.length && !counters.length) return;

  gsap.registerPlugin(ScrollTrigger);

  const routerCard = document.querySelector<HTMLElement>('.cell--router');
  if (bars.length && routerCard) {
    gsap.set(bars, { width: 0 });
    ScrollTrigger.create({
      trigger: routerCard,
      start: 'top 82%',
      once: true,
      onEnter: () => {
        gsap.to(bars, {
          width: (_i, t: HTMLElement) => t.style.getPropertyValue('--pct'),
          duration: 1,
          ease: 'power3.out',
          stagger: 0.08,
          onComplete: () => gsap.set(bars, { clearProps: 'width' }),
        });
      },
    });
  }

  for (const el of counters) {
    const target = parseFloat(el.dataset.countTo ?? '0');
    const card = el.closest<HTMLElement>('.cell') ?? el;
    el.textContent = '+0.0';
    const counter = { v: 0 };
    ScrollTrigger.create({
      trigger: card,
      start: 'top 82%',
      once: true,
      onEnter: () => {
        gsap.to(counter, {
          v: target,
          duration: 0.9,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = `+${counter.v.toFixed(1)}`;
          },
          onComplete: () => {
            el.textContent = `+${target.toFixed(1)}`;
          },
        });
      },
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
