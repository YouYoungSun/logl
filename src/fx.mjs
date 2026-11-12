const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const COLORS = { I:'#65ddd0', J:'#7f9dc9', L:'#efae63', O:'#dacd89', S:'#8eb6a0', T:'#ab9dbd', Z:'#ce8d88', G:'#81919c' };
const CYAN = '#65ddd0', AMBER = '#efae63', IVORY = '#f0e6d4';
const momentumTier = value => value>=12?4:value>=8?3:value>=4?2:value>=1?1:0;
const attackTier = event => clamp(Math.floor(event.momentumTier??momentumTier(event.momentum||0)),0,4);
const attackColor = event => event.style==='charge'||event.chargeUsed>0?AMBER:
  event.style==='high'?'#c7a5ff':event.style==='low'||event.style==='guard'||event.style==='repair'?'#87ebbd':CYAN;

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
    this.pool=Array.from({length:320},()=>({active:false}));
    this.reset(1);
  }
  reset(bossId) {
    this.bossId=bossId; this.time=0; this.lastSeq=-1;
    this.recoil={x:0,y:0}; this.velocity={x:0,y:0};
    this.flash=0; this.death=0; this.victoryAt=null; this.readyAt=null;
    this.attacks=[]; this.repairs=[]; this.numbers=[];
    this.bossPulse=0; this.guardPulse=0; this.target=null; this.cursor=0; this.reducedMotion=false;
    this.comboFeedback={count:0,lines:0,kind:'idle',changedAt:this.time,noticeAt:-Infinity};
    this.momentumFeedback={value:0,tier:0,changedAt:-Infinity,reason:'',style:'standard'};this.displayMomentumTier=0;
    this.compact=false;this.particleLimit=240;
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
        // The success counter changes at removal, never at a delayed impact.
        this.comboFeedback={count:e.combo||1,lines:e.lines,kind:'active',changedAt:this.time,noticeAt:-Infinity};
        const copy={...e,effectTier:attackTier(e),rows:e.rows.map(r=>({row:r.row,colors:[...(r.colors||[])]}))};
        this.attacks.push({event:copy,born:this.time,impacted:false,impactPoint:null});
        if(this.attacks.length>64) {
          const removable=this.attacks.findIndex(a=>!a.event.killed && a.impacted);
          this.attacks.splice(removable>=0?removable:0,1);
        }
        this.audio?.play?.('clear',clamp(e.lines/4,.25,1),{combo:e.combo||1,lines:e.lines,momentumTier:copy.effectTier});
        if(e.killed && this.victoryAt===null) {
          this.victoryAt=this.time; this.readyAt=this.time+.4;
        }
      } else if(e.type==='momentumUp') {
        const value=Number.isSafeInteger(e.value)&&e.value>=0?e.value:0,tier=clamp(Math.floor(e.tier??momentumTier(value)),0,4);
        const promoted=tier>Math.max(this.momentumFeedback.tier,this.displayMomentumTier);
        this.momentumFeedback={value,tier,changedAt:promoted?this.time:this.momentumFeedback.changedAt,reason:e.reason||'',style:e.style||'standard'};
      } else if(e.type==='momentumStyle') {
        this.momentumFeedback={...this.momentumFeedback,reason:e.reason||'',style:e.style||'standard'};
        const pending=this.attacks.findLast(a=>!a.impacted&&a.event.momentum===e.value);
        if(pending)pending.event.style=e.style||'standard';
      } else if(e.type==='comboProtected') {
        this.comboFeedback={...this.comboFeedback,count:e.combo,kind:'protected',noticeAt:this.time};
      } else if(e.type==='comboEnded') {
        this.comboFeedback={count:0,endedCount:e.combo,lines:0,kind:'ended',changedAt:this.time,noticeAt:this.time};
      } else if(e.type==='stageClear'||e.type==='death') {
        this.comboFeedback={count:0,lines:0,kind:'idle',changedAt:this.time,noticeAt:-Infinity};
        if(e.type==='death'){this.momentumFeedback={value:0,tier:0,changedAt:-Infinity,reason:'',style:'standard'};this.displayMomentumTier=0;}
      } else if(e.type==='guard') {
        this.guardPulse=1;
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
    this.guardPulse*=Math.exp(-8*dt);
    for(const p of this.pool)if(p.active) {
      p.age+=dt;if(p.age>=p.life)p.active=false;
    }
    for(const a of this.attacks) {
      const age=this.time-a.born;
      if(!a.impacted && age>=.18) {
        a.impacted=true;
        a.impactPoint=this.target?{...this.target}:null;
        const e=a.event,tier=e.effectTier||0;
        const power=clamp(.45+.24*e.lines+.035*Math.min(e.combo||1,6),.65,1.55);
        const scale=this.reducedMotion?.25:1;
        const kick=(e.lines===4?570:e.lines>=2?330:160)*scale;
        this.velocity.x=clamp(this.velocity.x+kick,-650,650);
        this.velocity.y=clamp(this.velocity.y-kick*.12,-120,120);
        this.recoil.x=clamp(this.recoil.x+e.lines*.16*scale,-10,10);
        this.flash=Math.max(this.flash,clamp(.38+e.lines*.145,.4,.95));
        if(age<.42) {
          this.audio?.play?.('hit',power,{lines:e.lines,combo:e.combo||1,momentumTier:tier});
          this.numbers.push({value:e.damage,born:this.time,origin:a.impactPoint,large:e.lines===4});
          if(this.numbers.length>4)this.numbers.shift();
          const count=this.reducedMotion?3:5+e.lines*3+tier*10;
          for(let i=0;i<count;i++)this._spark(e.seq||0,i,power,a.impactPoint,tier,attackColor(e));
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
  _spark(seed,i,power,origin,tier=0,tint=AMBER) {
    let p=null;
    for(let n=0;n<this.particleLimit;n++) {
      const index=(this.cursor+n)%this.particleLimit;
      if(!this.pool[index].active){p=this.pool[index];this.cursor=(index+1)%this.pool.length;break;}
    }
    if(!p) {this.cursor%=this.particleLimit;p=this.pool[this.cursor];this.cursor=(this.cursor+1)%this.particleLimit;}
    const a=rand(seed*19+i*3)*TAU, speed=(35+rand(seed+i*7)*(145+tier*22))*power;
    Object.assign(p,{active:true,age:0,life:.16+rand(seed+i*13)*.18,
      vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-25,
      size:1.4+rand(seed*3+i)*(2.4+tier*.45),color:i%3===0?IVORY:tint,
      ox:origin?.x??null,oy:origin?.y??null});
  }
  drawCombo(ctx,position={x:490,y:185},options={}) {
    const c=this.comboFeedback;
    if(!ctx||!c||c.kind==='idle')return;
    const {x,y}=position,age=Math.max(0,this.time-c.changedAt),noticeAge=this.time-c.noticeAt;
    ctx.save();ctx.globalCompositeOperation='source-over';ctx.textAlign='center';
    const label=(value,yy,size,color=CYAN)=>{ctx.fillStyle=color;ctx.font=`500 ${size}px GameMono,Consolas,monospace`;ctx.fillText(value,x,yy);};
    if(options.compact){
      if(c.kind==='ended'){
        if(noticeAge<1.1){ctx.globalAlpha=clamp((1.1-noticeAge)/.4);label(`연쇄 종료 · ${c.endedCount}연쇄`,y+5,12,'#9aaeb9');}
      }else{
        if(c.count===1)label('연쇄 시작',y+5,13);
        else{
          ctx.textAlign='right';ctx.fillStyle=c.count>=6?AMBER:CYAN;
          ctx.font=`700 ${c.count>=100?24:28}px GameMono,Consolas,monospace`;ctx.fillText(String(c.count),x-25,y+6);
          ctx.textAlign='left';ctx.font='500 10px GameMono,Consolas,monospace';ctx.fillText('COMBO',x-15,y-5);ctx.fillText(`${c.count}연쇄`,x-15,y+10);
          ctx.textAlign='center';ctx.fillStyle='#aac0cb';ctx.fillText(`${c.lines}줄 제거`,x+72,y+5);
        }
        if(c.kind==='protected'&&noticeAge<1.1)label('연쇄 보호 사용',y+26,10,AMBER);
        else if(c.count>=6)label('연쇄 보너스 최대',y+26,10,AMBER);
        if((c.count===3||c.count===6)&&age<.35&&!options.reducedMotion){
          ctx.globalAlpha=(1-age/.35)*.45;ctx.strokeStyle=CYAN;ctx.lineWidth=1;ctx.strokeRect(x-108,y-20,216,42);
        }
      }
      ctx.restore();return;
    }
    if(c.kind==='ended'){
      if(noticeAge<1.1){
        ctx.globalAlpha=clamp((1.1-noticeAge)/.4);
        label('연쇄 종료',y+20,12,'#9aaeb9');label(`${c.endedCount}연쇄`,y+42,15,'#9aaeb9');
      }
      ctx.restore();return;
    }
    const milestone=c.count===3||c.count===6;
    if(milestone&&age<.35&&!options.reducedMotion){
      ctx.globalAlpha=(1-age/.35)*.65;ctx.strokeStyle=c.count>=6?AMBER:CYAN;ctx.lineWidth=1;
      ctx.strokeRect(x-44,y-14,88,101);ctx.globalAlpha=1;
    }
    label('COMBO',y,10,'#9bb5c0');
    if(c.count===1){label('연쇄 시작',y+32,13);}
    else{
      const pop=!options.reducedMotion&&age<.14?1+.14*Math.sin(Math.PI*age/.14):1;
      ctx.save();ctx.translate(x,y+35);ctx.scale(pop,pop);
      ctx.fillStyle=c.count>=6?AMBER:CYAN;ctx.font=`700 ${c.count>=100?28:36}px GameMono,Consolas,monospace`;
      ctx.fillText(String(c.count),0,0);ctx.restore();
      label(`${c.count}연쇄`,y+52,11,'#bed1d8');
    }
    if(c.kind==='protected'&&noticeAge<1.1)label('연쇄 보호 사용',y+70,10,AMBER);
    else if(c.count>=6)label('연쇄 보너스 최대',y+70,9,AMBER);
    else if(c.lines)label(`${c.lines}줄 제거`,y+70,10,'#96b0be');
    ctx.restore();
  }
  drawAura(ctx,layout,options={}) {
    this._setMode(options.compact);
    if(options.momentum!==undefined||this.momentumFeedback.value>0){
      this._drawMomentumAura(ctx,layout,options);return;
    }
    const b=layout?.board,combo=options.combo??this.comboFeedback.count;
    if(!ctx||!b||!Number.isFinite(b.cell)||b.cell<=0||!combo||options.danger)return;
    const width=b.cell*(b.cols||10),height=b.cell*(b.rows||20),tier=combo>=6?3:combo>=3?2:1;
    const reduced=!!options.reducedMotion,pad=Math.min(options.compact?10:20,b.cell*.6),strength=[0,.45,.7,1][tier];
    const sceneWidth=layout.width||1100,sceneHeight=layout.height||680;
    ctx.save();
    // Even-odd clipping guarantees that light and particles never cover a cell.
    ctx.beginPath();ctx.rect(0,0,sceneWidth,sceneHeight);ctx.rect(b.x,b.y,width,height);ctx.clip('evenodd');
    ctx.globalCompositeOperation='source-over';ctx.strokeStyle=CYAN;
    for(const [line,alpha]of [[pad*1.8,.055],[pad*.85,.15],[2,.65]]){
      ctx.globalAlpha=alpha*strength*(reduced?.65:1);ctx.lineWidth=line;
      ctx.strokeRect(b.x-1,b.y-1,width+2,height+2);
    }
    if(!reduced){
      const count=tier*8;
      for(let i=0;i<count;i++){
        const progress=(this.time*.12+rand(i+this.bossId*13))%1;
        const right=i%2===1,xx=right?b.x+width+4+rand(i*3)*pad*.6:b.x-4-rand(i*3)*pad*.6;
        const yy=b.y+height*(1-progress),size=1+rand(i*7)*1.3;
        ctx.fillStyle=i%4===0?IVORY:CYAN;ctx.globalAlpha=(.22+.34*strength)*Math.sin(Math.PI*progress);
        ctx.fillRect(xx-size/2,yy-size/2,size,size);
      }
    }
    ctx.restore();
  }
  _setMode(compact) {
    this.compact=!!compact;this.particleLimit=this.compact?120:240;
    for(let i=this.particleLimit;i<this.pool.length;i++)this.pool[i].active=false;
  }
  _drawMomentumAura(ctx,layout,options) {
    const b=layout?.board,value=options.momentum??this.momentumFeedback.value;
    const tier=clamp(Math.floor(options.momentumTier??options.tier??momentumTier(value)),0,4);
    this.displayMomentumTier=tier;
    if(!ctx||!b||!Number.isFinite(b.cell)||b.cell<=0||!tier||options.danger)return;
    const compact=!!options.compact,reduced=!!options.reducedMotion;
    const width=b.cell*(b.cols||10),height=b.cell*(b.rows||20),cx=b.x+width/2,cy=b.y+height/2;
    const sceneWidth=layout.width||1100,sceneHeight=layout.height||680;
    const side=compact?11:16,top=Math.min(options.auraTopSpace??(compact?24:42),b.y-2),bottom=compact?8:14;
    const gain=[0,.42,.62,.82,1][tier]*(reduced?.68:1),color=tier>=4?'#a6fff0':CYAN;
    ctx.save();
    // A narrow outer-only band keeps every live cell and all adjacent HUD panes clear.
    ctx.beginPath();ctx.rect(Math.max(0,b.x-side),Math.max(0,b.y-top),Math.min(sceneWidth,b.x+width+side)-Math.max(0,b.x-side),Math.min(sceneHeight,b.y+height+bottom)-Math.max(0,b.y-top));ctx.clip();
    ctx.beginPath();ctx.rect(0,0,sceneWidth,sceneHeight);ctx.rect(b.x,b.y,width,height);ctx.clip('evenodd');
    ctx.globalCompositeOperation='source-over';ctx.strokeStyle=color;
    for(const [line,alpha]of [[side*2,.13],[side,.27],[tier>=3?4:2,.82]]){
      ctx.globalAlpha=alpha*gain;ctx.lineWidth=line;ctx.strokeRect(b.x-1,b.y-1,width+2,height+2);
    }
    // Tier one is a clean energized frame; every later tier adds a new silhouette.
    if(tier>=2){
      const rays=tier===2?5:tier===3?7:9;
      for(let i=0;i<rays;i++){
        const u=(i+1)/(rays+1),xx=b.x+width*(.16+.68*u);
        const envelope=.55+.45*Math.sin(Math.PI*u),motion=reduced?0:Math.sin(this.time*(2+tier*.35)+i)*1.5;
        const length=Math.max(4,(top-3)*envelope*[0,0,.38,.7,1][tier]+motion);
        const half=compact?3.5:5.5;
        ctx.globalAlpha=(.35+.1*tier)*gain;ctx.fillStyle=i%2?color:IVORY;
        ctx.beginPath();ctx.moveTo(xx-half,b.y-2);ctx.lineTo(xx,b.y-length);ctx.lineTo(xx+half,b.y-2);ctx.closePath();ctx.fill();
      }
      ctx.strokeStyle=IVORY;ctx.globalAlpha=.7*gain;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(b.x+width*.2,b.y-5);ctx.lineTo(b.x+width*.8,b.y-5);ctx.stroke();
    }
    if(tier>=3){
      ctx.strokeStyle=color;ctx.globalAlpha=.8*gain;ctx.lineWidth=tier===4?3:2;
      const fin=compact?7:12;
      for(const yy of [.16,.36,.64,.84])for(const sign of [-1,1]){
        const xx=sign<0?b.x-3:b.x+width+3,y=b.y+height*yy;
        ctx.beginPath();ctx.moveTo(xx,y-fin);ctx.lineTo(xx+sign*(side-4),y);ctx.lineTo(xx,y+fin);ctx.stroke();
      }
    }
    const orbs=tier>=4?8:tier>=3?4:tier>=2?2:0;
    const framePoint=t=>{
      const ww=width+10,hh=height+10,total=2*(ww+hh);let d=(t%1)*total;
      if(d<ww)return{x:b.x-5+d,y:b.y-5};d-=ww;
      if(d<hh)return{x:b.x+width+5,y:b.y-5+d};d-=hh;
      if(d<ww)return{x:b.x+width+5-d,y:b.y+height+5};d-=ww;
      return{x:b.x-5,y:b.y+height+5-d};
    };
    for(let i=0;i<orbs;i++){
      const p=framePoint(i/orbs+(reduced?0:this.time*(.035+tier*.009))),r=tier===4?3.5:2.5;
      ctx.globalAlpha=.8*gain;ctx.fillStyle=IVORY;ctx.beginPath();ctx.moveTo(p.x,p.y-r);ctx.lineTo(p.x+r,p.y);ctx.lineTo(p.x,p.y+r);ctx.lineTo(p.x-r,p.y);ctx.closePath();ctx.fill();
    }
    if(!reduced){
      // Together with the impact pool, total particles never exceed 160/320.
      const counts=compact?[0,8,16,24,32]:[0,12,28,52,72],count=counts[tier];
      for(let i=0;i<count;i++){
        const progress=(this.time*(.13+tier*.025)+rand(i+this.bossId*13))%1;
        const right=i%2===1,xx=right?b.x+width+3+rand(i*3)*(side-4):b.x-3-rand(i*3)*(side-4);
        const yy=b.y+height*(1-progress),size=1.2+rand(i*7)*(tier>=3?2.4:1.2);
        ctx.fillStyle=i%4===0?IVORY:color;ctx.globalAlpha=(.3+.1*tier)*Math.sin(Math.PI*progress)*gain;
        ctx.fillRect(xx-size/2,yy-size/2,size,size);
      }
    }
    const since=this.time-this.momentumFeedback.changedAt;
    if(tier>=2&&since>=0&&since<.65&&!reduced){
      ctx.strokeStyle=IVORY;ctx.lineWidth=1;ctx.globalAlpha=(1-since/.65)*.6;
      const offset=2+since*side;
      ctx.strokeRect(b.x-offset,b.y-offset,width+offset*2,height+offset*2);
    }
    ctx.restore();
  }
  draw(ctx,layout,target,options={}) {
    const b=layout?.board;
    if(!ctx||!b||!target)return;
    this.target={x:target.x,y:target.y};
    this._setMode(options.compact);
    this.reducedMotion=!!options.reducedMotion;
    const reduced=this.reducedMotion;
    const cell=b.cell,cols=b.cols||10,rows=b.rows||20;
    ctx.save();
    ctx.lineCap='round';

    // Recovery is a quiet board edit, never an outgoing attack.
    for(const r of this.repairs) {
      const t=clamp((this.time-r.born)/.28);
      ctx.globalAlpha=(1-t)*.45;ctx.strokeStyle=CYAN;ctx.lineWidth=1;
      const yy=b.y+(r.row+.5)*cell+t*cell*.4;
      ctx.beginPath();ctx.moveTo(b.x,yy);ctx.lineTo(b.x+cols*cell,yy);ctx.stroke();
    }
    if(this.bossPulse>.015) {
      ctx.globalAlpha=this.bossPulse*.45;ctx.strokeStyle=AMBER;ctx.lineWidth=2;
      ctx.strokeRect(b.x-3,b.y-3,cell*cols+6,cell*rows+6);
    }
    if(this.guardPulse>.015){
      ctx.globalAlpha=this.guardPulse*.8;ctx.strokeStyle=CYAN;ctx.lineWidth=reduced?2:3;
      const yy=b.y+cell*rows+2;
      ctx.beginPath();ctx.moveTo(b.x,yy);ctx.lineTo(b.x+cell*cols,yy);ctx.stroke();
    }
    ctx.globalCompositeOperation='lighter';
    for(const a of this.attacks.slice(-6)) {
      const e=a.event,age=this.time-a.born,tier=e.effectTier||0;
      const mean=e.rows.reduce((s,r)=>s+r.row+.5,0)/e.rows.length;
      const emitter={x:b.x+cell*cols+Math.min(10,cell*.38),y:b.y+mean*cell};
      const color=attackColor(e),growth=1+tier*.22;
      const weight=(1.25+e.lines*.62+Math.min(e.combo||1,6)*.12)*growth;
      if(age<.06) {
        const u=clamp(age/.06), gather=1-Math.pow(1-u,3);
        for(const row of e.rows) {
          const yy=b.y+(row.row+.5)*cell;
          ctx.globalAlpha=(1-u)*.48;ctx.strokeStyle=color;ctx.lineWidth=1;
          ctx.strokeRect(b.x+1,yy-cell*.5+1,cell*cols-2,cell-2);
          const colors=row.colors.length?row.colors:Array(10).fill('I');
          for(let i=0;i<Math.min(10,colors.length);i++) {
            const sx=b.x+(i+.5)*cell;
            const px=mix(sx,emitter.x,gather),py=mix(yy,emitter.y,gather);
            ctx.globalAlpha=.85-u*.2;ctx.fillStyle=COLORS[colors[i]]||color;
            // Keep a readable fraction of the removed tile before compression.
            const size=reduced?Math.max(2,cell*.12):mix(cell*.62,Math.max(2.2,cell*.085),gather);
            ctx.fillRect(px-size/2,py-size/2,size,size);
          }
        }
      } else if(age<.18) {
        ctx.save();this._clipFlight(ctx,layout,options);
        const raw=clamp((age-.06)/.12),u=raw*raw;
        const above=target.y<b.y;
        const control={x:mix(emitter.x,target.x,.52),y:mix(emitter.y,target.y,.48)-(reduced?0:32)};
        const route=t=>{
          if(!above)return curve(emitter,control,target,t);
          const corner={x:emitter.x,y:b.y-14};
          return t<.64?{x:emitter.x,y:mix(emitter.y,corner.y,t/.64)}:
            curve(corner,{x:target.x,y:corner.y},target,(t-.64)/.36);
        };
        const pos=route(u),tail=route(Math.max(0,u-(reduced?.2:.12)));
        ctx.globalAlpha=tier>=3?.4:.28;ctx.strokeStyle=color;ctx.lineWidth=Math.min(options.compact?16:40,weight*4);
        ctx.beginPath();ctx.moveTo(tail.x,tail.y);ctx.lineTo(pos.x,pos.y);ctx.stroke();
        ctx.globalAlpha=.95;ctx.lineWidth=weight;
        ctx.beginPath();ctx.moveTo(tail.x,tail.y);ctx.lineTo(pos.x,pos.y);ctx.stroke();
        const unit=options.compact?.65:clamp(cell/27,.8,1.4);
        ctx.fillStyle=IVORY;
        if(e.lines===1){
          // A single line is a sharp dart, not a smaller version of a quad.
          const vertical=Math.abs(pos.y-tail.y)>Math.abs(pos.x-tail.x);
          const ww=(vertical?2.5:7.6)*unit*growth,hh=(vertical?7.6:2.5)*unit*growth;
          ctx.fillRect(pos.x-ww/2,pos.y-hh/2,ww,hh);
        }else if(e.lines<4){
          const merge=clamp((raw-.2)/.55),count=raw<.75?e.lines:1;
          const spread=(1-merge)*(8+tier*2.5)*unit,size=mix(3.5,6,merge)*unit*growth;
          for(let i=0;i<count;i++){
            const angle=(i/count)*TAU-Math.PI/2;
            ctx.fillRect(pos.x+Math.cos(angle)*spread-size/2,pos.y+Math.sin(angle)*spread-size/2,size,size);
          }
        }else{
          const size=14*unit*growth,radius=(reduced?7:mix(14+tier*3,8+tier*2,raw))*unit;
          ctx.fillRect(pos.x-size/2,pos.y-size/2,size,size);
          for(let i=0;i<4;i++){
            const angle=i*Math.PI/2+(reduced?Math.PI/4:raw*Math.PI*.65);
            ctx.fillStyle=i%2?color:IVORY;
            const satellite=(3.6+tier*.9)*unit;
            ctx.fillRect(pos.x+Math.cos(angle)*radius-satellite/2,pos.y+Math.sin(angle)*radius-satellite/2,satellite,satellite);
          }
        }
        if(tier>=2){
          // Momentum adds a silhouette and a bounded train of afterimages, not damage.
          const radius=(7+tier*3)*unit,angle=reduced?Math.PI/4:raw*Math.PI*(e.lines===4?1.8:1);
          ctx.strokeStyle=color;ctx.lineWidth=tier>=4?2:1;ctx.globalAlpha=reduced?.4:.8;
          ctx.beginPath();
          const sides=e.lines===4?8:e.lines>=2?6:4;
          for(let i=0;i<=sides;i++){
            const aa=angle+i/sides*TAU,xx=pos.x+Math.cos(aa)*radius,yy=pos.y+Math.sin(aa)*radius;
            i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);
          }ctx.stroke();
          if(!reduced){
            for(let i=1;i<=tier;i++){
              const echo=route(Math.max(0,u-i*.045)),size=(2+tier*.5)*unit*(1-i/(tier+1));
              ctx.globalAlpha=.4*(1-i/(tier+1));ctx.fillStyle=i%2?color:IVORY;
              ctx.fillRect(echo.x-size/2,echo.y-size/2,size,size);
            }
          }
        }
        ctx.restore();
      } else if(age<(reduced?.29:.44)) {
        ctx.save();this._clipImpact(ctx,layout,target,options);
        const origin=a.impactPoint||target,t=(age-.18)/(reduced?.11:.26);
        ctx.globalAlpha=(1-t)*.7;ctx.strokeStyle=IVORY;ctx.lineWidth=1.5;
        const reach=(9+e.lines*3)*(reduced?.6:1)*growth*(options.compact?.65:1);
        ctx.beginPath();
        ctx.moveTo(origin.x-reach,origin.y);ctx.lineTo(origin.x+reach,origin.y);
        ctx.moveTo(origin.x,origin.y-reach*.65);ctx.lineTo(origin.x,origin.y+reach*.65);
        ctx.stroke();
        if(e.lines>=2){
          const radius=reach*(.6+t),sides=e.lines===4?4:e.lines;
          ctx.globalAlpha=(1-t)*(reduced?.25:.55);ctx.strokeStyle=color;ctx.lineWidth=e.lines===4?2:1;
          ctx.beginPath();
          for(let i=0;i<=sides;i++){
            const angle=i/sides*TAU-Math.PI/4,xx=origin.x+Math.cos(angle)*radius,yy=origin.y+Math.sin(angle)*radius;
            i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);
          }
          ctx.stroke();
        }
        if(tier>=1){
          const rings=reduced?1:Math.min(3,tier),maximum=options.compact?30:145;
          if(!reduced&&tier>=2){
            // A broad, attack-local burst stays visible long enough to read.
            const radius=Math.min(maximum,reach*(.7+Math.sin(t*Math.PI)*1.8));
            ctx.globalAlpha=(1-t)*(tier>=4?.42:.26);ctx.fillStyle=color;
            ctx.beginPath();
            for(let i=0;i<=32;i++){
              const angle=i/32*TAU,r=radius*(i%2?.38:1);
              const xx=origin.x+Math.cos(angle)*r,yy=origin.y+Math.sin(angle)*r;
              i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);
            }ctx.closePath();ctx.fill();
          }
          for(let i=0;i<rings;i++){
            const radius=Math.min(maximum,reach*(.5+t*2.5+i*.32));
            ctx.globalAlpha=(1-t)*(reduced?.24:.62)/(i+1);ctx.strokeStyle=i%2?IVORY:color;ctx.lineWidth=i===0&&tier>=3?2.5:1;
            ctx.beginPath();ctx.ellipse(origin.x,origin.y,radius,radius*(e.lines===4?.75:.45),reduced?0:(i%2?-.4:.4),0,TAU);ctx.stroke();
          }
          if(tier>=3){
            ctx.globalAlpha=(1-t)*(reduced?.18:.72);ctx.strokeStyle=IVORY;ctx.lineWidth=1;
            const rays=tier===4?12:8;
            for(let i=0;i<rays;i++){
              const aa=i/rays*TAU,from=reach*(.4+t*.4),to=Math.min(maximum,from+10+tier*4);
              ctx.beginPath();ctx.moveTo(origin.x+Math.cos(aa)*from,origin.y+Math.sin(aa)*from);ctx.lineTo(origin.x+Math.cos(aa)*to,origin.y+Math.sin(aa)*to);ctx.stroke();
            }
          }
        }
        ctx.restore();
      }
    }
    ctx.save();this._clipImpact(ctx,layout,target,options);
    for(const p of this.pool)if(p.active) {
      if(p.ox===null){p.ox=target.x;p.oy=target.y;}
      const fade=1-p.age/p.life;
      ctx.globalAlpha=fade*.85;ctx.fillStyle=p.color;
      const x=p.ox+p.vx*p.age,y=p.oy+p.vy*p.age+100*p.age*p.age;
      ctx.fillRect(x-p.size/2,y-p.size/2,p.size*fade,p.size*fade);
    }
    ctx.restore();
    ctx.globalCompositeOperation='source-over';ctx.textAlign='center';
    for(const n of this.numbers) {
      const age=this.time-n.born,u=age/.55,origin=n.origin||target;
      ctx.globalAlpha=clamp((1-u)*1.8);
      ctx.font=`600 ${options.compact?(n.large?17:14):(n.large?24:18)}px ui-monospace, monospace`;
      ctx.fillStyle=n.large?AMBER:IVORY;
      ctx.fillText(`−${n.value}`,origin.x+(options.compact?0:15),options.compact?Math.max(16,origin.y+24-age*18):origin.y-45-age*(reduced?18:48));
    }
    ctx.restore();
  }
  _clipFlight(ctx,layout,options) {
    const b=layout.board,w=layout.width||1100,h=layout.height||680;
    ctx.beginPath();ctx.rect(0,0,w,h);ctx.rect(b.x,b.y,b.cell*(b.cols||10),b.cell*(b.rows||20));ctx.clip('evenodd');
    const protectedRegions=options.protectedRegions||(options.compact?[
      {x:76,y:0,width:Math.max(0,w-76),height:68},
      {x:0,y:70,width:w,height:Math.max(0,b.y-82)}
    ]:[]);
    for(const r of protectedRegions)if(r.width>0&&r.height>0){
      ctx.beginPath();ctx.rect(0,0,w,h);ctx.rect(r.x,r.y,r.width,r.height);ctx.clip('evenodd');
    }
  }
  _clipImpact(ctx,layout,target,options) {
    const boss=layout.boss,compact=!!options.compact;
    const width=boss?.w||(compact?64:330),height=boss?.h||(compact?64:350);
    const xx=boss?.x??target.x-width/2,yy=boss?.y??target.y-height/2,pad=compact?2:40;
    ctx.beginPath();ctx.rect(Math.max(0,xx-pad),Math.max(0,yy-pad),width+pad*2,height+pad*2);ctx.clip();
  }
}
