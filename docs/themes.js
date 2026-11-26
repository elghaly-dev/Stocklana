(function(){
  var KEY='house-theme';
  // Midnight is the elghaly.dev page night with its lapis glow.
  var NIGHT='radial-gradient(120% 60% at 50% -10%, rgba(42, 76, 179, .30), transparent 60%), radial-gradient(80% 50% at 50% 110%, rgba(196, 161, 236, .10), transparent 70%), #07080c';
  var THEMES={
    midnight:{bg:'#0b1214',ink:'#e8fbf6',dim:'#9ab3ad',accent:'#2ee6c7',card:'#121a19',line:'rgba(46,230,199,.22)',dot:'#2ee6c7'},
    dawn:{bg:'#f4f1ea',ink:'#1a1814',dim:'#5c574e',accent:'#0f766e',card:'#fffaf3',line:'rgba(15,118,110,.22)',dot:'#e8efe8'},
    nord:{bg:'#2e3440',ink:'#eceff4',dim:'#88c0d0',accent:'#88c0d0',card:'#3b4252',line:'rgba(136,192,208,.28)',dot:'#88c0d0'},
    solarized:{bg:'#002b36',ink:'#eee8d5',dim:'#93a1a1',accent:'#b58900',card:'#073642',line:'rgba(181,137,0,.28)',dot:'#b58900'},
    dracula:{bg:'#282a36',ink:'#f8f8f2',dim:'#bd93f9',accent:'#50fa7b',card:'#21222c',line:'rgba(80,250,123,.28)',dot:'#bd93f9'},
    ocean:{bg:'#0b1c24',ink:'#d8f3ff',dim:'#7fadb8',accent:'#2ec4b6',card:'#12262e',line:'rgba(46,196,182,.28)',dot:'#2ec4b6'}
  };
  THEMES.midnight.bg='#07080c'; // the page night, as elghaly.dev
  var LABELS={midnight:'Midnight',dawn:'Dawn',nord:'Nord',solarized:'Solarized',dracula:'Dracula',ocean:'Ocean'};
  var ORDER=['midnight','dawn','nord','solarized','dracula','ocean'];
  function apply(name){
    if(!(name in THEMES)) name='midnight';
    var t=THEMES[name];
    var r=document.documentElement;
    r.setAttribute('data-theme',name);
    r.style.setProperty('--bg',t.bg);
    r.style.setProperty('--surface',t.card);
    r.style.setProperty('--text',t.ink);
    r.style.setProperty('--muted',t.dim);
    r.style.setProperty('--accent',t.accent);
    r.style.setProperty('--border',t.line);
    r.style.setProperty('--panel',t.card);
    if(document.body){document.body.style.background=(name==='midnight')?NIGHT:t.bg;document.body.style.color=t.ink;}
    try{localStorage.setItem(KEY,name);}catch(e){}
    document.querySelectorAll('[data-theme-item]').forEach(function(el){
      el.classList.toggle('on', el.getAttribute('data-theme-item')===name);
    });
    var cur=document.getElementById('themeCur');
    if(cur) cur.textContent=LABELS[name];
  }
  function mount(){
    if(document.getElementById('themeMenu')) return;
    var wrap=document.createElement('div');
    wrap.className='theme-wrap';
    wrap.id='themeMenu';
    wrap.innerHTML='<button type="button" class="theme-btn" id="themeOpen"><i class="theme-dot"></i><span id="themeCur">Midnight</span></button>';
    var panel=document.createElement('div');
    panel.className='theme-panel';
    panel.innerHTML='<p>Choose theme</p>';
    ORDER.forEach(function(k){
      var b=document.createElement('button');
      b.type='button';
      b.className='theme-item';
      b.setAttribute('data-theme-item',k);
      b.innerHTML='<i style="background:'+THEMES[k].dot+'"></i><span>'+LABELS[k]+'</span><span class="ck">\u2713</span>';
      b.onclick=function(){apply(k);wrap.classList.remove('open');};
      panel.appendChild(b);
    });
    wrap.appendChild(panel);
    var host=document.querySelector('.header-right')||document.querySelector('.topbar');
    if(host) host.appendChild(wrap);
    var open=document.getElementById('themeOpen');
    if(open) open.onclick=function(e){e.stopPropagation();wrap.classList.toggle('open');};
    document.addEventListener('click',function(){wrap.classList.remove('open');});
  }
  var start='midnight';
  try{start=localStorage.getItem(KEY)||'midnight';}catch(e){}
  if(!(start in THEMES)) start='midnight';
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){mount();apply(start);});
  }else{mount();apply(start);}
})();
