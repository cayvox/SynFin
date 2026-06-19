import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Scroll reveal (DESIGN.md §6/§9). Each `[data-reveal]` rises in once on enter.
 *
 * Progressive enhancement: content is VISIBLE by default (no CSS hides it). Only
 * when motion is allowed does this set the hidden pre-state in JS and animate it
 * in on scroll, clearing props on complete. With no JS or reduced motion the
 * elements simply stay visible. Reveal targets are below the fold, so setting
 * the pre-state on load causes no first-paint flash.
 */
function init(): void {
  const targets = gsap.utils.toArray<HTMLElement>('[data-reveal]');
  if (!targets.length) return;

  const prefersReduced = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  if (prefersReduced) return; // visible by default

  gsap.registerPlugin(ScrollTrigger);
  for (const el of targets) {
    gsap.set(el, { opacity: 0, y: 24 });
    ScrollTrigger.create({
      trigger: el,
      start: 'top 86%',
      once: true,
      onEnter: () => {
        gsap.to(el, {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: 'power3.out',
          clearProps: 'opacity,transform',
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
