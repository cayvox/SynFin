import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Scroll-reveal scaffolding (DESIGN.md §6) for the content sections that land in
 * a later phase. Each `[data-reveal]` (see Section.astro) rises in once on
 * enter. Under prefers-reduced-motion every element is revealed immediately and
 * no ScrollTrigger is created. Safe no-op when there are no reveal targets yet.
 */
function init(): void {
  const targets = gsap.utils.toArray<HTMLElement>('[data-reveal]');
  if (!targets.length) return;

  const prefersReduced = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;

  if (prefersReduced) {
    targets.forEach((el) => el.classList.add('is-revealed'));
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  targets.forEach((el) => {
    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      once: true,
      onEnter: () => el.classList.add('is-revealed'),
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
