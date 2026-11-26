// Cinematography for any scene whose camera the AI left still: a shot rhythm that follows the spoken phrases
// (wide -> medium -> close, alternating between people like shot / reverse-shot), eased moves with a slow push inside
// every shot, and a small handheld drift so the frame is never frozen. Pure function of scene time.
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const sm = (u) => { u = cl(u, 0, 1); return u * u * (3 - 2 * u); };
const SIZES = [1.0, 1.35, 1.7, 1.2, 1.55, 1.1];     // wide, medium, close, medium-wide, close-medium, wide-ish
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** Shot boundaries for a scene: one per caption phrase, split further when a phrase runs longer than 3.2 s. */
export function shotsFor(caps, dur) {
  const cuts = [0];
  for (const c of (caps || [])) {
    if (!c || !Number.isFinite(+c.from)) continue;
    const a = +c.from, b = Math.min(dur, Number.isFinite(+c.to) ? +c.to : a + 2);
    if (a > cuts[cuts.length - 1] + .9) cuts.push(a);
    const parts = Math.max(1, Math.ceil((b - a) / 3.2));
    for (let q = 1; q < parts; q++) cuts.push(a + (b - a) * q / parts);
  }
  if (cuts.length < 2) for (let t = 2.6; t < dur - 1; t += 2.6) cuts.push(t);
  const out = [];
  cuts.sort((x, y) => x - y).forEach((t, i) => out.push({ t0: t, t1: cuts[i + 1] == null ? Math.max(dur, t + .5) : cuts[i + 1], i }));
  return out;
}

/**
 * base: the camera the app computed {z,x,y,r}. people: [{k,x,hw}]. Returns the adjusted camera.
 * lens: 'close' keeps portrait close-ups a little looser.
 */
export function cinema(sc, T, dur, base, people, o = {}) {
  const shots = sc._cinShots || (sc._cinShots = shotsFor(sc.captions, dur));
  let i = 0; while (i < shots.length - 1 && T >= shots[i + 1].t0) i++;
  const sh = shots[i], u = cl((T - sh.t0) / Math.max(.4, sh.t1 - sh.t0), 0, 1);
  const seed = (sc._cinSeed == null ? (sc._cinSeed = hash((sc.duration || 1) * 3.7 + (sc.captions ? sc.captions.length : 0))) : sc._cinSeed);
  const pick = (j) => SIZES[Math.floor(hash(j * 2.3 + seed * 9) * SIZES.length)];
  const n = people.length;
  const size = (j) => (j === 0 ? Math.min(pick(0), 1.2) : pick(j + 1));        // open on a wider shot
  const target = (j) => {
    if (!n) return { x: base.x, z: size(j) };
    if (n === 1) return { x: people[0].x, z: size(j) };
    const who = people[j % n];
    return j % 3 === 2 ? { x: people.reduce((s, p) => s + p.x, 0) / n, z: Math.min(1.25, size(j)) } : { x: who.x, z: size(j) };
  };
  const cur = target(sh.i), prev = i > 0 ? target(shots[i - 1].i) : cur;
  const k = i > 0 ? sm((T - sh.t0) / .32) : 1;                                   // quick eased cut-move
  let z = (prev.z + (cur.z - prev.z) * k) * (1 + .07 * sm(u));                   // slow push-in inside the shot
  let x = prev.x + (cur.x - prev.x) * k;
  const w = o.fw || 1600;
  x += Math.sin(T * .8 + seed * 6) * 6 / z; const dy = Math.sin(T * .6 + seed * 3) * 5 / z;
  if (o.portrait) { z = Math.max(z, n > 1 ? 1.3 : 1.45); }   // tall frame: keep people big, never tiny at the bottom
  z = cl(z, 1, o.portrait ? 1.55 : 2.2);
  return { z, x, y: base.y + dy + (o.portrait ? 190 / z : 0), r: base.r + Math.sin(T * .5 + seed * 2) * .35, w };
}

export function cinemaRule() {
  return `CAMERA (the app cuts and moves the camera to the words by itself, so do not leave it still): if you write camera, change it with every phrase (wide, then medium on the speaker, then a close-up on the emotional line), and put each person where the camera will find them.`;
}
