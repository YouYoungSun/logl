const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const COLORS = { I:'#65ddd0', J:'#7f9dc9', L:'#efae63', O:'#dacd89', S:'#8eb6a0', T:'#ab9dbd', Z:'#ce8d88', G:'#81919c' };
const CYAN = '#65ddd0', AMBER = '#efae63', IVORY = '#f0e6d4';

function damp(x, v, dt, w = 26) {
  const j = v + w*x, e = Math.exp(-w*dt);
  return [(x+j*dt)*e, (v-w*j*dt)*e];
}
function curve(a,b,c,t) {
  const s=1-t;
  return {x:s*s*a.x+2*s*t*b.x+t*t*c.x, y:s*s*a.y+2*s*t*b.y+t*t*c.y};
}
function rand(seed) {
  const v=Math.sin(seed*127.1+311.7)*43758.5453;
  return v-Math.floor(v);
}

/** Presentation only: it never writes to the game, HP, board or battle timers. */
export class Effects {
  constructor(audio) {
    this.audio=audio;
    this.pool=Array.from({length:160},()=>({active:false}));
    this.reset(1);
  }
  reset(bossId) {
    this.bossId=bossId; this.time=0; this.lastSeq=-1;
    this.recoil={x:0,y:0}; this.velocity={x:0,y:0};
    this.flash=0; this.death=0; this.victoryAt=null; this.readyAt=null;
    this.attacks=[]; this.repairs=[]; this.numbers=[];
    this.bossPulse=0; this.target=null; this.cursor=0; this.reducedMotion=false;
    for(const p of this.pool)p.active=false;
  }
  consume(events) {
    if(!Array.isArray(events))return;
    for(const e of events) {
      if(!e || e.bossId!==this.bossId)continue;
      if(Number.isFinite(e.seq)) {
        if(e.seq<=this.lastSeq)continue;
        this.lastSeq=e.seq;
      }
      if(e.type==='clear' && Array.isArray(e.rows) && e.rows.length) {
        const copy={...e,rows:e.rows.map(r=>({row:r.row,colors:[...(r.colors||[])]}))};
        this.attacks.push({event:copy,born:this.time,impacted:false,impactPoint:null});
        if(this.attacks.length>64) {
          const removable=this.attacks.findIndex(a=>!a.event.killed && a.impacted);
          this.attacks.splice(removable>=0?removable:0,1);
        }
        this.audio?.play?.('clear',clamp(e.lines/4,.25,1));
        if(e.killed && this.victoryAt===null) {
          this.victoryAt=this.time; this.readyAt=this.time+.4;
        }
      } else if(e.type==='bossAttack') {
        this.bossPulse=1;
        this.audio?.play?.('boss',1);
      } else if(e.type==='erosion') {
        this.bossPulse=Math.max(this.bossPulse,.38);
      } else if(e.type==='repair' && Number.isFinite(e.row)) {
        this.repairs.push({row:clamp(e.row,0,19),born:this.time});
      }
    }
  }
  update(dt) {
    if(!Number.isFinite(dt)||dt<=0)return;
    this.time+=dt;
    [this.recoil.x,this.velocity.x]=damp(this.recoil.x,this.velocity.x,dt);
    [this.recoil.y,this.velocity.y]=damp(this.recoil.y,this.velocity.y,dt);
    this.flash*=Math.exp(-22*dt);
    this.bossPulse*=Math.exp(-11*dt);
    for(const p of this.pool)if(p.active) {
      p.age+=dt;if(p.age>=p.life)p.active=false;
    }
    for(const a of this.attacks) {
      const age=this.time-a.born;
      if(!a.impacted && age>=.18) {
        a.impacted=true;
        a.impactPoint=this.target?{...this.target}:null;
        const e=a.event;
        const power=clamp(.45+.24*e.lines+.035*Math.min(e.combo||1,6),.65,1.55);
        const scale=this.reducedMotion?.25:1;
        const kick=(e.lines===4?570:e.lines>=2?330:160)*scale;
        this.velocity.x=clamp(this.velocity.x+kick,-650,650);
        this.velocity.y=clamp(this.velocity.y-kick*.12,-120,120);
        this.recoil.x=clamp(this.recoil.x+e.lines*.16*scale,-10,10);
        this.flash=Math.max(this.flash,clamp(.38+e.lines*.145,.4,.95));
        if(age<.42) {
          this.audio?.play?.('hit',power);
          this.numbers.push({value:e.damage,born:this.time,origin:a.impactPoint,large:e.lines===4});
          if(this.numbers.length>4)this.numbers.shift();
          const count=this.reducedMotion?3:5+e.lines*3;
          for(let i=0;i<count;i++)this._spark(e.seq||0,i,power,a.impactPoint);
        }
      }
    }
    this.recoil.x=clamp(this.recoil.x,-10,10);
    this.recoil.y=clamp(this.recoil.y,-5,5);
    this.attacks=this.attacks.filter(a=>this.time-a.born<.46 || !a.impacted);
    this.repairs=this.repairs.filter(r=>this.time-r.born<.28);
    this.numbers=this.numbers.filter(n=>this.time-n.born<.55);
    if(this.victoryAt!==null)this.death=clamp((this.time-this.victoryAt-.18)/.22);
  }
  _spark(seed,i,power,origin) {
    let p=null;
    for(let n=0;n<this.pool.length;n++) {
      const index=(this.cursor+n)%this.pool.length;
      if(!this.pool[index].active){p=this.pool[index];this.cursor=(index+1)%this.pool.length;break;}
    }
    if(!p) {p=this.pool[this.cursor];this.cursor=(this.cursor+1)%this.pool.length;}
    const a=rand(seed*19+i*3)*TAU, speed=(35+rand(seed+i*7)*145)*power;
    Object.assign(p,{active:true,age:0,life:.16+rand(seed+i*13)*.18,
      vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-25,
      size:1.4+rand(seed*3+i)*2.4,color:i%3===0?IVORY:AMBER,
      ox:origin?.x??null,oy:origin?.y??null});
  }
  draw(ctx,layout,target,options={}) {
    const b=layout?.board;
    if(!ctx||!b||!target)return;
    this.target={x:target.x,y:target.y};
    this.reducedMotion=!!options.reducedMotion;
    const reduced=this.reducedMotion;
    const cell=b.cell;
    ctx.save();
    ctx.lineCap='round';

    // Recovery is a quiet board edit, never an outgoing attack.
    for(const r of this.repairs) {
      const t=clamp((this.time-r.born)/.28);
      ctx.globalAlpha=(1-t)*.45;ctx.strokeStyle=CYAN;ctx.lineWidth=1;
      const yy=b.y+(r.row+.5)*cell+t*cell*.4;
      ctx.beginPath();ctx.moveTo(b.x,yy);ctx.lineTo(b.x+10*cell,yy);ctx.stroke();
    }
    if(this.bossPulse>.015) {
      ctx.globalAlpha=this.bossPulse*.45;ctx.strokeStyle=AMBER;ctx.lineWidth=2;
      ctx.strokeRect(b.x-3,b.y-3,cell*10+6,cell*20+6);
    }
    ctx.globalCompositeOperation='lighter';
    for(const a of this.attacks.slice(-6)) {
      const e=a.event,age=this.time-a.born;
      const mean=e.rows.reduce((s,r)=>s+r.row+.5,0)/e.rows.length;
      const emitter={x:b.x+cell*10+10,y:b.y+mean*cell};
      const color=e.chargeUsed>0?AMBER:CYAN;
      const weight=1.25+e.lines*.62+Math.min(e.combo||1,6)*.12;
      if(age<.06) {
        const u=clamp(age/.06), gather=1-Math.pow(1-u,3);
        for(const row of e.rows) {
          const yy=b.y+(row.row+.5)*cell;
          ctx.globalAlpha=(1-u)*.48;ctx.strokeStyle=color;ctx.lineWidth=1;
          ctx.strokeRect(b.x+1,yy-cell*.5+1,cell*10-2,cell-2);
          const colors=row.colors.length?row.colors:Array(10).fill('I');
          for(let i=0;i<Math.min(10,colors.length);i++) {
            const sx=b.x+(i+.5)*cell;
            const px=mix(sx,emitter.x,gather),py=mix(yy,emitter.y,gather);
            ctx.globalAlpha=.85-u*.2;ctx.fillStyle=COLORS[colors[i]]||color;
            const size=reduced?2:3.3-u*1.1;
            ctx.fillRect(px-size/2,py-size/2,size,size);
          }
        }
      } else if(age<.18) {
        const raw=clamp((age-.06)/.12),u=raw*raw;
        const control={x:mix(emitter.x,target.x,.52),y:mix(emitter.y,target.y,.48)-(reduced?0:32)};
        const pos=curve(emitter,control,target,u);
        const tail=curve(emitter,control,target,Math.max(0,u-(reduced?.2:.12)));
        ctx.globalAlpha=.28;ctx.strokeStyle=color;ctx.lineWidth=weight*4;
        ctx.beginPath();ctx.moveTo(tail.x,tail.y);ctx.lineTo(pos.x,pos.y);ctx.stroke();
        ctx.globalAlpha=.95;ctx.lineWidth=weight;
        ctx.beginPath();ctx.moveTo(tail.x,tail.y);ctx.lineTo(pos.x,pos.y);ctx.stroke();
        ctx.fillStyle=IVORY;const size=3+e.lines*.65;
        ctx.fillRect(pos.x-size/2,pos.y-size/2,size,size);
      } else if(age<.29) {
        const origin=a.impactPoint||target,t=(age-.18)/.11;
        ctx.globalAlpha=(1-t)*.7;ctx.strokeStyle=IVORY;ctx.lineWidth=1.5;
        const reach=(9+e.lines*3)*(reduced?.6:1);
        ctx.beginPath();
        ctx.moveTo(origin.x-reach,origin.y);ctx.lineTo(origin.x+reach,origin.y);
        ctx.moveTo(origin.x,origin.y-reach*.65);ctx.lineTo(origin.x,origin.y+reach*.65);
        ctx.stroke();
      }
    }
    for(const p of this.pool)if(p.active) {
      if(p.ox===null){p.ox=target.x;p.oy=target.y;}
      const fade=1-p.age/p.life;
      ctx.globalAlpha=fade*.85;ctx.fillStyle=p.color;
      const x=p.ox+p.vx*p.age,y=p.oy+p.vy*p.age+100*p.age*p.age;
      ctx.fillRect(x-p.size/2,y-p.size/2,p.size*fade,p.size*fade);
    }
    ctx.globalCompositeOperation='source-over';ctx.textAlign='center';
    for(const n of this.numbers) {
      const age=this.time-n.born,u=age/.55,origin=n.origin||target;
      ctx.globalAlpha=clamp((1-u)*1.8);
      ctx.font=`600 ${n.large?24:18}px ui-monospace, monospace`;
      ctx.fillStyle=n.large?AMBER:IVORY;
      ctx.fillText(`−${n.value}`,origin.x+15,origin.y-45-age*(reduced?18:48));
    }
    ctx.restore();
  }
}
