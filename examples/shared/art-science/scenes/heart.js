import {THREE,mesh,line,label,disposeGroup} from '../scene-kit.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {proximalPulmonary} from './heart-surface.js';
import {addMorphPoses} from '../anatomy-motion.js';
import {advanceCycle,cardiacCycle,heartPose} from '../body-motion.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {ASSET_BASE} from '../../asset-base.js';
import {parseSafeQuery} from '../../phi-guard.js';
import {getGlobalPulseVolume,setGlobalPulseVolume} from '../../audio-volume-store.js';
import {createHeartbeatAudio} from '../../../landing/heartbeat-audio.js';

// Local copy under /assets/ by default; VITE_ASSET_BASE points this at the hosted bucket.
const BASE=ASSET_BASE+'heart/';
const PARTS=[
 ['FMA7274','Myocardium','wall'],['FMA3736','Ascending aorta','artery'],['FMA3768','Aortic arch','artery'],
 ['FMA3802','Right coronary artery','coronary'],['FMA3818','Right marginal branch','coronary'],
 ['FMA3862nsn','Anterior interventricular branch','coronary'],['FMA3895','Circumflex branch','coronary'],
 ['FMA4685','Left coronary stem','coronary'],['FMA4706','Coronary sinus','vein'],
 ['FMA4720','Superior vena cava','vein'],['FMA10951','Inferior vena cava','vein'],
 ['FMA7234','Tricuspid valve','valve'],['FMA7235','Mitral valve','valve'],['FMA7246','Pulmonary valve','valve'],
 ['FMA66326','Pulmonary arteries','pulmonary']
];
const CENTER=[21.4,-121.8,1260],SCALE=.024;

// In-memory cache for prepared geometries + morph targets and procedural grain pixels
// so replays and modal previews mount in <5ms with zero main-thread stutter.
const PREPARED_PART_PROMISES=new Map();
let CACHED_GRAIN_CANVAS=null;

const LOAD_PROFILES={
 baseline:{
  label:'Baseline Recovery',
  rate:62,
  intensity:0.18,
  wallColor:'#8c3545',
  coronaryColor:'#d3a26c',
  emissive:'#26070d',
  emissiveGain:0.06,
  recovery:'Full diastolic fill'
 },
 stress:{
  label:'Developer Stress',
  rate:96,
  intensity:0.58,
  wallColor:'#983344',
  coronaryColor:'#e2ab6d',
  emissive:'#58111c',
  emissiveGain:0.18,
  recovery:'Compressed rest window'
 },
 'sleep-debt':{
  label:'72h Sleep Deprivation',
  rate:118,
  intensity:0.86,
  wallColor:'#a82c40',
  coronaryColor:'#f0b36a',
  emissive:'#7a1424',
  emissiveGain:0.32,
  recovery:'Strained recovery'
 },
 tactical:{
  label:'Tactical / Athletic Peak',
  rate:142,
  intensity:1.0,
  wallColor:'#b42b3f',
  coronaryColor:'#f6bd6f',
  emissive:'#8c182a',
  emissiveGain:0.42,
  recovery:'Peak exertion load'
 }
};

function texture(){
 if(!CACHED_GRAIN_CANVAS){
  const size=256;
  const c=document.createElement('canvas');c.width=c.height=size;
  const ctx=c.getContext('2d'),img=ctx.createImageData(size,size);let seed=77;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const i=(y*size+x)*4,v=135+12*Math.sin(x*.154+Math.sin(y*.08)*2)+12*(random()-.5);
   img.data[i]=img.data[i+1]=img.data[i+2]=v;img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  CACHED_GRAIN_CANVAS=c;
 }
 const t=new THREE.CanvasTexture(CACHED_GRAIN_CANVAS);
 t.wrapS=t.wrapT=THREE.RepeatWrapping;
 t.needsUpdate=true;
 return t;
}

