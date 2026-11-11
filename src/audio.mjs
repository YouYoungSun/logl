export class AudioDirector {
  constructor(enabled=true){this.enabled=enabled;this.ctx=null;this.voices=[];}
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
  stop(){for(const v of this.voices){try{v.stop();}catch{}}this.voices=[];}
  play(kind,power=1){
    const c=this.ctx;if(!this.enabled||!c||c.state!=='running')return;
    const now=c.currentTime,p=Math.min(4,Math.max(.2,power||1));
    this.voices=this.voices.filter(v=>!v._finished);
    while(this.voices.length>=4){try{this.voices.shift().stop();}catch{}}
    const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(this.master);
    let duration=.06,volume=.10,from=160,to=80;
    if(kind==='clear'){from=600;to=1000;duration=.055;volume=.035;}
    if(kind==='hit'){from=180-p*20;to=55;duration=.09+p*.025;volume=.12+p*.018;}
    if(kind==='boss'){from=72;to=35;duration=.18;volume=.21;}
    if(kind==='lock'){from=130;to=70;duration=.035;volume=.055;}
    if(kind==='hold'){from=320;to=450;duration=.04;volume=.04;}
    o.type=kind==='clear'?'sine':'triangle';o.frequency.setValueAtTime(from,now);o.frequency.exponentialRampToValueAtTime(to,now+duration);
    g.gain.setValueAtTime(.001,now);g.gain.linearRampToValueAtTime(volume,now+.004);g.gain.exponentialRampToValueAtTime(.001,now+duration);
    o.onended=()=>{o._finished=true;o.disconnect();g.disconnect();};o.start(now);o.stop(now+duration+.01);this.voices.push(o);
    if(kind==='hit'&&p>=1.2&&this.noise){
      const n=c.createBufferSource(),ng=c.createGain(),f=c.createBiquadFilter();n.buffer=this.noise;
      f.type='highpass';f.frequency.value=650;ng.gain.setValueAtTime(.055,now);ng.gain.exponentialRampToValueAtTime(.001,now+.075);
      n.connect(f);f.connect(ng);ng.connect(this.master);n.onended=()=>{n.disconnect();f.disconnect();ng.disconnect();};n.start(now);n.stop(now+.08);
    }
  }
}
