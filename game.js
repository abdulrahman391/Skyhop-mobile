import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const keys = new Set();
  let started = false, last = performance.now(), elapsed = 0, gemsFound = 0, hearts = 3;
  let peer = null, conn = null, isHost = false, roomCode = '', netMode = 'solo', remoteInput = {}, lastNet = 0;
  let renderer, scene, camera, worldRoot, playerMesh, buddyMesh, goalMesh;
  const clock = new THREE.Clock();
  const HEROES = [
    {name:'Pip', title:'THE SPRINGY', color:0x55e6ad, accent:0xffd66f, speed:7.6, jump:11.7},
    {name:'Rook', title:'THE DASHER', color:0xff8876, accent:0x80dfff, speed:9.0, jump:10.5},
    {name:'Nova', title:'THE STARBOUND', color:0x9b8cff, accent:0xffdd76, speed:7.1, jump:13.0},
    {name:'Mochi', title:'THE BOUNCER', color:0xffc85c, accent:0xff8ecf, speed:7.3, jump:12.2}
  ];
  let heroIndex = 0;
  const world = { platforms:[], coins:[], enemies:[], particles:[], checkpoints:[], width:0 };
  const actors = {
    one: {x:0,y:2,z:0,vx:0,vy:0,vz:0,ground:false,dir:1,walk:0,inv:0,coins:0,hearts:3,hero:0},
    two: {x:2,y:2,z:0,vx:0,vy:0,vz:0,ground:false,dir:1,walk:0,inv:0,coins:0,hearts:3,hero:1}
  };
  const colors = {sky:0x82d6f0, grass:0x65ce83};
  function setup3D(){
    scene = new THREE.Scene(); scene.background = new THREE.Color(colors.sky); scene.fog = new THREE.Fog(0x82d6f0, 28, 95);
    camera = new THREE.PerspectiveCamera(52, 1, .1, 180); camera.position.set(0,9,18);
    renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false}); renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.12;
    scene.add(new THREE.HemisphereLight(0xdff8ff,0x49634b,2.0));
    const sun = new THREE.DirectionalLight(0xfff2d1,3.2); sun.position.set(-12,24,16); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-45;sun.shadow.camera.right=45;sun.shadow.camera.top=35;sun.shadow.camera.bottom=-35; scene.add(sun);
    worldRoot = new THREE.Group(); scene.add(worldRoot);
    buildWorld(); createActorMesh(actors.one, HEROES[0]); createActorMesh(actors.two,HEROES[1]);
    resize(); window.addEventListener('resize',resize);
  }
  function mat(color,roughness=.78){return new THREE.MeshStandardMaterial({color,roughness});}
  function box(parent,x,y,z,w,h,d,material,opts={}){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=opts.cast!==false;m.receiveShadow=true;parent.add(m);return m;}
  function platform(x,y,z,w,d,top=0x6bce83){
    const group=new THREE.Group(); group.position.set(x,y,z); worldRoot.add(group);
    box(group,0,-.38,0,w,.76,d,mat(0x9a694b));
    box(group,0,.02,0,w+.08,.18,d+.08,mat(top));
    // bright edge and small grassy tufts
    box(group,0,-.08,d/2-.04,w,.08,.1,mat(0x4ba96b));
    for(let i=0;i<Math.max(2,Math.floor(w/2.2));i++){
      const gx=-w/2+.65+i*(w-1.3)/Math.max(1,Math.floor(w/2.2)-1);
      const tuft=new THREE.Mesh(new THREE.ConeGeometry(.12,.35,4),mat(i%2?0x3f9e62:0x8fe18a));tuft.position.set(gx,.23,-d*.28+(i%3)*.45);tuft.rotation.z=(i%2?-.25:.25);group.add(tuft);
    }
    world.platforms.push({x,y:y+.11,z,w,d,top:y+.11}); return group;
  }
  function tree(x,z,s=1){const g=new THREE.Group();g.position.set(x,0,z);worldRoot.add(g);const trunk= new THREE.Mesh(new THREE.CylinderGeometry(.16*s,.23*s,1.1*s,7),mat(0x95633f));trunk.position.y=.55*s;g.add(trunk);const crown=new THREE.Mesh(new THREE.SphereGeometry(.78*s,10,8),mat(0x45b975));crown.position.set(0,1.35*s,0);crown.castShadow=true;g.add(crown);const crown2=new THREE.Mesh(new THREE.SphereGeometry(.48*s,9,7),mat(0x7ce08b));crown2.position.set(.35*s,1.65*s,.1*s);g.add(crown2);}
  function coin(x,y,z){const g=new THREE.Group();g.position.set(x,y,z);worldRoot.add(g);const m=new THREE.Mesh(new THREE.TorusGeometry(.33,.13,8,18),mat(0xffd75e,.28));m.rotation.x=Math.PI/2;g.add(m);const core=new THREE.Mesh(new THREE.SphereGeometry(.14,8,8),mat(0xfff0a3,.2));g.add(core);world.coins.push({mesh:g,x,y,z,taken:false,phase:Math.random()*6});}
  function enemy(x,z,range=2){const g=new THREE.Group();g.position.set(x,.5,z);worldRoot.add(g);const body=new THREE.Mesh(new THREE.SphereGeometry(.55,14,12),mat(0xf77d82));body.scale.y=.78;body.castShadow=true;g.add(body);const white=mat(0xfff4df),black=mat(0x243448);for(const ex of [-.19,.19]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.12,8,8),white);eye.position.set(ex,.1,.45);g.add(eye);const pupil=new THREE.Mesh(new THREE.SphereGeometry(.055,8,8),black);pupil.position.set(ex+.025,.08,.55);g.add(pupil);}world.enemies.push({mesh:g,x,z,base:x,range,phase:Math.random()*4,alive:true});}
  function buildWorld(){
    worldRoot.clear();world.platforms=[];world.coins=[];world.enemies=[];world.particles=[];world.checkpoints=[];
    // a long, gently winding obstacle course in 3D space
    platform(0,0,0,12,10,0x6ed58b);
    platform(10,.25,-2,6,6,0x85dc8a);
    platform(17,.55,2,5,5,0x71cfa2);
    platform(24,.2,6,7,6,0xf2ce72);
    platform(32,.65,3,5,5,0x7ac9ed);
    platform(39,1.0,-2,7,6,0x9c91ef);
    platform(48,.7,-6,6,6,0xffad91);
    platform(56,1.15,-2,8,7,0x75d8a4);
    platform(65,1.5,3,6,6,0xffd36f);
    platform(73,1.0,7,10,8,0x6fd0a3);
    // stepping stones for alternate routes
    platform(8,1.05,5,3.2,3.2,0xffad91);platform(20,1.7,-4,3,3,0x9e9af3);platform(35,2.25,7,3,3,0x78d6ea);platform(52,2.1,3,3.2,3.2,0xffcc70);platform(62,2.55,-5,3.2,3.2,0xffa4b6);
    // decorative trees and flowers
    [[-4,-3,1.2],[3,3,.9],[10,-4,.8],[24,7,.75],[39,0,.8],[56,-4,.85],[72,4,1.1],[76,9,.75]].forEach(a=>tree(a[0],a[1],a[2]));
    [[-1,1,0],[2,-1,0],[9,5,1.05],[10,-2,1.2],[17,2,1.35],[24,6,1.25],[32,3,1.7],[39,-2,2],[48,-6,1.7],[56,-2,2.15],[65,3,2.5],[73,7,2]].forEach(a=>coin(a[0],a[2]+1.35,a[1]));
    enemy(10,-2,1.5);enemy(24,6,2);enemy(39,-2,2.2);enemy(56,-2,2);enemy(69,6,1.5);
    // finish arch and pennant
    const arch=new THREE.Group();arch.position.set(76,1.2,7);worldRoot.add(arch);box(arch,-1,1.4,0,.35,2.8,.4,mat(0xf9f2d6));box(arch,1,1.4,0,.35,2.8,.4,mat(0xf9f2d6));box(arch,0,2.75,0,2.3,.35,.4,mat(0xffd56d));const flag=new THREE.Mesh(new THREE.PlaneGeometry(1.5,.9),new THREE.MeshStandardMaterial({color:0xff6f85,side:THREE.DoubleSide}));flag.position.set(.5,2.3,.25);arch.add(flag);goalMesh=arch;
    // clouds are soft spheres way behind the course
    const cloudMat=mat(0xffffff);for(let i=0;i<18;i++){const cg=new THREE.Group();cg.position.set((i*9)%95-7,7+(i%4)*2,-12-(i%3)*3);scene.add(cg);for(let j=0;j<4;j++){const c=new THREE.Mesh(new THREE.SphereGeometry(.8+(j%2)*.25,9,7),cloudMat);c.position.set(j*.8,Math.sin(j)*.2,0);cg.add(c);}world.particles.push({cloud:cg,speed:.15+(i%3)*.08});}
  }
  function createActorMesh(actor,hero){
    const old=actor===actors.one?playerMesh:buddyMesh;if(old)scene.remove(old);
    const root=new THREE.Group();scene.add(root);const bodyMat=mat(hero.color),accent=mat(hero.accent),skin=mat(0xffdfb8),dark=mat(0x26364b),white=mat(0xffffff);
    const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.38,.45,4,8),bodyMat);torso.position.y=1.05;torso.castShadow=true;root.add(torso);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.42,14,12),skin);head.position.y=1.77;head.castShadow=true;root.add(head);
    // distinctive original character silhouettes
    if(actor.hero===0||hero.name==='Pip'){const ears=[-.28,.28];ears.forEach(x=>{const e=new THREE.Mesh(new THREE.ConeGeometry(.16,.52,7),accent);e.position.set(x,2.22,0);e.rotation.z=x<0?.2:-.2;root.add(e);});}
    else if(hero.name==='Rook'){const cap=new THREE.Mesh(new THREE.CylinderGeometry(.43,.48,.17,12),accent);cap.position.y=2.13;root.add(cap);const brim=new THREE.Mesh(new THREE.BoxGeometry(.65,.08,.26),accent);brim.position.set(0,2.07,.28);root.add(brim);}
    else if(hero.name==='Nova'){const horn=new THREE.Mesh(new THREE.ConeGeometry(.2,.55,7),accent);horn.position.set(0,2.3,0);root.add(horn);}
    else {const hat=new THREE.Mesh(new THREE.SphereGeometry(.44,12,9),accent);hat.scale.set(1,.42,1);hat.position.y=2.08;root.add(hat);}
    for(const x of [-.15,.15]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.075,8,8),white);eye.position.set(x,1.83,.36);root.add(eye);const pupil=new THREE.Mesh(new THREE.SphereGeometry(.038,7,7),dark);pupil.position.set(x+.01,1.82,.425);root.add(pupil);}
    const feet=[];for(const x of [-.22,.22]){const f=new THREE.Mesh(new THREE.SphereGeometry(.22,9,7),dark);f.scale.set(1,.55,1.3);f.position.set(x,.24,.08);root.add(f);feet.push(f);}actor.feet=feet;actor.mesh=root;actor.body=torso;
    if(actor===actors.one)playerMesh=root;else buddyMesh=root;
  }
  function resize(){if(!renderer)return;const r=canvas.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix();}
  function toast(s){const t=$('toast');t.textContent=s;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2300)}
  function setStatus(a,b){$('netLabel').textContent=a;$('buddyStatus').textContent=b}
  function begin(){started=true;$('startOverlay').classList.add('hidden');last=performance.now();toast('Adventure on! Collect the sky coins ✨');}
  $('startBtn').onclick=begin;
  function inputState(){return{left:keys.has('ArrowLeft')||keys.has('a')||keys.has('A'),right:keys.has('ArrowRight')||keys.has('d')||keys.has('D'),up:keys.has('ArrowUp')||keys.has('w')||keys.has('W'),down:keys.has('ArrowDown')||keys.has('s')||keys.has('S'),jump:keys.has(' ')||keys.has('Space')||keys.has('jump')};}
  function topUnder(p){let top=-999;for(const q of world.platforms){if(Math.abs(p.x-q.x)<=q.w/2-.1&&Math.abs(p.z-q.z)<=q.d/2-.1&&p.y>=q.top-.15&&p.y<q.top+1.15)top=Math.max(top,q.top);}return top;}
  function emit(x,y,z,color=0xffdf75,count=9){for(let i=0;i<count;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(.055,5,5),mat(color));m.position.set(x,y,z);scene.add(m);world.particles.push({mesh:m,life:.55,vx:(Math.random()-.5)*4,vy:1+Math.random()*4,vz:(Math.random()-.5)*4});}}
  function respawn(p){p.x=0;p.y=1.4;p.z=0;p.vx=p.vy=p.vz=0;p.inv=1.4;p.ground=false;}
  function move(p,input,dt,actor){
    const hero=HEROES[p.hero||0];let dx=(input.right?1:0)-(input.left?1:0),dz=(input.down?1:0)-(input.up?1:0);const n=Math.hypot(dx,dz)||1;dx/=n;dz/=n;
    const targetX=dx*hero.speed,targetZ=dz*hero.speed;p.vx=THREE.MathUtils.damp(p.vx,targetX,dx?12:16,dt);p.vz=THREE.MathUtils.damp(p.vz,targetZ,dz?12:16,dt);p.x+=p.vx*dt;p.z+=p.vz*dt;p.x=THREE.MathUtils.clamp(p.x,-5,81);p.z=THREE.MathUtils.clamp(p.z,-11,12);
    if(Math.abs(dx)+Math.abs(dz)>.1){p.dir=dx||p.dir;p.walk+=dt*12;}else p.walk+=dt*2;
    if(input.jump&&p.ground){p.vy=hero.jump;p.ground=false;emit(p.x,p.y,p.z,hero.accent,5);}
    const oldY=p.y;p.y+=p.vy*dt;p.vy-=25*dt;const floor=topUnder(p);if(p.vy<=0&&floor>-900&&oldY>=floor-.05&&p.y<=floor+.12){p.y=floor;p.vy=0;p.ground=true;}else p.ground=false;
    if(p.y< -8){if(p===actors.one){hearts--;if(hearts<=0)hearts=3;$('heartCount').textContent=hearts;toast('Whoops! Back to the last island.');}respawn(p);}
    p.inv=Math.max(0,p.inv-dt);
    if(actor){actor.mesh.position.set(p.x,p.y,p.z);actor.mesh.rotation.y=p.dir>0?0:Math.PI;actor.mesh.rotation.z=p.ground?Math.sin(p.walk)*.05:0;actor.body.scale.y=p.ground?1+Math.sin(p.walk*2)*.035:1.06;actor.feet.forEach((f,i)=>{f.position.z=.08+Math.sin(p.walk+(i*Math.PI))*Math.abs(p.vx+p.vz)*.015;});actor.mesh.visible=!(p.inv>0&&Math.floor(elapsed*16)%2===0);}
  }
  function updateWorld(dt){
    world.coins.forEach(c=>{if(c.taken)return;c.mesh.rotation.y+=dt*2.2;c.mesh.position.y=c.y+Math.sin(elapsed*3+c.phase)*.16;for(const p of [actors.one,actors.two])if(Math.hypot(p.x-c.x,p.z-c.z)<.85&&Math.abs(p.y-c.y)<1.4){c.taken=true;c.mesh.visible=false;p.coins++;if(p===actors.one)gemsFound++;emit(c.x,c.y,c.z,0xffd65f,12);$('gemCount').textContent=gemsFound+' / '+world.coins.length;$('progressFill').style.width=(gemsFound/world.coins.length*100)+'%';$('progressText').textContent=Math.round(gemsFound/world.coins.length*100)+'%';toast('Coin collected! ✦');}});
    world.enemies.forEach(e=>{if(!e.alive)return;e.phase+=dt*2;e.mesh.position.x=e.base+Math.sin(e.phase)*e.range;e.mesh.position.y=.48+Math.abs(Math.sin(e.phase*2))*.12;e.mesh.scale.y=.92+Math.sin(e.phase*2)*.08;for(const p of [actors.one,actors.two]){if(Math.hypot(p.x-e.mesh.position.x,p.z-e.z)<.85&&p.y<e.mesh.position.y+1.25&&p.inv<=0){if(p.vy< -2&&p.y>e.mesh.position.y+.55){e.alive=false;e.mesh.visible=false;p.vy=8;emit(e.mesh.position.x,.8,e.z,0xff8c8c,18);toast('Boing! Enemy bounced!');setTimeout(()=>{e.alive=true;e.mesh.visible=true},6500);}else{p.inv=1.4;p.vx=p.x<e.mesh.position.x?-5:5;if(p===actors.one){hearts=Math.max(0,hearts-1);if(!hearts)hearts=3;$('heartCount').textContent=hearts;toast('Ouch! Watch those bouncy bugs!');}}}}});
    if(actors.one.x>73&&actors.one.z>4&&actors.one.y<4){toast('Island cleared! Amazing jump!');actors.one.x=0;actors.one.y=2;actors.one.z=0;gemsFound=0;world.coins.forEach(c=>{c.taken=false;c.mesh.visible=true;});$('gemCount').textContent='0 / '+world.coins.length;$('progressFill').style.width='0%';$('progressText').textContent='0%';}
    world.particles=world.particles.filter(p=>{if(p.cloud){p.cloud.position.x-=p.speed*dt;if(p.cloud.position.x<-18)p.cloud.position.x=86;return true;}if(p.mesh){p.life-=dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;p.vy-=8*dt;p.mesh.material.transparent=true;p.mesh.material.opacity=Math.max(0,p.life/.55);if(p.life<=0){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();return false;}return true;}return false;});
  }
  function tick(dt){elapsed+=dt;const inp=inputState();if(netMode==='host'){move(actors.one,inp,dt,actors.one);move(actors.two,remoteInput,dt,actors.two);if(conn&&conn.open&&performance.now()-lastNet>45){lastNet=performance.now();conn.send({type:'state',one:pack(actors.one),two:pack(actors.two),coins:world.coins.map(c=>c.taken),gems:gemsFound,hearts});}}else if(netMode==='client'){move(actors.two,inp,dt,actors.two);if(conn&&conn.open&&performance.now()-lastNet>35){lastNet=performance.now();conn.send({type:'input',input:inp,hero:heroIndex});}}else{move(actors.one,inp,dt,actors.one);move(actors.two,{left:false,right:false,up:false,down:false,jump:false},dt,actors.two);}
    if(netMode!=='client')updateWorld(dt);else {world.enemies.forEach(e=>{e.phase+=dt*2;e.mesh.position.x=e.base+Math.sin(e.phase)*e.range;});world.coins.forEach(c=>{if(!c.taken){c.mesh.rotation.y+=dt*2.2;c.mesh.position.y=c.y+Math.sin(elapsed*3+c.phase)*.16;}});}
    const followed=netMode==='client'?actors.two:actors.one;const target=new THREE.Vector3(followed.x-1,followed.y+3.2,followed.z+13.5);camera.position.lerp(target,.075);camera.lookAt(followed.x+2,followed.y+1,followed.z);renderer.render(scene,camera);
  }
  function pack(p){return{x:p.x,y:p.y,z:p.z,vx:p.vx,vy:p.vy,vz:p.vz,ground:p.ground,dir:p.dir,walk:p.walk,inv:p.inv,hero:p.hero};}
  function applyPack(p,d){Object.assign(p,d);}
  function loop(){const dt=Math.min(clock.getDelta(),.04);if(started)tick(dt);else{elapsed+=dt;world.coins.forEach(c=>{if(!c.taken){c.mesh.rotation.y+=dt*1.8;c.mesh.position.y=c.y+Math.sin(elapsed*3+c.phase)*.16;}});camera.position.lerp(new THREE.Vector3(3,10,18),.03);camera.lookAt(10,1,0);renderer.render(scene,camera);}requestAnimationFrame(loop);}
  window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Space'].includes(e.key))e.preventDefault();keys.add(e.key);if(!started&&e.key==='Enter')begin();if(e.key==='Escape')toast('Tap the game area to continue your adventure.');});
  window.addEventListener('keyup',e=>keys.delete(e.key));
  window.addEventListener('blur',()=>keys.clear());
  // Hold-to-move touch controls. Global release handling prevents a stuck direction
  // if the player slides their thumb away from a button or the browser interrupts touch.
  const heldPointers=new Map();
  function releasePointer(e){const k=heldPointers.get(e.pointerId);if(k){keys.delete(k);heldPointers.delete(e.pointerId);}}
  document.querySelectorAll('[data-key]').forEach(btn=>{
    const k=btn.dataset.key;
    btn.addEventListener('contextmenu',e=>e.preventDefault());
    btn.addEventListener('pointerdown',e=>{e.preventDefault();if(!started)begin();keys.add(k);heldPointers.set(e.pointerId,k);try{btn.setPointerCapture(e.pointerId);}catch(_){}btn.classList.add('pressed');});
    btn.addEventListener('pointerup',releasePointer);btn.addEventListener('pointercancel',releasePointer);btn.addEventListener('lostpointercapture',releasePointer);
    btn.addEventListener('pointerup',()=>btn.classList.remove('pressed'));btn.addEventListener('pointercancel',()=>btn.classList.remove('pressed'));btn.addEventListener('lostpointercapture',()=>btn.classList.remove('pressed'));
  });
  const jb=$('jumpBtn');
  jb.addEventListener('contextmenu',e=>e.preventDefault());
  jb.addEventListener('pointerdown',e=>{e.preventDefault();if(!started)begin();keys.add('jump');heldPointers.set(e.pointerId,'jump');try{jb.setPointerCapture(e.pointerId);}catch(_){}jb.classList.add('pressed');});
  jb.addEventListener('pointerup',releasePointer);jb.addEventListener('pointercancel',releasePointer);jb.addEventListener('lostpointercapture',releasePointer);
  ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>jb.addEventListener(ev,()=>jb.classList.remove('pressed')));
  window.addEventListener('pointerup',releasePointer);window.addEventListener('pointercancel',releasePointer);
  canvas.addEventListener('pointerdown',()=>{if(!started)begin();});
  // Original character picker
  const picker=document.createElement('div');picker.className='hero-picker';picker.innerHTML='<span>CHOOSE YOUR HERO</span>'+HEROES.map((h,i)=>`<button type="button" data-hero="${i}" class="hero-choice ${i===0?'selected':''}" style="--hero:#${h.color.toString(16).padStart(6,'0')}">${h.name}</button>`).join('');$('startOverlay').querySelector('.overlay-card').insertBefore(picker,$('startBtn'));
  picker.querySelectorAll('[data-hero]').forEach(b=>b.onclick=()=>{heroIndex=Number(b.dataset.hero);actors.one.hero=heroIndex;actors.one._shownHero=heroIndex;createActorMesh(actors.one,HEROES[heroIndex]);picker.querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));toast(HEROES[heroIndex].name+' selected! '+HEROES[heroIndex].title);});
  function cleanup(){try{if(conn)conn.close();if(peer)peer.destroy();}catch(e){}conn=null;peer=null;isHost=false;roomCode='';netMode='solo';remoteInput={};$('roomDisplay').textContent='ROOM — — — — — —';$('buddyName').textContent='Player 2';$('buddyDot').className='status-idle';$('hostBtn').disabled=false;$('hostBtn').textContent='CREATE ROOM';setStatus('SOLO EXPLORER','Waiting for a friend…');}
  function setupConn(c,hostSide){conn=c;conn.on('open',()=>{netMode=hostSide?'host':'client';$('buddyName').textContent=hostSide?'Player 2':'Player 1';$('buddyDot').className='status-check';$('buddyDot').textContent='✓';setStatus('CONNECTED · CO-OP','Connected and ready!');$('youStatus').textContent='Online and exploring';toast('Friend connected! Co-op is live 🎉');if(!started)begin();if(!hostSide){actors.two.hero=heroIndex;createActorMesh(actors.two,HEROES[heroIndex]);actors.two._shownHero=heroIndex;conn.send({type:'input',input:inputState(),hero:heroIndex});}});conn.on('data',data=>{if(!data)return;if(hostSide&&data.type==='input'){remoteInput=data.input||{};if(Number.isInteger(data.hero)&&data.hero!==actors.two.hero){actors.two.hero=data.hero;createActorMesh(actors.two,HEROES[data.hero]||HEROES[1]);actors.two._shownHero=data.hero;}}if(!hostSide&&data.type==='state'){applyPack(actors.one,data.one);applyPack(actors.two,data.two);if(actors.one.mesh){actors.one.mesh.position.set(actors.one.x,actors.one.y,actors.one.z);actors.one.mesh.rotation.y=actors.one.dir>0?0:Math.PI;}if(actors.two.mesh){actors.two.mesh.position.set(actors.two.x,actors.two.y,actors.two.z);actors.two.mesh.rotation.y=actors.two.dir>0?0:Math.PI;}if(actors.one.hero!==actors.one._shownHero){createActorMesh(actors.one,HEROES[actors.one.hero]||HEROES[0]);actors.one._shownHero=actors.one.hero;}gemsFound=data.gems;hearts=data.hearts;$('gemCount').textContent=gemsFound+' / '+world.coins.length;$('heartCount').textContent=hearts;$('progressFill').style.width=(gemsFound/world.coins.length*100)+'%';$('progressText').textContent=Math.round(gemsFound/world.coins.length*100)+'%';if(Array.isArray(data.coins))world.coins.forEach((c,i)=>{c.taken=!!data.coins[i];c.mesh.visible=!c.taken;});if(HEROES[actors.one.hero])createActorMesh(actors.one,HEROES[actors.one.hero]);}});conn.on('close',()=>{toast('Friend disconnected');cleanup();});conn.on('error',e=>toast('Connection issue: '+(e.type||'try again')));}
  $('hostBtn').onclick=()=>{if(!window.Peer){toast('Online connection library did not load. Refresh and try again.');return;}cleanup();isHost=true;roomCode=Math.random().toString(36).slice(2,8).toUpperCase();$('roomDisplay').textContent='ROOM '+roomCode;setStatus('OPENING ROOM…','Waiting for a friend…');$('hostBtn').textContent='ROOM CREATED';$('hostBtn').disabled=true;peer=new Peer('skyhop-'+roomCode.toLowerCase(),{debug:0});peer.on('open',()=>{netMode='host';toast('Room '+roomCode+' is ready — share the code!');});peer.on('connection',c=>{if(conn&&conn.open){c.close();return;}setupConn(c,true);});peer.on('error',e=>{toast(e.type==='unavailable-id'?'Room code collision. Create a new room.':'Could not open room. Try again.');$('hostBtn').disabled=false;$('hostBtn').textContent='CREATE ROOM';cleanup();});};
  $('joinBtn').onclick=()=>{if(!window.Peer){toast('Online connection library did not load. Refresh and try again.');return;}const code=$('roomInput').value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(code.length<4){toast('Enter the room code first.');return;}cleanup();roomCode=code;setStatus('CONNECTING…','Connecting to host…');peer=new Peer(undefined,{debug:0});peer.on('open',()=>{const c=peer.connect('skyhop-'+code.toLowerCase(),{reliable:true});setupConn(c,false);setTimeout(()=>{if(!conn||!conn.open)toast('Still connecting… check the room code and host.');},4000);});peer.on('error',()=>toast('Could not connect. Check the code and try again.'));};
  $('copyBtn').onclick=async()=>{if(!roomCode){toast('Create a room first.');return;}try{await navigator.clipboard.writeText(roomCode);toast('Room code copied!');}catch(e){$('roomInput').value=roomCode;toast('Room code is shown above.');}};
  try{setup3D();loop();}catch(err){console.error(err);toast('3D graphics could not start. Try a modern browser.');}
})();
