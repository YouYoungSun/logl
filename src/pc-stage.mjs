// PC presentation only. Rules, input cadence and the 180ms impact remain owned by core/FX.
const TAU=Math.PI*2;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const GOLD='#ffc76b',WHITE='#fff1cc',CYAN='#7deade',VIOLET='#c5a2ff';
const COLORS=[CYAN,CYAN,'#a0dbff',VIOLET,GOLD];
const gradientCache=new WeakMap();

function polygon(ctx,cx,cy,rx,ry,sides,turn=0,inner=1){
  ctx.beginPath();
  for(let i=0;i<=sides;i++){
    const a=turn+i/sides*TAU,r=i%2?inner:1;
    const x=cx+Math.cos(a)*rx*r,y=cy+Math.sin(a)*ry*r;
    i?ctx.lineTo(x,y):ctx.moveTo(x,y);
  }ctx.closePath();
}
function stroke(ctx,x,y,x2,y2){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();}
function tierOf(s){return clamp(Math.floor(s.momentumTier||0),0,4);}
function buildFlags(e){
  let flags=0;
  const reasons=e.momentumReasons||[];
  for(let i=0;i<Math.min(8,reasons.length);i++){
    const r=reasons[i];
    if(r==='고층 돌파')flags|=1;
    else if(r==='저층 안정')flags|=2;
    else if(r==='방해 행 복구')flags|=4;
    else if(r==='선제 타격')flags|=8;
  }
  if(e.style==='guard')flags|=16;
  return flags;
}
function targetOf(layout,fx,options){return options.target||fx.target||{x:layout.boss.x+layout.boss.w/2,y:layout.boss.y+layout.boss.h/2};}
function glow(ctx,layout){
  const b=layout.board,key=`${b.x},${b.y},${b.cell},${layout.width}`;
  let cached=gradientCache.get(ctx);
  if(cached?.key===key)return cached;
  const cx=b.x+b.cell*5,cy=b.y+b.cell*10;
  cached={key,gradients:[]};
  for(const tint of ['#65ddd0','#a0dbff','#bd91ff','#ffc46b']){
    const g=ctx.createRadialGradient(cx+30,cy,130,cx+30,cy,350);
    g.addColorStop(0,tint+'b0');g.addColorStop(.52,tint+'68');g.addColorStop(1,tint+'00');
    cached.gradients.push(g);
  }
  gradientCache.set(ctx,cached);return cached;
}

