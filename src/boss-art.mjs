const TAU = Math.PI * 2;
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));

// Plates share one silhouette in sectors 1–9. All coordinates are local units.
const PLATES = [
  { c: [-.16, -.25], p: [[-.41,-.29],[-.10,-.43],[.17,-.31],[.06,-.18],[-.10,-.24],[-.10,-.08],[-.25,-.08],[-.25,-.22],[-.41,-.17]] },
  { c: [.29, -.17], p: [[.19,-.34],[.41,-.19],[.41,.015],[.28,.015],[.28,-.115],[.12,-.115]] },
  { c: [.29, .15], p: [[.355,.035],[.45,.15],[.27,.315],[.11,.315],[.11,.18],[.27,.18],[.27,.035]] },
  { c: [.015, .31], p: [[.12,.295],[.12,.455],[-.05,.40],[-.22,.25],[-.08,.16],[-.08,.31]] },
  { c: [-.28, .16], p: [[-.35,.055],[-.21,.055],[-.21,.19],[-.08,.19],[-.08,.32],[-.30,.25],[-.42,.15]] },
  { c: [-.28, -.025], p: [[-.43,-.13],[-.29,-.13],[-.29,.01],[-.12,.01],[-.12,.13],[-.38,.08]] },
  { c: [.055, -.17], p: [[-.055,-.245],[.085,-.245],[.13,-.18],[.03,-.18],[.03,-.095],[-.055,-.095]] },
  { c: [.17, .025], p: [[.17,-.065],[.235,-.065],[.235,.115],[.075,.115],[.075,.055],[.17,.055]] }
];

function polygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

function plate(ctx, points, index, flash, tint) {
  // A short, displaced back face makes each slab feel substantial without texture.
  ctx.save();
  ctx.translate(.013, .022);
  polygon(ctx, points);
  ctx.fillStyle = '#101820';
  ctx.fill();
  ctx.restore();
  polygon(ctx, points);
  ctx.fillStyle = flash > .3 ? '#78838c' : (index % 3 === 0 ? '#35414c' : '#28333e');
  ctx.fill();
  ctx.strokeStyle = '#47535e';
  ctx.lineWidth = .003;
  ctx.stroke();
  // Broad light-catching upper edge, rather than little mechanical detailing.
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  ctx.lineTo(points[1][0], points[1][1]);
  ctx.lineTo(points[2][0], points[2][1]);
  ctx.strokeStyle = flash > .1 ? '#f4e4ce' : '#c0beb0';
  ctx.lineWidth = .012;
  ctx.lineJoin = 'miter';
  ctx.stroke();
  if (flash > .02) {
    ctx.save();
    ctx.globalAlpha *= flash * .7;
    polygon(ctx, points);
    ctx.strokeStyle = tint;
    ctx.lineWidth = .007;
    ctx.stroke();
    ctx.restore();
  }
}

function frameArm(ctx, rotation, split, alpha, flash) {
  ctx.save();
  ctx.rotate(rotation);
  ctx.translate(0, -split);
  ctx.globalAlpha *= alpha;
  const p = [[-.40,-.43],[.17,-.43],[.29,-.31],[.17,-.22],[.12,-.30],[-.28,-.30],[-.28,-.10],[-.40,-.10]];
  plate(ctx, p, 0, flash, '#ffb078');
  ctx.restore();
}

/** The current core center, in the same logical scene coordinates as drawBoss. */
export function bossAnchor(opts = {}) {
  const {
    x = 0, y = 0, w = 320, h = 360, time = 0,
    attackProgress = 0, recoilX = 0, recoilY = 0,
    reducedMotion = false
  } = opts;
  const t = Number.isFinite(time) ? time : 0;
  const prepare = clamp((clamp(attackProgress) - .68) / .32);
  const motion = reducedMotion ? .18 : 1;
  const bob = Math.sin(t * TAU / 3) * h * .012 * motion * (1 - prepare * .5);
  return { x: x + w / 2 + recoilX, y: y + h / 2 + bob + recoilY };
}

/**
 * Pure Canvas 2D presentation. x/y/w/h are logical CSS-sized scene units.
 * time is seconds; flash/death/attackProgress are 0–1. recoil is scene pixels.
 * The caller owns rule state, damage, and timing; this function never mutates it.
 */