function prepare(geometry){
 geometry.deleteAttribute('normal');const p=geometry.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,(x-CENTER[0])*SCALE,(z-CENTER[2])*SCALE,-(y-CENTER[1])*SCALE);}
 const g=mergeVertices(geometry,1e-4);geometry.dispose();g.computeVertexNormals();
 const points=g.attributes.position,uv=new Float32Array(points.count*2);
 for(let i=0;i<points.count;i++){uv[i*2]=points.getX(i)*.65+points.getZ(i)*.18;uv[i*2+1]=points.getY(i)*.65;}
 g.setAttribute('uv',new THREE.BufferAttribute(uv,2));return g;
}

function cloneTemplateGeometry(template){
 const g=template.clone();
 if(template.morphAttributes.position){
  g.morphAttributes.position=template.morphAttributes.position.map(attr=>attr.clone());
 }
 if(template.morphAttributes.normal){
  g.morphAttributes.normal=template.morphAttributes.normal.map(attr=>attr.clone());
 }
 g.morphTargetsRelative=Boolean(template.morphTargetsRelative);
 return g;
}

function loadPreparedPartTemplate(loader,id,type){
 if(!PREPARED_PART_PROMISES.has(id)){
  const promise=(async()=>{
   const response=await fetch(BASE+id+'.stl');
   if(!response.ok)throw new Error(`Missing anatomy asset ${id}`);
   const g=prepare(loader.parse(await response.arrayBuffer()));
   try{if(type==='pulmonary')proximalPulmonary(g);}catch(error){g.dispose();throw error;}
   const holder=new THREE.Mesh(g);
   addMorphPoses(holder,[(x,y,z)=>heartPose(x,y,z,'atrial'),(x,y,z)=>heartPose(x,y,z,'ventricular')]);
   return g;
  })().catch(err=>{
   PREPARED_PART_PROMISES.delete(id);
   throw err;
  });
  PREPARED_PART_PROMISES.set(id,promise);
 }
 return PREPARED_PART_PROMISES.get(id);
}

