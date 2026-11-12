export class AudioDirector {
  constructor(enabled=true){this.enabled=enabled;this.ctx=null;this.voices=[];this.pcAudioActive=false;}
  async unlock(){
    if(!this.enabled)return;
    try{
      if(!this.ctx){
        const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC)return;
        this.ctx=new AC();this.master=this.ctx.createGain();this.master.gain.value=.25;this.master.connect(this.ctx.destination);
        this.noise=this.ctx.createBuffer(1,Math.floor(this.ctx.sampleRate*.15),this.ctx.sampleRate);
        const d=this.noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);
      }
      if(this.ctx.state==='suspended')await this.ctx.resume();
    }catch{/* Visual feedback remains available when audio is blocked. */}
  }
  setEnabled(value){this.enabled=value;if(!value)this.stop();else this.unlock();}
  setPresentationMode(compact){this.pcAudioActive=!compact;}
  stop(){for(const v of this.voices){try{v.stop();}catch{}try{v._noise?.stop();}catch{}}this.voices=[];}
  _reserve(priority){
    this.voices=this.voices.filter(v=>!v._finished);
    if(this.voices.length<4)return true;
    let index=-1;
    for(let i=0;i<this.voices.length;i++)if((this.voices[i]._priority||0)<=priority&&(index<0||(this.voices[i]._priority||0)<(this.voices[index]._priority||0)))index=i;
    if(index<0)return false;
    const old=this.voices.splice(index,1)[0];try{old.stop();}catch{}try{old._noise?.stop();}catch{}return true;
  }
  _tone(from,to,duration,volume,type,priority=1,delay=0){
    if(!this._reserve(priority))return;
    const c=this.ctx,now=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();
    o._priority=priority;o.type=type;o.connect(g);g.connect(this.master);
    o.frequency.setValueAtTime(from,now);o.frequency.exponentialRampToValueAtTime(Math.max(20,to),now+duration);
    g.gain.setValueAtTime(.001,now);g.gain.linearRampToValueAtTime(volume,now+.004);g.gain.exponentialRampToValueAtTime(.001,now+duration);
    o.onended=()=>{o._finished=true;o.disconnect();g.disconnect();};o.start(now);o.stop(now+duration+.01);this.voices.push(o);
  }
  _pcPlay(kind,options){
    const tier=Math.min(4,Math.max(0,options.momentumTier||0));
    if(kind==='hit'){
      const lines=Math.min(4,Math.max(1,Math.round(options.lines||1))),weight=lines/4;
      // Three bounded voices: edge, mass and a quieter delayed metallic tail.
      this._tone(780+lines*95,260,.034,.026,'triangle',3);
      this._tone(180-lines*22-tier*3,42-lines*3,.12+weight*.12,.10+weight*.04,'triangle',3);
      this._tone(310-lines*30,155-lines*15,.19+weight*.16,.018+weight*.012,'sine',3,.026);
    }else if(kind==='clear'){
      this._tone(520+tier*65,850+tier*85,.045,.027,'sine',0);
    }else{
      const base=kind==='discharge'?220:330+tier*55;
      for(let i=0;i<3;i++)this._tone(base*2**(i*4/12),base*2**((i*4+1)/12),.13,.025,'sine',1,i*.055);
    }
  }
  play(kind,power=1,options={}){
    const c=this.ctx;if(!this.enabled||!c||c.state!=='running')return;
    if(options.presentation)this.pcAudioActive=options.presentation==='pc';
    if(options.presentation==='pc'&&['hit','clear','momentum','discharge'].includes(kind)){this._pcPlay(kind,options);return;}
    const now=c.currentTime,p=Math.min(4,Math.max(.2,power||1));
    const momentumTier=Math.min(4,Math.max(0,options.momentumTier||0));
    const priority=this.pcAudioActive?(kind==='hit'?3:kind==='boss'?2:0):0;
    if(!this._reserve(priority))return;
    const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(this.master);
    o._priority=priority;
    let duration=.06,volume=.10,from=160,to=80;
    if(kind==='clear'){
      const combo=Math.min(6,Math.max(1,options.combo||1));
      const semitones=(combo>=6?7:combo>=3?4:combo>=2?2:0)+momentumTier,ratio=2**(semitones/12);
      from=600*ratio;to=1000*ratio;duration=combo===3||combo===6?.07:.055;volume=.035;
    }
    if(kind==='hit'){
      const lines=Math.min(4,Math.max(1,Math.round(options.lines||1)));
      const profiles=[null,[220,85,.085,.10],[175,62,.115,.13],[145,50,.14,.15],[110,36,.19,.18]];
      [from,to,duration,volume]=profiles[lines];
      // Weight comes from pitch and duration, never unbounded loudness.
      from-=Math.min(6,Math.max(1,options.combo||1))*1.5;
      from-=momentumTier*6;to*=1-momentumTier*.035;duration+=momentumTier*.012;
    }
    if(kind==='boss'){from=72;to=35;duration=.18;volume=.21;}
    if(kind==='lock'){from=130;to=70;duration=.035;volume=.055;}
    if(kind==='hold'){from=320;to=450;duration=.04;volume=.04;}
    o.type=kind==='clear'?'sine':kind==='hit'&&momentumTier>=3?'sawtooth':'triangle';
    if(kind==='hit'&&momentumTier>=3)volume*=.85;
    o.frequency.setValueAtTime(from,now);o.frequency.exponentialRampToValueAtTime(to,now+duration);
    g.gain.setValueAtTime(.001,now);g.gain.linearRampToValueAtTime(volume,now+.004);g.gain.exponentialRampToValueAtTime(.001,now+duration);
    o.onended=()=>{o._finished=true;o.disconnect();g.disconnect();};o.start(now);o.stop(now+duration+.01);this.voices.push(o);
    if(kind==='hit'&&(options.lines>=2||momentumTier>=3||!options.lines&&p>=1.2)&&this.noise){
      const n=c.createBufferSource(),ng=c.createGain(),f=c.createBiquadFilter();n.buffer=this.noise;
      o._noise=n;f.type=options.lines>=4||momentumTier>=3?'lowpass':'highpass';f.frequency.value=momentumTier>=3?800:options.lines>=4?1100:650;
      ng.gain.setValueAtTime(options.lines>=4?.045:.025,now);ng.gain.exponentialRampToValueAtTime(.001,now+.075);
      n.connect(f);f.connect(ng);ng.connect(this.master);n.onended=()=>{n.disconnect();f.disconnect();ng.disconnect();};n.start(now);n.stop(now+.08);
    }
  }
}