export function drawBoss(ctx, opts = {}) {
  const {
    x = 0, y = 0, w = 320, h = 360, time = 0,
    phase = 1, final = false, exposed = false, attackProgress = 0,
    recoilX = 0, recoilY = 0, flash = 0, death = 0,
    reducedMotion = false
  } = opts;
  const t = Number.isFinite(time) ? time : 0;
  const dead = clamp(death), hit = clamp(flash), charge = clamp(attackProgress);
  const motion = reducedMotion ? .18 : 1;
  const prepare = clamp((charge - .68) / .32);
  const anchor = bossAnchor(opts);
  const coreTint = prepare > .55 ? '#ffb078' : (final && phase >= 3 ? '#ffd0a1' : '#6bede4');
  const unit = Math.min(w, h);
  const spread = (exposed ? .035 : 0) - prepare * .018;

  ctx.save();
  ctx.translate(anchor.x, anchor.y);
  ctx.rotate(Math.sin(t * 1.7) * .007 * motion);
  ctx.scale(unit, unit);

  // Very restrained stage presence; the luminous core stays the clear focal point.
  if (dead < .95) {
    const halo = ctx.createRadialGradient(0,0,.015,0,0,.39);
    halo.addColorStop(0, prepare > .5 ? 'rgba(255,150,88,.12)' : 'rgba(83,210,205,.11)');
    halo.addColorStop(1,'rgba(40,100,110,0)');
    ctx.save();
    ctx.globalAlpha *= 1 - dead;
    ctx.fillStyle = halo;
    ctx.fillRect(-.45,-.45,.9,.9);
    ctx.restore();
  }

  if (final) {
    const damaged = clamp((phase - 1) / 2);
    const opening = .018 + spread + damaged * .055 + dead * .3;
    // A separate massive outer architecture makes the final boss unmistakable.
    ctx.save();
    ctx.scale(.9,.9);
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate(i * Math.PI / 2 + Math.PI / 4);
      ctx.translate(0,-opening);
      ctx.rotate(dead * (i % 2 ? -.22 : .22));
      ctx.globalAlpha *= (1 - dead) * (phase >= 3 ? .55 : 1);
      frameArm(ctx, 0, 0, 1, hit * .6);
      ctx.restore();
    }
    ctx.restore();
    ctx.save();
    ctx.rotate(-Math.PI / 4);
    ctx.strokeStyle = phase >= 3 ? '#d68e60' : '#61757e';
    ctx.lineWidth = .008;
    ctx.globalAlpha *= .7 * (1 - dead);
    const s = .335 + spread;
    ctx.strokeRect(-s,-s,s*2,s*2);
    ctx.restore();
  }

  ctx.save();
  if(final)ctx.scale(.62,.62);
  PLATES.forEach((part, i) => {
    const len = Math.hypot(...part.c) || 1;
    const nx = part.c[0] / len, ny = part.c[1] / len;
    const idle = Math.sin(t * (1.45 + i * .045) + i * .83) * .004 * motion;
    const delayedHit = hit * (.009 + (i % 3) * .002);
    const breakup = dead * dead * (.28 + (i % 3) * .09);
    ctx.save();
    ctx.translate(nx * (spread + idle + breakup) + delayedHit,
                  ny * (spread + idle + breakup));
    ctx.translate(part.c[0],part.c[1]);
    ctx.rotate(dead * (i % 2 ? -.7 : .65) + Math.sin(t * 2 + i) * .002 * motion);
    ctx.translate(-part.c[0],-part.c[1]);
    ctx.globalAlpha *= 1 - dead;
    plate(ctx, part.p, i, hit * (i % 3 === 0 ? 1 : .65), coreTint);
    ctx.restore();
  });
  ctx.restore();

  // Square core and its bracket are independent of the armor silhouette.
  ctx.save();
  ctx.globalAlpha *= Math.max(0, 1 - dead * 1.2);
  const pulse = 1 + Math.sin(t * 3.2) * .01 * motion;
  ctx.scale(pulse * (1 - dead * .7), pulse * (1 - dead * .7));
  const size = final ? .145 : .13;
  ctx.shadowColor = coreTint;
  ctx.shadowBlur = unit * (.035 + prepare * .025);
  ctx.fillStyle = hit > .1 ? '#fff4dd' : coreTint;
  ctx.fillRect(-size/2,-size/2,size,size);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,.30)';
  ctx.fillRect(-size/2,-size/2,size,.009);
  ctx.strokeStyle = coreTint;
  ctx.globalAlpha *= .45;
  ctx.lineWidth = .003;
  const ring = size/2 + .029 + (exposed ? .015 : 0);
  ctx.strokeRect(-ring,-ring,ring*2,ring*2);
  ctx.restore();

  if (hit > .04 && dead < .8) {
    ctx.save();
    ctx.globalAlpha *= hit * .7;
    ctx.strokeStyle = '#ffd7ae';
    ctx.lineWidth = .006;
    ctx.beginPath();
    ctx.moveTo(-.14,-.015); ctx.lineTo(-.06,-.015);
    ctx.moveTo(.07,.012); ctx.lineTo(.17,.012);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