export async function createScene(){
 const group=new THREE.Group(),heart=new THREE.Group();group.add(heart);
 const safeQuery=typeof window!=='undefined'?parseSafeQuery(window.location.search):{profile:null};
 const initialProfile=safeQuery.profile&&LOAD_PROFILES[safeQuery.profile]?safeQuery.profile:'baseline';
 const profileCfg=LOAD_PROFILES[initialProfile];
 const state={
  phase:0,
  rate:profileCfg.rate,
  profile:initialProfile,
  section:0,
  focus:'all',
  labels:false,
  motion:true,
  audio:false
 };
 let pose=cardiacCycle(0);
 let audioEngine=null;
 let prevAudioPhase=null;

 const heightClip=[new THREE.Plane(new THREE.Vector3(0,1,0),2.03),new THREE.Plane(new THREE.Vector3(0,-1,0),2.25)];
 const pulmonaryClip=[...heightClip,new THREE.Plane(new THREE.Vector3(1,0,0),1.48),new THREE.Plane(new THREE.Vector3(-1,0,0),1.56),new THREE.Plane(new THREE.Vector3(0,0,1),.75)];
 const sectionPlane=new THREE.Plane(new THREE.Vector3(0,0,-1),3);
 const valveSection=new THREE.Plane(new THREE.Vector3(0,0,-1),-.15);
 const grain=texture(),materials={
  wall:new THREE.MeshPhysicalMaterial({color:profileCfg.wallColor,emissive:profileCfg.emissive,emissiveIntensity:0.06,roughness:.78,metalness:0,clearcoat:.05,clearcoatRoughness:.6,bumpMap:grain,bumpScale:.006,roughnessMap:grain,side:THREE.DoubleSide}),
  artery:new THREE.MeshPhysicalMaterial({color:'#b95154',roughness:.4,clearcoat:.18,bumpMap:grain,bumpScale:.008,side:THREE.DoubleSide}),
  pulmonary:new THREE.MeshPhysicalMaterial({color:'#5d8fa0',roughness:.38,clearcoat:.2,side:THREE.DoubleSide}),
  coronary:new THREE.MeshPhysicalMaterial({color:profileCfg.coronaryColor,emissive:'#4f2b0d',emissiveIntensity:0.04,roughness:.32,metalness:.12,clearcoat:.15,side:THREE.DoubleSide}),
  vein:new THREE.MeshPhysicalMaterial({color:'#557e96',roughness:.4,clearcoat:.1,side:THREE.DoubleSide}),
  valve:new THREE.MeshPhysicalMaterial({color:'#d8b4a0',roughness:.54,side:THREE.DoubleSide})
 };
 const loader=new STLLoader(),objects=[];
 // Fetch and prepare all 15 registered parts concurrently with cached morph templates
 try{
  const templates=await Promise.all(PARTS.map(([id,_name,type])=>loadPreparedPartTemplate(loader,id,type)));
  for(let i=0;i<PARTS.length;i++){
   const [id,name,type]=PARTS[i];
   const g=cloneTemplateGeometry(templates[i]);
   const material=materials[type].clone();material.clipShadows=true;
   material.clippingPlanes=type==='wall'?[...heightClip,sectionPlane]:type==='pulmonary'?pulmonaryClip:heightClip;
   const object=mesh(g,material,[0,0,0],heart);object.userData={id,name,type};
   object.updateMorphTargets();object.frustumCulled=false;
   objects.push(object);
  }
 }catch(error){disposeGroup(group);grain.dispose();throw error;}
 finally{Object.values(materials).forEach(m=>m.dispose());}

 const annotations=new THREE.Group();group.add(annotations);
 const marks=[['AORTIC ARCH',[.05,1.52,.4],[1.5,1.9,.3]],['CORONARY NETWORK',[.18,-.32,1.06],[1.8,-.4,.45]],['MYOCARDIUM',[.3,-1.16,.95],[-1.75,-1.4,.55]]];
 for(const [text,anchor,end] of marks){const callout=new THREE.Group();callout.userData={family:text==='MYOCARDIUM'?'wall':text==='CORONARY NETWORK'?'coronary':'artery',anchor:new THREE.Vector3(...anchor)};annotations.add(callout);line([anchor,end],'#ac8e7f',callout,.5);label(text,end,'#d8c1ab',.105,callout);}
 const guide=new THREE.Group();group.add(guide);
 const orbit=Array.from({length:121},(_,i)=>{const a=i/120*Math.PI*2;return[2.35*Math.cos(a),-2.14,1.45*Math.sin(a)];});line(orbit,'#aa8d73',guide,.17);

 function ensureAudio(){
  if(!audioEngine){
   audioEngine=createHeartbeatAudio();
   audioEngine.setStressIntensity(LOAD_PROFILES[state.profile].intensity);
  }
  return audioEngine;
 }

 function applyProfileVisuals(){
  const cfg=LOAD_PROFILES[state.profile]||LOAD_PROFILES.baseline;
  for(const o of objects){
   if(o.userData.type==='wall'){
    o.material.color.set(cfg.wallColor);
    o.material.emissive.set(cfg.emissive);
   }else if(o.userData.type==='coronary'){
    o.material.color.set(cfg.coronaryColor);
   }
  }
  if(audioEngine){
   audioEngine.setStressIntensity(cfg.intensity);
  }
 }

 // A cut surface uses the real wall mesh, never separate floating chamber placeholders.
 function refresh(){
  sectionPlane.constant=state.section===0?3:1.34-state.section*1.72;valveSection.constant=-.15-state.section*.8;annotations.visible=state.labels;
  syncAnnotations();
  applyProfileVisuals();
  for(const o of objects){const selected=state.focus==='all'||o.userData.type===state.focus;
   o.visible=selected||state.focus==='valve'&&o.userData.type==='wall';
   if(o.userData.type==='wall'&&state.focus==='valve')o.material.clippingPlanes=[...heightClip,valveSection];
   else if(o.userData.type==='wall'||o.userData.type==='coronary'||o.userData.type==='vein')o.material.clippingPlanes=[...heightClip,sectionPlane];
  }
 }
 function syncAnnotations(){
  for(const c of annotations.children){
   const a=c.userData.anchor,atrial=heartPose(a.x,a.y,a.z,'atrial'),ventricular=heartPose(a.x,a.y,a.z,'ventricular');
   c.position.set((atrial[0]-a.x)*pose.atrial+(ventricular[0]-a.x)*pose.ventricular,
    (atrial[1]-a.y)*pose.atrial+(ventricular[1]-a.y)*pose.ventricular,
    (atrial[2]-a.z)*pose.atrial+(ventricular[2]-a.z)*pose.ventricular);
   const displayed=a.clone().add(c.position);
   c.visible=(state.focus==='all'||state.focus===c.userData.family)&&(c.userData.family==='artery'||sectionPlane.distanceToPoint(displayed)>=0);
  }
 }
 function update(dt){
  state.phase=advanceCycle(state.phase,dt,state.rate,state.motion);pose=cardiacCycle(state.phase);
  const cfg=LOAD_PROFILES[state.profile]||LOAD_PROFILES.baseline;
  const strainPulse=pose.ventricular*cfg.emissiveGain;
  // All registered parts share the same spatial corrective fields, including the coronary surface.
  for(const o of objects){
   o.morphTargetInfluences[0]=pose.atrial;
   o.morphTargetInfluences[1]=pose.ventricular;
   if(o.userData.type==='wall'){
    o.material.emissiveIntensity=0.05+strainPulse;
   }else if(o.userData.type==='coronary'){
    o.material.emissiveIntensity=0.03+strainPulse*0.55;
   }
  }
  if(state.audio&&state.motion&&dt>0&&audioEngine){
   audioEngine.syncPhase(state.phase);
   prevAudioPhase=state.phase;
  }
  if(state.labels)syncAnnotations();
 }
 function reset(){
  Object.assign(state,{phase:0,rate:LOAD_PROFILES.baseline.rate,profile:'baseline',section:0,focus:'all',labels:false,motion:true,audio:false});
  prevAudioPhase=null;
  audioEngine?.stopSequence?.();
  if(audioEngine&&!audioEngine.isMuted())audioEngine.toggleMute();
  refresh();update(0);
 }
 function dispose(){
  audioEngine?.dispose?.();
  audioEngine=null;
  grain.dispose();
 }
 refresh();update(0);
 return {group,update,reset,dispose,stage:false,lighting:{exposure:.96,key:9,fill:3,rim:9},needsAnimation:()=>state.motion,
  views:{overview:{position:[2.2,1.0,8.2],target:[-.4,.1,0]},detail:{position:[1.2,.2,3.65],target:[.05,-.35,.2]}},
  controls:[
   {id:'heart-profile',label:'Physiological load profile',type:'select',options:[
    {value:'baseline',label:'Baseline Recovery (62 BPM)'},
    {value:'stress',label:'Developer Stress (96 BPM)'},
    {value:'sleep-debt',label:'72h Sleep Deprivation (118 BPM)'},
    {value:'tactical',label:'Tactical / Athletic Peak (142 BPM)'}
   ],get:()=>state.profile,set:v=>{
    if(!LOAD_PROFILES[v])return;
    state.profile=v;
    state.rate=LOAD_PROFILES[v].rate;
    refresh();
   }},
   {id:'heart-focus',label:'Explore the structure',type:'select',options:[{value:'all',label:'Assembled anatomy'},{value:'wall',label:'Myocardial wall'},{value:'coronary',label:'Coronary arteries'},{value:'valve',label:'Internal valves'}],get:()=>state.focus,set:v=>{state.focus=v;refresh();}},
   {id:'heart-section',label:'Open the anterior section',type:'range',min:0,max:1,step:.01,get:()=>state.section,set:v=>{state.section=v;refresh();}},
   {id:'heart-phase',label:'Cardiac cycle · scrub to pause',type:'range',min:0,max:1,step:.01,get:()=>state.phase,set:v=>{state.phase=v;state.motion=false;}},
   {id:'heart-motion',label:'Heartbeat',getLabel:()=>state.motion?'Pause the heartbeat':'Play the heartbeat',type:'button',set:()=>{state.motion=!state.motion;}},
   {id:'heart-audio',label:'Boom-boom audio',getLabel:()=>state.audio?'Mute boom-boom audio':'Enable boom-boom audio',type:'button',set:()=>{
    const engine=ensureAudio();
    state.audio=!state.audio;
    if(state.audio){
     engine.unlock().then(()=>{
      if(engine.isMuted()&&getGlobalPulseVolume()>0)engine.toggleMute();
      engine.setStressIntensity(LOAD_PROFILES[state.profile].intensity);
      engine.playBoomBoom({boost:true,bpm:state.rate});
     });
    }else if(!engine.isMuted()){
     engine.toggleMute();
    }
   }},
   {id:'heart-volume',label:'Global pulse volume (%)',type:'range',min:0,max:100,step:1,get:()=>Math.round(getGlobalPulseVolume()*100),set:v=>setGlobalPulseVolume(v/100)},
   {id:'heart-surge',label:'Trigger boom-boom-boom surge',type:'button',set:()=>{
    const engine=ensureAudio();
    const cfg=LOAD_PROFILES[state.profile]||LOAD_PROFILES.baseline;
    engine.playBoomSequence({beats:3,bpm:state.rate,intensity:cfg.intensity,boost:true});
   }},
   {id:'heart-rate',label:'Illustrative beats / minute',type:'range',min:40,max:150,step:1,get:()=>state.rate,set:v=>state.rate=v},
   {id:'heart-labels',label:'Show / hide anatomical annotations',type:'button',set:()=>{state.labels=!state.labels;refresh();}}
  ],
  stats:()=>{
   const cfg=LOAD_PROFILES[state.profile]||LOAD_PROFILES.baseline;
   return [
    {label:'Load Profile',value:`${cfg.label} · ${Math.round(state.rate)} BPM`},
    {label:'Cardiac Phase',value:`${pose.stage} · ${cfg.recovery}`},
    {label:'Data Boundary',value:'Redacted Synthetic (Zero PHI)'}
   ];
  },
  note:'Illustrative synthetic physiological load profiles (Baseline Recovery, Developer Stress, 72h Sleep Deprivation, and Tactical/Athletic Peak) layered over source-derived BodyParts3D anatomy. Zero real patient data or PHI is ingested or stored. Registered parts retain their relative coordinates; the display is enlarged 24 times when scene units are read as metres. Arterial trees and vena cava are cropped. Cutaways reveal the source wall geometry with open clipping boundaries; no clinical ECG, ejection-fraction, or blood-pressure measurement is implied.',
  craft:'External anatomical geometry with custom real-time materials, physiological load visual cues, synchronized Web Audio boom-boom synthesis, and studio lighting. BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 Japan through the Kevin Moerman STL mirror.',
  sources:[{title:'BodyParts3D — Mitsuhashi et al., 2009',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC2686534/'},{title:'Geometry source and attribution',url:'https://github.com/Kevin-Mattheus-Moerman/BodyParts3D'},{title:'CC Attribution-ShareAlike 2.1 Japan',url:'https://creativecommons.org/licenses/by-sa/2.1/jp/'},{title:'Cardiac cycle — OpenStax',url:'https://openstax.org/books/anatomy-and-physiology-2e/pages/19-3-cardiac-cycle'},{title:'Heart anatomy — OpenStax',url:'https://openstax.org/books/anatomy-and-physiology-2e/pages/19-1-heart-anatomy'}]
 };
}
