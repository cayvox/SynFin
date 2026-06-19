import { gsap } from 'gsap';

/**
 * Hero load timeline (DESIGN.md §9). Snappy + atmospheric: eyebrow → headline →
 * sub → CTAs → nodes/marker fade → routing lines draw once → a faint, separate
 * ember "flow" pulse layered on top. Subtle pointer parallax on the
 * constellation (desktop, motion only).
 *
 * Progressive enhancement (QA fixes 1 & 7):
 * - The base routing lines are server-rendered COMPLETE hairlines. On load we
 *   draw them once via stroke-dashoffset, then CLEAR the dash so they rest fully
 *   drawn. The flow pulse is a SEPARATE additive overlay path — it never touches
 *   the resting base line.
 * - Content is visible by default. The hidden pre-state lives only under
 *   `.is-animatable` (set pre-paint by a guarded <head> snippet, with a failsafe
 *   reveal). We animate to visible, then clearProps + remove the class.
 * - prefers-reduced-motion (or no JS): SKIP all build-in/flow/parallax and show
 *   the FINAL state immediately — headline opacity 1, no transform, ember lines
 *   fully drawn (the server-rendered state), no parallax residue.
 */
const prefersReduced = window.matchMedia(
  '(prefers-reduced-motion: reduce)',
).matches;
const desktop = window.matchMedia('(min-width: 1024px)');

const reveal = (): void =>
  document.documentElement.classList.remove('is-animatable');

function flow(hero: HTMLElement, baseLines: SVGPathElement[]): void {
  const group = hero.querySelector<SVGGElement>('.lines__flow');
  if (!group) return;
  for (const base of baseLines) {
    const len = base.getTotalLength();
    const clone = base.cloneNode() as SVGPathElement;
    clone.setAttribute('class', 'flow');
    clone.setAttribute('stroke', 'var(--ember-hi)');
    clone.setAttribute('stroke-width', '1.1');
    clone.setAttribute('stroke-linecap', 'round');
    clone.setAttribute('vector-effect', 'non-scaling-stroke');
    clone.setAttribute('fill', 'none');
    group.appendChild(clone);
    const seg = len * 0.14;
    gsap.set(clone, {
      strokeDasharray: `${seg} ${len}`,
      strokeDashoffset: len,
      opacity: 0.55,
    });
    gsap.to(clone, {
      strokeDashoffset: -seg,
      duration: 2.8,
      ease: 'sine.inOut',
      repeat: -1,
      repeatDelay: 1.4,
      delay: 0.4 * baseLines.indexOf(base),
    });
  }
}

function buildTimeline(hero: HTMLElement): void {
  const textItems = gsap.utils.toArray<HTMLElement>(
    '.eyebrow, .hero__headline, .hero__sub, .hero__cta',
    hero,
  );
  const fadeItems = gsap.utils.toArray<HTMLElement>(
    '.node, .conv, .cx-line--dot',
    hero,
  );
  const drawLines = gsap.utils.toArray<SVGPathElement>(
    '.cx-line--ember, .cx-line--net',
    hero,
  );
  const emberBase = gsap.utils.toArray<SVGPathElement>('.cx-line--ember', hero);
  const linesSvg = hero.querySelector<SVGElement>('.lines');

  drawLines.forEach((p) => {
    const len = p.getTotalLength();
    gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
  });
  if (linesSvg) gsap.set(linesSvg, { opacity: 1 });

  const finish = (): void => {
    gsap.set(textItems, { clearProps: 'opacity,transform' });
    gsap.set(fadeItems, { clearProps: 'opacity' });
    drawLines.forEach((p) =>
      gsap.set(p, { clearProps: 'strokeDasharray,strokeDashoffset' }),
    );
    if (linesSvg) gsap.set(linesSvg, { clearProps: 'opacity' });
    reveal();
    if (desktop.matches) flow(hero, emberBase);
  };

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    onComplete: finish,
  });

  // Snappy intro (~0.7s total): the headline reaches full opacity fast.
  tl.fromTo(
    textItems,
    { opacity: 0, y: 12 },
    { opacity: 1, y: 0, duration: 0.42, stagger: 0.06 },
  );
  // Opacity only — nodes/conv keep their CSS translate(-50%,-50%) centering.
  tl.fromTo(
    fadeItems,
    { opacity: 0 },
    { opacity: 1, duration: 0.4, stagger: 0.04 },
    '-=0.28',
  );
  tl.to(
    drawLines,
    { strokeDashoffset: 0, duration: 0.7, ease: 'power2.out', stagger: 0.04 },
    '-=0.3',
  );
}

function parallax(hero: HTMLElement): void {
  const layer = hero.querySelector<HTMLElement>('.constellation');
  if (!layer || !desktop.matches) return;
  let raf = 0;
  hero.addEventListener('pointermove', (e) => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      const r = hero.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(layer, {
        x: dx * 12,
        y: dy * 9,
        duration: 0.6,
        ease: 'power2.out',
      });
    });
  });
}

function init(): void {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero) return;
  if (prefersReduced) {
    reveal(); // final, fully-drawn state (server-rendered) — no animation
    return;
  }
  try {
    buildTimeline(hero);
    parallax(hero);
  } catch {
    reveal(); // never leave the hero hidden
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