// This broad architectural silhouette stays visible between successful clears.
export function drawPcStage(ctx,layout,state,fx,options={}){
  if(layout.portrait||!state?.boss)return;
  const tier=tierOf(state),reduced=!!options.reducedMotion,b=layout.board;
  const bx=b.x+b.cell*10,by=b.y+b.cell*20,time=Number.isFinite(fx.time)?fx.time:0;
  const target=targetOf(layout,fx,options),danger=!!options.danger;
  if(!tier&&!options.previewLines)return;
  const tint=COLORS[tier],steady=danger?.42:1;
  ctx.save();
  // Protect NEXT/HOLD, the top boss information and the forecast column.
  ctx.beginPath();ctx.rect(87,30,808,Math.min(720,by+18)-30);
  ctx.rect(540,30,355,115);ctx.rect(b.x,b.y,b.cell*10,b.cell*20);ctx.clip('evenodd');
  if(tier){
    ctx.globalAlpha=steady*(reduced?.42:.66+(Math.sin(time*.9)*.025));
    ctx.fillStyle=glow(ctx,layout).gradients[tier-1];ctx.fillRect(87,30,510,Math.min(720,by+18)-30);
    // Layered slabs form a growing open gate, rather than a narrow decorative frame.
    for(let i=0;i<tier;i++){
      const spread=26+i*20,xx=bx+spread,top=90+i*36,bottom=by-28-i*28;
      ctx.globalAlpha=steady*(.18+i*.035);ctx.fillStyle=tint;
      ctx.beginPath();ctx.moveTo(bx+5,top+35);ctx.lineTo(xx,top);ctx.lineTo(xx+13,top+48);
      ctx.lineTo(xx+13,bottom-48);ctx.lineTo(xx,bottom);ctx.lineTo(bx+5,bottom-35);ctx.closePath();ctx.fill();
      ctx.globalAlpha=steady*(reduced?.4:.65);ctx.strokeStyle=i===tier-1?WHITE:tint;ctx.lineWidth=i===tier-1?2.2:1;
      stroke(ctx,xx+13,top+48,xx+13,bottom-48);
      stroke(ctx,bx+5,top+35,xx,top);stroke(ctx,xx,bottom,bx+5,bottom-35);
    }
    // Large diagonal faults behind the enemy communicate a persistent altered arena.
    if(tier>=2){
      const radius=115+tier*26;
      ctx.globalAlpha=steady*(tier===4?.28:.18);ctx.strokeStyle=tint;ctx.lineWidth=tier===4?8:4;
      for(let i=0;i<tier+1;i++){
        const angle=(i/(tier+1))*TAU+.2,inner=radius*.55;
        const sx=target.x+Math.cos(angle)*inner,sy=target.y+Math.sin(angle)*inner;
        const mx=target.x+Math.cos(angle+.13)*radius,my=target.y+Math.sin(angle+.13)*radius;
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(mx,my);
        ctx.lineTo(mx+Math.cos(angle)*35,my+Math.sin(angle)*35);ctx.stroke();
      }
      ctx.globalAlpha=steady*.38;ctx.lineWidth=2;
      polygon(ctx,target.x,target.y,radius,radius*.78,6,Math.PI/6);ctx.stroke();
      if(tier>=3){polygon(ctx,target.x,target.y,radius+28,radius*.78+28,6,Math.PI/6);ctx.stroke();}
    }
    if(tier===4){
      const charge=(Math.max(0,state.momentum-12)%4);
      const pulse=cyclePulse(fx);
      // Four broad capacitors visibly assemble and discharge again after OVERDRIVE.
      for(let i=0;i<4;i++){
        const xx=608+i*68,yy=174,filled=i<charge;
        ctx.globalAlpha=steady*(filled?.7:.2);ctx.fillStyle=filled?GOLD:'#b48b4e';
        ctx.beginPath();ctx.moveTo(xx-23,yy);ctx.lineTo(xx,yy-10);ctx.lineTo(xx+23,yy);
        ctx.lineTo(xx,yy+10);ctx.closePath();ctx.fill();
        ctx.globalAlpha=steady*.62;ctx.strokeStyle=GOLD;ctx.lineWidth=1.5;ctx.stroke();
      }
      if(pulse>0){
        ctx.globalAlpha=steady*pulse*(reduced?.18:.48);ctx.strokeStyle=WHITE;ctx.lineWidth=reduced?3:10;
        const reach=(1-pulse)*155;
        polygon(ctx,target.x,target.y,150+reach,135+reach*.6,6,Math.PI/6);ctx.stroke();
      }
      // Broad rising shafts are deliberately behind the protected live board.
      ctx.globalAlpha=steady*(reduced?.15:.21);ctx.fillStyle=GOLD;
      for(let i=0;i<5;i++){
        const xx=bx+5+i*17,height=70+i*25;
        ctx.beginPath();ctx.moveTo(xx,by);ctx.lineTo(xx+19,by-height);ctx.lineTo(xx+35,by);ctx.closePath();ctx.fill();
      }
    }
  }
  if(options.previewLines===4){
    ctx.globalAlpha=reduced?.55:.65;ctx.strokeStyle=GOLD;ctx.fillStyle='#efae6330';ctx.lineWidth=2;
    for(let i=0;i<4;i++){
      const xx=bx+22+i*7,yy=by-160+i*30;
      ctx.fillRect(xx,yy,36,18);ctx.strokeRect(xx,yy,36,18);
    }
  }
  ctx.restore();
}

function cyclePulse(fx){
  const attacks=fx.attacks||[];
  for(let i=attacks.length-1,stop=Math.max(0,attacks.length-6);i>=stop;i--){
    const a=attacks[i],n=a.event.momentum,age=fx.time-a.born-.18;
    if(n>12&&n%4===0&&age>=0&&age<.72)return 1-age/.72;
  }return 0;
}

