import { gsap } from 'gsap';

/**
 * Hero load timeline (DESIGN.md §9): eyebrow → headline → sub → CTAs → nodes +
 * convergence fade in → routing lines draw (stroke-dashoffset) → a faint ember
 * "flow" pulse along the route. Plus a subtle pointer parallax on the
 * constellation.
 *
 * Progressive enhancement (the #15 lesson): content is visible by DEFAULT. The
 * hidden pre-state lives only under `.is-animatable`, which an inline <head>
 * snippet adds to <html> before first paint — but ONLY when JS is on and motion
 * is allowed (so no-JS / reduced-motion render the final state with no flash),
 * with a failsafe that reveals even if this module never loads. Here we animate
 * to the visible state, then `clearProps` and remove the class. If reduced
 * motion is on, this is a no-op.
 */
const prefersReduced = window.matchMedia(
  '(prefers-reduced-motion: reduce)',
).matches;

const reveal = (): void =>
  document.documentElement.classList.remove('is-animatable');

function buildTimeline(hero: HTMLElement): void {
  const eyebrow = hero.querySelector<HTMLElement>('.eyebrow');
  const headline = hero.querySelector<HTMLElement>('.hero__headline');
  const sub = hero.querySelector<HTMLElement>('.hero__sub');
  const cta = hero.querySelector<HTMLElement>('.hero__cta');
  const textItems = [eyebrow, headline, sub, cta].filter(
    (el): el is HTMLElement => el !== null,
  );
  const nodes = gsap.utils.toArray<HTMLElement>('.node, .conv', hero);
  const lines = gsap.utils.toArray<SVGPathElement>('.cx-line', hero);
  const linesSvg = hero.querySelector<SVGElement>('.lines');

  // Prepare line-draw (set per-path dash now so first paint isn't a flash —
  // the lines live under .is-animatable's hidden ancestors anyway).
  const lengths = lines.map((p) => {
    const len = p.getTotalLength();
    gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
    return len;
  });
  // Reveal the lines layer for the draw (it is hidden pre-paint under
  // .is-animatable so the fully-drawn lines never flash before the draw).
  if (linesSvg) gsap.set(linesSvg, { opacity: 1 });

  const finish = (): void => {
    // Text may carry an animated transform; nodes/conv must keep their CSS
    // centering transform, so only their opacity is cleared.
    gsap.set(textItems, { clearProps: 'opacity,transform' });
    gsap.set(nodes, { clearProps: 'opacity' });
    if (linesSvg) gsap.set(linesSvg, { clearProps: 'opacity' });
    lines.forEach((p) =>
      gsap.set(p, { clearProps: 'strokeDasharray,strokeDashoffset' }),
    );
    reveal();
  };

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    onComplete: finish,
  });

  tl.fromTo(
    textItems,
    { opacity: 0, y: 14 },
    { opacity: 1, y: 0, duration: 0.62, stagger: 0.1 },
  );
  // Opacity only — nodes/conv keep their CSS translate(-50%,-50%) centering.
  tl.fromTo(
    nodes,
    { opacity: 0 },
    { opacity: 1, duration: 0.7, stagger: 0.06 },
    '-=0.2',
  );
  tl.to(
    lines,
    { strokeDashoffset: 0, duration: 1.1, ease: 'power2.out', stagger: 0.05 },
    '-=0.5',
  );
  // Faint ember "flow" pulse along the route once the lines are drawn.
  const emberLines = lines.filter((p) =>
    p.classList.contains('cx-line--ember'),
  );
  emberLines.forEach((p, i) => {
    const len = lengths[lines.indexOf(p)] ?? 0;
    const pulse = len * 0.16;
    tl.fromTo(
      p,
      { strokeDasharray: `${pulse} ${len}`, strokeDashoffset: len, opacity: 1 },
      {
        strokeDashoffset: -len * 0.2,
        duration: 2.6,
        ease: 'sine.inOut',
        repeat: -1,
        opacity: 0.9,
      },
      i === 0 ? '>-0.2' : '<',
    );
  });
}

function parallax(hero: HTMLElement): void {
  const layer = hero.querySelector<HTMLElement>('.constellation');
  if (!layer) return;
  let raf = 0;
  hero.addEventListener('pointermove', (e) => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      const r = hero.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(layer, {
        x: dx * 14,
        y: dy * 10,
        duration: 0.6,
        ease: 'power2.out',
      });
    });
  });
}

function init(): void {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero || prefersReduced) {
    reveal();
    return;
  }

  let started = false;
  const start = (): void => {
    if (started) return;
    started = true;
    try {
      buildTimeline(hero);
      parallax(hero);
    } catch {
      reveal();
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
      { threshold: 0.15 },
    );
    io.observe(hero);
    window.setTimeout(start, 700);
  } else {
    start();
  }

  window.setTimeout(() => {
    if (!started) reveal();
  }, 2400);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
