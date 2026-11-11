/** Requires a new deliberate input; a held key/pointer cannot skip the review. */
export class DeathReview {
  constructor(){this.close();}
  open(keys=[],pointers=[]){this.active=true;this.keys=new Set(keys);this.pointers=new Set(pointers);}
  close(){this.active=false;this.keys=new Set();this.pointers=new Set();}
  releaseKey(code){this.keys.delete(code);}
  releasePointer(id){this.pointers.delete(id);}
  keyDown(code,{repeat=false,ctrlKey=false,metaKey=false,altKey=false}={}){
    if(!this.active||repeat||this.keys.has(code)||ctrlKey||metaKey||altKey)return false;
    if(/^(Shift|Control|Alt|Meta)/.test(code)||['Tab','CapsLock','NumLock'].includes(code))return false;
    this.close();return true;
  }
  pointerDown(id){if(!this.active||this.pointers.has(id))return false;this.close();return true;}
}
