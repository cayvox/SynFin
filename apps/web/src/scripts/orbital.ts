import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * §3 orbital entrance (DESIGN.md §12): on scroll-in the rings fade, the meter
 * arc draws while "+47.8" counts up once and locks, the ember route lines draw
 * from the core outward, and the venue nodes fade/scale in staggered; the bezel
 * may rotate very slowly. Progressive enhancement: everything is VISIBLE by
 * default (arc + lines fully drawn, nodes shown, "+47.8" in the DOM). Only when
 * motion is allowed do we set the pre-state and animate; the orbital is below
 * the fold so there is no first-paint flash. No JS / reduced motion → final.
 */
function init(): void {
  const orb = document.querySelector<HTMLElement>('#how-it-works .orb');
  if (!orb) return;

  const prefersReduced = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  if (prefersReduced) return; // final, fully-drawn state by default

  gsap.registerPlugin(ScrollTrigger);

  const rings = gsap.utils.toArray<SVGElement>('.orb-ring, .orb-scan', orb);
  const draws = gsap.utils.toArray<SVGPathElement>('.orb-route, .orb-arc', orb);
  const arcDot = orb.querySelector<SVGElement>('.orb-arc-dot');
  const nodes = gsap.utils.toArray<HTMLElement>(
    '[data-orb-node], .orb__share',
    orb,
  );
  const meter = orb.querySelector<HTMLElement>('.orb__meter-val');

  // Pre-state (below the fold → no flash).
  gsap.set(rings, { opacity: 0 });
  gsap.set(nodes, { opacity: 0, scale: 0.82, transformOrigin: 'center' });
  if (arcDot) gsap.set(arcDot, { opacity: 0 });
  draws.forEach((p) => {
    const len = p.getTotalLength();
    gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
  });

  const finish = (): void => {
    gsap.set(nodes, { clearProps: 'opacity,transform' });
    gsap.set(rings, { clearProps: 'opacity' });
    if (arcDot) gsap.set(arcDot, { clearProps: 'opacity' });
    draws.forEach((p) =>
      gsap.set(p, { clearProps: 'strokeDasharray,strokeDashoffset' }),
    );
    if (meter) meter.textContent = '47.8';
  };

  ScrollTrigger.create({
    trigger: orb,
    start: 'top 80%',
    once: true,
    onEnter: () => {
      const tl = gsap.timeline({
        defaults: { ease: 'power3.out' },
        onComplete: finish,
      });
      tl.to(rings, { opacity: 1, duration: 0.6, stagger: 0.05 });
      tl.to(
        draws,
        { strokeDashoffset: 0, duration: 0.9, stagger: 0.08 },
        '-=0.25',
      );
      if (arcDot) tl.to(arcDot, { opacity: 1, duration: 0.3 }, '-=0.3');
      tl.to(
        nodes,
        { opacity: 1, scale: 1, duration: 0.5, stagger: 0.06 },
        '-=0.7',
      );
      if (meter) {
        const counter = { v: 0 };
        meter.textContent = '0.0';
        tl.to(
          counter,
          {
            v: 47.8,
            duration: 0.9,
            ease: 'power2.out',
            onUpdate: () => {
              meter.textContent = counter.v.toFixed(1);
            },
            onComplete: () => {
              meter.textContent = '47.8';
            },
          },
          '<',
        );
      }
    },
  });

  // Optional slow bezel rotation (motion only).
  const bezel = orb.querySelector<SVGGElement>('.orb-bezel');
  if (bezel) {
    gsap.to(bezel, {
      rotation: 360,
      svgOrigin: '280 280',
      duration: 200,
      ease: 'none',
      repeat: -1,
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
