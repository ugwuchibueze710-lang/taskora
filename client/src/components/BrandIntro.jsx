import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// The Taskora splash intro. Plays once per browser tab (sessionStorage, not
// localStorage -- "when Taskora is opened" means each fresh visit, not only
// the very first one ever) at the very start of app load, before anything
// else is visible. Sequence: a lit 3D "T" (real three.js geometry, not a
// flat image -- the indigo/purple/pink gradient read on it comes entirely
// from colored lights hitting a neutral material, the same trick product
// renders use for "liquid metal" looks) scales in, a white checkmark pops
// into it, then "askora" slides in next to it in the brand font to spell
// "Taskora". After a beat, the whole lockup shrinks and flies to wherever
// the real nav badge (#taskora-nav-badge) sits on screen, handing off to it
// seamlessly -- or to the top-right corner generically on pages (like
// /login) that don't render a Nav at all. Click/tap anywhere, or
// prefers-reduced-motion, skips straight to the handoff.
export default function BrandIntro() {
  const mountRef = useRef(null);
  const wrapRef = useRef(null);
  const [phase, setPhase] = useState(() => {
    try {
      if (sessionStorage.getItem('taskora_intro_seen')) return 'done';
    } catch {
      /* sessionStorage unavailable (private mode etc) -- just play it */
    }
    return 'enter';
  });
  // Mark as seen the moment it starts, not when it finishes -- a refresh
  // mid-animation shouldn't replay it either.
  useEffect(() => {
    if (phase === 'enter') {
      try {
        sessionStorage.setItem('taskora_intro_seen', '1');
      } catch {
        /* best effort only */
      }
    }
  }, [phase]);

  // Three.js scene: mounted only while the intro is actually visible.
  // Sub-phase transitions (enter -> wordmark -> hold -> exit) must NOT
  // restart the 3D scene -- only mount/teardown when the intro as a
  // whole becomes visible or finishes.
  const introVisible = phase !== 'done';

  useEffect(() => {
    if (!introVisible || !mountRef.current) return undefined;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const el = mountRef.current;
    const SIZE = 112;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 14);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(SIZE, SIZE);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const neutral = new THREE.MeshPhysicalMaterial({
      color: 0xf4f0fb,
      roughness: 0.32,
      metalness: 0.45,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
    });

    const bar = new THREE.Mesh(new RoundedBoxGeometry(6.6, 2.2, 1.3, 4, 0.5), neutral);
    bar.position.set(0, 1.9, 0);
    const stem = new THREE.Mesh(new RoundedBoxGeometry(2.2, 5.0, 1.3, 4, 0.45), neutral);
    stem.position.set(0, -0.9, 0);
    group.add(bar, stem);

    // Checkmark: two short white rounded boxes forming a V, sitting proud
    // of the T's face.
    const checkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, emissive: 0x443a55, emissiveIntensity: 0.25 });
    const checkShort = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.62, 0.5, 2, 0.28), checkMat);
    checkShort.position.set(-1.05, 0.15, 0.95);
    checkShort.rotation.z = Math.PI / 4.3;
    const checkLong = new THREE.Mesh(new RoundedBoxGeometry(3.6, 0.62, 0.5, 2, 0.28), checkMat);
    checkLong.position.set(0.55, 0.85, 0.95);
    checkLong.rotation.z = -Math.PI / 3.6;
    const checkGroup = new THREE.Group();
    checkGroup.add(checkShort, checkLong);
    checkGroup.scale.setScalar(0.0001);
    group.add(checkGroup);

    // Lighting is what actually paints the brand gradient onto the neutral
    // material: indigo from the left, magenta from the right, a thin purple
    // top-fill, plus a roaming highlight light for the "shine sweep".
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const indigo = new THREE.PointLight(0x6d35ee, 60, 40);
    indigo.position.set(-6, 2, 6);
    const magenta = new THREE.PointLight(0xec45c4, 60, 40);
    magenta.position.set(6, -1, 6);
    const purpleFill = new THREE.DirectionalLight(0x9333ea, 0.9);
    purpleFill.position.set(0, 6, 4);
    const sweep = new THREE.PointLight(0xffffff, 0, 30);
    sweep.position.set(-8, 0, 7);
    scene.add(indigo, magenta, purpleFill, sweep);

    group.scale.setScalar(0.0001);
    group.rotation.y = -1.15;

    let raf;
    const start = performance.now();
    const DUR = { form: reduceMotion ? 1 : 850, check: reduceMotion ? 1 : 420, checkStart: reduceMotion ? 0 : 520 };
    const easeOutBack = (x) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    };
    const clamp01 = (n) => Math.max(0, Math.min(1, n));

    function tick(now) {
      const t = now - start;
      const formT = clamp01(t / DUR.form);
      const formE = easeOutBack(formT);
      group.scale.setScalar(Math.max(0.0001, formE));
      group.rotation.y = -1.15 * (1 - clamp01(t / (DUR.form * 0.9)));

      const checkT = clamp01((t - DUR.checkStart) / DUR.check);
      checkGroup.scale.setScalar(Math.max(0.0001, easeOutBack(checkT)));

      indigo.intensity = 60 * clamp01(t / 400);
      magenta.intensity = 60 * clamp01(t / 400);

      // One shine sweep across the form, timed right after it settles.
      const sweepT = clamp01((t - 900) / 500);
      if (sweepT > 0 && sweepT < 1) {
        sweep.position.x = -8 + sweepT * 16;
        sweep.intensity = Math.sin(sweepT * Math.PI) * 55;
      } else {
        sweep.intensity = 0;
      }

      group.rotation.y += Math.sin(t / 900) * 0.04;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      bar.geometry.dispose();
      stem.geometry.dispose();
      checkShort.geometry.dispose();
      checkLong.geometry.dispose();
      neutral.dispose();
      checkMat.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [introVisible]);

  // Sequence the phases, and skip on click/tap or reduced motion.
  // Deliberately NOT keyed on `phase`: this schedules every timer once, up
  // front, from the moment the intro starts ('enter'). If it re-ran on each
  // phase change (e.g. depended on [phase]), the dependency change itself
  // would fire this effect's own cleanup first and clearTimeout() every
  // still-pending timer -- so only the very first one (wordmark) would ever
  // land, and the intro would freeze on that frame forever since nothing
  // would be left to fire 'hold' or 'exit'. Running this once off an empty
  // dependency array lets all the timers it scheduled actually complete.
  useEffect(() => {
    if (phase !== 'enter') return undefined;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const timers = [];
    if (reduceMotion) {
      timers.push(setTimeout(() => setPhase('exit'), 500));
    } else {
      timers.push(setTimeout(() => setPhase('wordmark'), 650));
      timers.push(setTimeout(() => setPhase('hold'), 1500));
      timers.push(setTimeout(() => setPhase('exit'), 2150));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On exit, measure where the real nav badge lives (or fall back to a
  // generic top-right spot) and animate the wrapper there. useLayoutEffect
  // so --tx/--ty/--ts land before the browser paints the transform that
  // reads them -- otherwise the first paint uses their fallback values and
  // the real coordinates would snap in a frame later instead of animating
  // smoothly from the start.
  useLayoutEffect(() => {
    if (phase !== 'exit') return undefined;
    const target = document.getElementById('taskora-nav-badge');
    const wrap = wrapRef.current;
    if (wrap) {
      const from = wrap.getBoundingClientRect();
      let toX, toY, toScale;
      if (target) {
        const to = target.getBoundingClientRect();
        toX = to.left + to.width / 2 - (from.left + from.width / 2);
        toY = to.top + to.height / 2 - (from.top + from.height / 2);
        toScale = Math.max(0.28, to.height / from.height);
      } else {
        toX = window.innerWidth - 56 - (from.left + from.width / 2);
        toY = 28 - (from.top + from.height / 2);
        toScale = 0.3;
      }
      wrap.style.setProperty('--tx', `${toX}px`);
      wrap.style.setProperty('--ty', `${toY}px`);
      wrap.style.setProperty('--ts', toScale);
    }
    const t = setTimeout(() => setPhase('done'), 650);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === 'done') return null;

  const skip = () => setPhase('exit');

  return (
    <div
      onClick={skip}
      className={`fixed inset-0 z-[999] flex items-center justify-center bg-[#faf8ff] transition-opacity duration-500 ${
        phase === 'exit' ? 'opacity-0' : 'opacity-100'
      } cursor-pointer`}
      aria-hidden="true"
    >
      <div
        ref={wrapRef}
        className="flex items-center gap-1 transition-all ease-[cubic-bezier(.5,0,.3,1)]"
        style={{
          transitionDuration: phase === 'exit' ? '650ms' : '0ms',
          transform:
            phase === 'exit'
              ? 'translate(var(--tx,0), var(--ty,0)) scale(var(--ts,0.3))'
              : 'translate(0,0) scale(1)',
        }}
      >
        <div ref={mountRef} style={{ width: 112, height: 112 }} />
        <span
          className="font-display font-semibold text-[56px] text-navy-900 -ml-1 transition-all duration-500"
          style={{
            opacity: phase === 'wordmark' || phase === 'hold' ? 1 : 0,
            transform: phase === 'wordmark' || phase === 'hold' ? 'translateX(0)' : 'translateX(-18px)',
          }}
        >
          <span className="taskora-wordmark-accent">askora</span>
        </span>
      </div>
    </div>
  );
}
