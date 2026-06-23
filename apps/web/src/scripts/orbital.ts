/**
 * How-it-works step driver. Advances the radar (`[data-orb]`) through its four
 * states (Quote / Compare / Split / Settle) and keeps the step list in sync.
 *
 * Default: a smooth auto-stepper that only runs while the section is on screen.
 * Hovering (or focusing) a step takes over and shows that step, releasing back
 * to auto on leave. prefers-reduced-motion: no stepper, no animation; the radar
 * holds its informative static Compare state (step 2, the SSR default). Plain
 * DOM, no libraries.
 */
function init(): void {
  const section = document.querySelector<HTMLElement>('#how-it-works');
  const orb = section?.querySelector<HTMLElement>('[data-orb]');
  if (!section || !orb) return;

  const triggers = Array.from(
    section.querySelectorAll<HTMLElement>('[data-step-trigger]'),
  );

  const setStep = (n: number): void => {
    orb.setAttribute('data-step', String(n));
    for (const t of triggers) {
      t.classList.toggle('how__step--on', Number(t.dataset.stepTrigger) === n);
    }
  };

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    setStep(2); // static, informative Compare state
    return;
  }

  let current = 1;
  let hovering = false;
  let timer = 0;

  const advance = (): void => {
    if (hovering) return;
    current = current >= 4 ? 1 : current + 1;
    setStep(current);
  };
  const start = (): void => {
    if (!timer) timer = window.setInterval(advance, 2800);
  };
  const stop = (): void => {
    if (timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  };

  for (const t of triggers) {
    const n = Number(t.dataset.stepTrigger);
    const take = (): void => {
      hovering = true;
      current = n;
      setStep(n);
    };
    const release = (): void => {
      hovering = false;
    };
    t.addEventListener('pointerenter', take);
    t.addEventListener('focusin', take);
    t.addEventListener('pointerleave', release);
    t.addEventListener('focusout', release);
  }

  setStep(1);
  // Run the stepper only while the section is visible.
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) start();
        else stop();
      }
    },
    { threshold: 0.25 },
  );
  io.observe(section);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
