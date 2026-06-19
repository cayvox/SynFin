import { gsap } from 'gsap';

/**
 * Hero load timeline (DESIGN.md §6): eyebrow → headline → sub → CTAs → card
 * stagger in (small y), then allocation bars fill, the edge number ticks up once
 * to +47.8 and locks, the settle seal-check draws in.
 *
 * Progressive enhancement (the whole point): the hero is fully visible by
 * default. The hidden pre-animation state lives ONLY under `.is-animatable`,
 * which this module adds to the hero root — and only after GSAP has loaded and
 * motion is allowed. We animate TO the visible state, then `clearProps` and
 * remove the class so elements rest in their natural CSS state. If GSAP never
 * loads, motion is reduced, or anything throws, the class is never added (or is
 * removed), so the hero simply renders its final, visible state. No content is
 * hidden behind JS that might not run.
 */
const prefersReduced = window.matchMedia(
  '(prefers-reduced-motion: reduce)',
).matches;

function buildTimeline(hero: HTMLElement): void {
  const items = gsap.utils.toArray<HTMLElement>('[data-anim]', hero);
  const bars = gsap.utils.toArray<HTMLElement>('.rc-bar__fill', hero);
  const edge = hero.querySelector<HTMLElement>('.rc__edge-val');
  const check = hero.querySelector<SVGPathElement>('.seal-check');

  const finish = (): void => {
    gsap.set([...items, ...bars], {
      clearProps: 'opacity,transform,width',
    });
    if (edge)
      edge.textContent = `+${parseFloat(edge.dataset.countTo ?? '0').toFixed(1)}`;
    if (check)
      gsap.set(check, { clearProps: 'strokeDasharray,strokeDashoffset' });
    hero.classList.remove('is-animatable');
  };

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    onComplete: finish,
  });

  tl.fromTo(
    items,
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, duration: 0.6, stagger: 0.11 },
  );

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
  if (!hero || prefersReduced) return; // final visible state stands

  const reveal = (): void => hero.classList.remove('is-animatable');
  hero.classList.add('is-animatable');

  const card = hero.querySelector<HTMLElement>('.rc') ?? hero;
  let started = false;
  const start = (): void => {
    if (started) return;
    started = true;
    try {
      buildTimeline(hero);
    } catch {
      reveal(); // never leave the hero hidden
    }
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
      { threshold: 0.2 },
    );
    io.observe(card);
    window.setTimeout(start, 800); // fallback if IO never fires
  } else {
    start();
  }

  // Hard safety net: if the timeline never started, reveal anyway.
  window.setTimeout(() => {
    if (!started) reveal();
  }, 2500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
