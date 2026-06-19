import { gsap } from 'gsap';

/**
 * Hero load timeline (DESIGN.md §6): eyebrow → headline → sub → CTAs → card
 * stagger in (small y), then allocation bars fill, the edge number ticks up once
 * to +47.8 and locks, the settle seal-check draws in. Starts when the card
 * enters view (IntersectionObserver), with a timeout fallback.
 *
 * The initial hidden state is applied via the `.anim` class (set in <head> only
 * when JS is on AND motion is allowed), so no-JS and reduced-motion render the
 * FINAL state with no flash. If reduced motion is on, this module is a no-op.
 */
const prefersReduced = window.matchMedia(
  '(prefers-reduced-motion: reduce)',
).matches;

function buildTimeline(hero: HTMLElement): void {
  const items = gsap.utils.toArray<HTMLElement>('[data-anim]', hero);
  const bars = gsap.utils.toArray<HTMLElement>('.rc-bar__fill', hero);
  const edge = hero.querySelector<HTMLElement>('.rc__edge-val');
  const check = hero.querySelector<SVGPathElement>('.seal-check');

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  tl.from(items, { opacity: 0, y: 16, duration: 0.6, stagger: 0.11 });

  if (bars.length) {
    tl.fromTo(
      bars,
      { width: '0%' },
      {
        width: (_i, t: HTMLElement) =>
          t.style.getPropertyValue('--pct') || '0%',
        duration: 1.1,
        stagger: 0.08,
      },
      '-=0.15',
    );
  }

  if (edge) {
    const target = parseFloat(edge.dataset.countTo ?? '0');
    const counter = { v: 0 };
    edge.textContent = '+0.0';
    tl.to(
      counter,
      {
        v: target,
        duration: 0.9,
        ease: 'power2.out',
        onUpdate: () => {
          edge.textContent = `+${counter.v.toFixed(1)}`;
        },
        onComplete: () => {
          edge.textContent = `+${target.toFixed(1)}`;
        },
      },
      '<',
    );
  }

  if (check) {
    const len = check.getTotalLength();
    gsap.set(check, { strokeDasharray: len, strokeDashoffset: len });
    tl.to(check, { strokeDashoffset: 0, duration: 0.5 }, '-=0.3');
  }
}

function init(): void {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero || prefersReduced) return;

  const card = hero.querySelector<HTMLElement>('.rc') ?? hero;
  let started = false;
  const start = (): void => {
    if (started) return;
    started = true;
    buildTimeline(hero);
  };

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            start();
            io.disconnect();
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(card);
    window.setTimeout(start, 1200); // fallback
  } else {
    start();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