export function getPcImpact(fx){
  let split=0,scar=0,compression=0,style='standard',direction=1;
  const attacks=fx.attacks||[];
  for(let i=attacks.length-1,stop=Math.max(0,attacks.length-6);i>=stop;i--){
    const a=attacks[i],e=a.event,age=fx.time-a.born;
    if(age>=.11&&age<.18)compression=Math.max(compression,(age-.11)/.07*(e.lines===4?1:.35));
    if(age<.18||age>.95)continue;
    const t=age-.18,power=clamp(.25+e.lines*.16+(e.chargeUsed||0)*.035,0,1);
    const pose=power*(t<.065?1:Math.exp(-(t-.065)*5.4));
    if(pose>split){split=pose;style=e.style||'standard';direction=e.lines===1?-1:1;}
    scar=Math.max(scar,power*clamp(1-t/.77));
  }return {split,scar,style,direction,compression};
}

function drawExtraction(ctx,layout,fx,reduced){
  const b=layout.board,bx=b.x+b.cell*10,attacks=fx.attacks||[];
  ctx.save();ctx.beginPath();ctx.rect(bx+2,b.y,148,b.cell*20);ctx.clip();
  for(let i=Math.max(0,attacks.length-6);i<attacks.length;i++){
    const a=attacks[i],e=a.event,age=fx.time-a.born,rows=e.rows;
    if(age<0||age>=.13||!rows?.length)continue;
    const count=Math.min(4,rows.length),tier=clamp(e.effectTier??e.momentumTier??0,0,4);
    let mean=0;for(let j=0;j<count;j++)mean+=rows[j].row+.5;mean/=count;
    const launchY=clamp(b.y+mean*b.cell,205,490),u=clamp(age/.095),smooth=u*u*(3-2*u);
    for(let j=0;j<count;j++){
      const sourceY=b.y+(rows[j].row+.5)*b.cell;
      const endY=launchY+(j-(count-1)/2)*9;
      const xx=lerp(bx+8,580,smooth),yy=lerp(sourceY,endY,smooth);
      const color=e.chargeUsed?GOLD:COLORS[tier];
      // The strip starts at the actual removed-row height, outside all live cells.
      ctx.globalAlpha=clamp((.13-age)/.05)*.8;ctx.fillStyle=color;
      ctx.fillRect(bx+2,sourceY-b.cell*.3,8,b.cell*.6);
      ctx.globalAlpha=(1-u*.6)*(reduced?.3:.5);ctx.strokeStyle=color;ctx.lineWidth=reduced?2:5;
      ctx.beginPath();ctx.moveTo(bx+3,sourceY);
      ctx.quadraticCurveTo(Math.min(584,xx+28),sourceY,xx,yy);ctx.stroke();
      ctx.globalAlpha=clamp((.13-age)/.04)*.9;ctx.fillStyle=j%2?WHITE:color;
      ctx.fillRect(xx-9,yy-4,18,8);
    }
  }ctx.restore();
}

// New PC attacks occupy the corridor and boss arena, never live cells or forecasts.
export function drawPcAttack(ctx,layout,state,fx,options={}){
  if(layout.portrait||!state?.boss)return;
  const b=layout.board,bx=b.x+b.cell*10,reduced=!!options.reducedMotion,target=targetOf(layout,fx,options);
  const attacks=fx.attacks||[];
  drawExtraction(ctx,layout,fx,reduced);
  ctx.save();ctx.beginPath();ctx.rect(bx+12,150,Math.max(0,890-bx-12),410);ctx.clip();
  // Work is bounded even when synthetic tests supply hundreds of simultaneous events.
  for(let i=Math.max(0,attacks.length-6);i<attacks.length;i++){
    const a=attacks[i],e=a.event,age=fx.time-a.born;
    if(age<0||age>.95)continue;
    const tier=clamp(e.effectTier??e.momentumTier??0,0,4),n=clamp(e.lines||1,1,4),traits=buildFlags(e);
    const color=e.chargeUsed?GOLD:e.style==='high'?VIOLET:e.style==='guard'||e.style==='repair'?'#8ee8bd':COLORS[tier];
    let mean=18;
    if(e.rows?.length){mean=0;for(let r=0;r<Math.min(4,e.rows.length);r++)mean+=e.rows[r].row+.5;mean/=Math.min(4,e.rows.length);}
    const sy=clamp(b.y+mean*b.cell,205,490),sx=580;
    ctx.globalCompositeOperation='source-over';
    if(age<.18){
      const raw=clamp((age-.09)/.09),u=reduced?raw:raw*raw*(3-2*raw);
      const px=lerp(sx,target.x,u),py=lerp(sy,target.y,u)-(reduced?0:Math.sin(u*Math.PI)*36);
      if(n===4){
        // Four extracted plates compress into a single visible mass, not four tiny sparks.
        const fold=clamp(age/.085),size=(24+tier*4)*(1+.2*Math.sin(raw*Math.PI));
        for(let j=0;j<4;j++){
          const yy=lerp(sy+(j-1.5)*36,py,fold),xx=lerp(sx,px,fold);
          ctx.globalAlpha=.8*(1-fold*.6);ctx.fillStyle=j%2?color:WHITE;
          ctx.fillRect(xx-18,yy-9,36,18);
        }
        ctx.globalAlpha=reduced?.35:.55;ctx.strokeStyle=color;ctx.lineWidth=32+tier*5;
        stroke(ctx,lerp(sx,px,.25),lerp(sy,py,.25),px,py);
        ctx.globalAlpha=.98;ctx.fillStyle=WHITE;
        polygon(ctx,px,py,size,size,4,reduced?Math.PI/4:Math.PI/4+raw*.7);ctx.fill();
        ctx.strokeStyle=color;ctx.lineWidth=3;polygon(ctx,px,py,size+12,size+12,4,Math.PI/4);ctx.stroke();
      }else if(n>=2){
        for(let j=0;j<n;j++){
          const spread=(j-(n-1)/2)*(reduced?22:56)*(1-u);
          ctx.strokeStyle=j%2?WHITE:color;ctx.globalAlpha=.85;ctx.lineWidth=4+tier;
          stroke(ctx,sx,sy+spread,px,py+spread*.35);
          polygon(ctx,px,py+spread*.35,8+tier,8+tier,4,Math.PI/4);ctx.fillStyle=color;ctx.fill();
        }
      }else{
        ctx.strokeStyle=color;ctx.globalAlpha=reduced?.3:.4;ctx.lineWidth=18+tier*3;stroke(ctx,sx,sy,px,py);
        ctx.strokeStyle=WHITE;ctx.globalAlpha=.95;ctx.lineWidth=3+tier*.5;stroke(ctx,Math.max(sx,px-85),lerp(sy,py,.65),px+12,py);
        polygon(ctx,px,py,19+tier*3,5+tier,4,0);ctx.fillStyle=color;ctx.fill();
      }
      // Charge and height/chain traits layer onto the primary line-count silhouette.
      const q=clamp(e.chargeUsed||0,0,4);
      for(let j=0;j<q;j++){
        const v=clamp(raw*1.5-j*.09),xx=lerp(sx+16+j*17,px,v),yy=lerp(535,py,v);
        ctx.globalAlpha=.85;ctx.fillStyle=GOLD;polygon(ctx,xx,yy,5,9,4,0);ctx.fill();
      }
      if((e.combo||0)>1){ctx.globalAlpha=.55;ctx.strokeStyle=VIOLET;ctx.lineWidth=2;polygon(ctx,px,py,23+tier*4,23+tier*4,6,raw);ctx.stroke();}
      if(traits&1){ctx.globalAlpha=.6;ctx.strokeStyle=VIOLET;ctx.lineWidth=3;stroke(ctx,px-24,py-32,px,py-48);stroke(ctx,px,py-48,px+24,py-32);}
      if(traits&2){ctx.globalAlpha=.7;ctx.strokeStyle='#8ee8bd';ctx.lineWidth=3;stroke(ctx,px-28,py+32,px+28,py+32);}
      if(traits&8){ctx.globalAlpha=.6;ctx.strokeStyle=WHITE;ctx.lineWidth=2;stroke(ctx,px+12,py,px+55,py);}
      continue;
    }
    const t=age-.18,fade=clamp(1-t/.77),burst=clamp(1-t/.29),power=.5+n*.19+tier*.08;
    const tx=a.impactPoint?.x??target.x,ty=a.impactPoint?.y??target.y;
    ctx.strokeStyle=color;ctx.fillStyle=color;
    if(n===1){
      ctx.globalAlpha=fade*(reduced?.3:.68);ctx.lineWidth=reduced?2:4;
      stroke(ctx,tx-95,ty+52,tx+125,ty-68);
      ctx.globalAlpha=burst*.85;ctx.strokeStyle=WHITE;ctx.lineWidth=3;stroke(ctx,tx-65,ty+35,tx+92,ty-49);
    }else if(n<4){
      ctx.globalAlpha=fade*(reduced?.25:.55);ctx.lineWidth=3;
      for(let j=0;j<n;j++){
        const xx=tx+(j-1)*18+(reduced?0:t*58);
        ctx.beginPath();ctx.moveTo(xx-38,ty-90);ctx.lineTo(xx+18,ty);ctx.lineTo(xx-38,ty+90);ctx.stroke();
      }
    }else{
      const reach=(reduced?82:95+t*165)*power;
      // Only the two newest attacks fill a large burst; old hits leave cracks, not white fog.
      if(i>=attacks.length-2&&burst>0){
        ctx.globalAlpha=burst*(reduced?.12:.34);polygon(ctx,tx,ty,reach,reach*.8,24,.2,.4);ctx.fill();
        ctx.globalAlpha=burst*(reduced?.25:.8);ctx.strokeStyle=WHITE;ctx.lineWidth=reduced?2:5;
        polygon(ctx,tx,ty,reach*.62,reach*.62,4,Math.PI/4);ctx.stroke();
      }
      ctx.globalAlpha=fade*(reduced?.25:.66);ctx.strokeStyle=color;ctx.lineWidth=2.5;
      for(let j=0;j<4;j++){
        const aa=Math.PI/4+j*Math.PI/2,r=(reduced?65:70+t*105)*power;
        const xx=tx+Math.cos(aa)*r,yy=ty+Math.sin(aa)*r;
        polygon(ctx,xx,yy,16,26,4,aa);ctx.stroke();
      }
    }
    // Cracks survive the flash and follow distinct angular routes through the boss space.
    ctx.globalAlpha=fade*(reduced?.24:.55);ctx.strokeStyle=color;ctx.lineWidth=n===4?3:1.6;
    const rays=n===4?8:n+2,reach=(reduced?100:115+t*100)*power;
    for(let j=0;j<rays;j++){
      const aa=j/rays*TAU+.18,inner=35+j%2*14;
      ctx.beginPath();ctx.moveTo(tx+Math.cos(aa)*inner,ty+Math.sin(aa)*inner);
      ctx.lineTo(tx+Math.cos(aa+.12)*reach*.63,ty+Math.sin(aa+.12)*reach*.63);
      ctx.lineTo(tx+Math.cos(aa)*reach,ty+Math.sin(aa)*reach);ctx.stroke();
    }
    if(e.chargeUsed){ctx.globalAlpha=fade*.45;ctx.strokeStyle=GOLD;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(tx,ty,100+e.chargeUsed*9,35+t*35,.3,0,TAU);ctx.stroke();}
    if(traits&(4|16)){
      ctx.globalAlpha=fade*.55;ctx.strokeStyle='#8ee8bd';ctx.lineWidth=3;
      if(traits&16){polygon(ctx,tx,ty,115,105,6,Math.PI/6);ctx.stroke();}
      if(traits&4)for(let j=0;j<3;j++){const xx=tx-40+j*40;stroke(ctx,xx-7,ty+70,xx+7,ty+96);}
    }
  }
  ctx.restore();
}
