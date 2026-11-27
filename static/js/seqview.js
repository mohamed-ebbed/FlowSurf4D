// One comparison viewer for whole sequences: tabs Geometry | Correspondences | Point tracks | Renderings, pre-rendered clips with
// reference | method | Ours side by side. Data: SEQ_DATA (make_seqvids.py), CORR_DATA (make_corrvids.py), TRACK_DATA
// (make_trackvids.py), NVS_DATA (make_nvsvids.py); scene names and order from CMP_DATA. Nothing is downloaded until the viewer is near the screen, then only
// the clip that is shown.
(function () {
  'use strict';
  var GEO = (window.CMP_DATA && window.CMP_DATA.geo) || [];
  var GEO_ORDER = GEO.map(function (s) { return s.id; });
  var SPEEDS = [1, 0.5, 0.25];

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function num(v) { return v == null || v === '' ? null : parseFloat(v); }

  var MODES = [
    { id: 'geo', label: 'Geometry', data: window.SEQ_DATA, base: 'static/seqvid/', order: GEO_ORDER, scene: 'dragon',
      ref: function (d) { return d.ref === 'gt' ? 'Ground truth' : 'Input (real capture)'; },
      metric: 'Chamfer distance (mm) over the sequence, lower is better',
      val: function (m) { return num(m.val); }, show: function (m) { return m.val ? m.val + ' mm' : ''; },
      row: function (m) { return m.val || ''; },
      hint: 'Same camera and frames for every method. Pick a method in the list; the frame is kept when switching.',
      note: function (d) {
        return d.ref === 'gt'
          ? 'Numbers: per-scene Chamfer distance (mm), mean over the sequence (per-scene table of the supplementary). Methods that failed on this scene are not listed.'
          : 'TaoGS has no ground-truth geometry, so no numbers; left: the input image of this camera. Methods that failed on this capture are not listed.';
      } },
    { id: 'corr', label: 'Correspondences', data: window.CORR_DATA, base: 'static/corrvid/', order: GEO_ORDER, scene: 'peasantgirl',
      variants: [['col', 'Colors'], ['err', 'Error']],
      file: function (m, v) { return m.key + (v === 'err' ? '_err' : ''); },
      ref: function () { return 'Ground truth'; },
      metric: 'geodesic error (&times;100) over the sequence, lower is better',
      val: function (m) { return num(m.val); }, row: function (m) { return m.val || ''; },
      show: function (m, i) { var v = m.frames && m.frames[i]; return v == null ? '' : v.toFixed(2) + ' this frame'; },
      hint: 'Points of frame 1 carried to every frame by each method\'s own correspondences, drawn on the ground-truth surface: colored by their frame-1 position, or by their error.',
      note: function () {
        return 'Numbers in the list: mean geodesic error (&times;100, shape scaled to unit area) over the sequence (per-scene correspondence table of the supplementary); on the video: the mean of the shown frame. MaGS has no per-scene value in the table.';
      } },
    { id: 'trk', label: 'Point tracks', data: window.TRACK_DATA, base: 'static/trackvid/', scene: 'drawsword',
      order: ['drawsword', 'changeclothes', 'umbrella', 'bag', 'magic2', 'magic3'].concat(GEO_ORDER.filter(function (id) { return /^actor/.test(id); })),
      ref: function () { return 'CoTracker3 (reference)'; },
      metric: 'median error to CoTracker3 (px), lower is better / &delta;<sub>avg</sub>',
      val: function (m) { return num(m.med); }, show: function (m) { return m.med ? m.med + ' px' : ''; },
      row: function (m) { return (m.med ? m.med + ' px' : '&ndash;') + (m.avg ? ' <small>/ ' + m.avg + '</small>' : ''); },
      hint: 'Points of frame 1 tracked through the sequence in a camera that was not used for training, with their full paths.',
      note: function (d) {
        return 'Held-out camera ' + d.cam + '. Numbers: median distance to the CoTracker3 tracks (px) and &delta;<sub>avg</sub> (per-scene tracking table of the supplementary).';
      } },
    { id: 'nvs', label: 'Renderings', data: window.NVS_DATA, base: 'static/nvsvid/', order: GEO_ORDER, scene: 'actor6_seq2_1081',
      ref: function () { return 'Ground truth'; },
      metric: 'PSNR (dB), higher is better / LPIPS',
      val: function (m) { return num(m.psnr); }, show: function (m) { return m.psnr ? m.psnr + ' dB' : ''; },
      row: function (m) { return (m.psnr ? m.psnr + ' dB' : '&ndash;') + (m.lpips ? ' <small>/ ' + m.lpips + '</small>' : ''); },
      hint: 'Novel-view renders over the whole sequence in a camera that was not used for training, as each method outputs them.',
      note: function (d) {
        return 'Shown: held-out camera ' + d.cam + '. Numbers: per-scene PSNR (dB)' + (d.dataset === 'TaoGS' ? '' : ' and LPIPS') +
          ' over all held-out cameras and frames (' + (d.dataset === 'TaoGS' ? 'TaoGS novel-view table' : 'per-scene novel-view tables') +
          ' of the supplementary). Methods that failed on this scene are not listed.';
      } }
  ];

  function Viewer(root) {
    var modes = MODES.filter(function (o) { return o.disabled || o.data; });
    var st = { mode: modes.filter(function (o) { return !o.disabled; })[0].id, scene: null, left: 'MoAngelo', variant: 'col', spI: 0 };
    root.innerHTML = '';

    var tabs = el('div', 'cmp-seg uv-tabs');
    modes.forEach(function (o) {
      var b = el('button', 'cmp-seg-btn', o.label); b.type = 'button'; b.dataset.mode = o.id;
      if (o.disabled) { b.disabled = true; b.title = o.disabled; }
      else b.addEventListener('click', function () { setMode(o.id); });
      tabs.appendChild(b);
    });
    var sceneBox = el('div', 'cmp-scenes uv-scenes');
    var layout = el('div', 'cmp-layout seq-layout'), stageCol = el('div', 'cmp-stage-col'), panel = el('div', 'cmp-panel');
    layout.appendChild(stageCol); layout.appendChild(panel);
    [tabs, sceneBox, layout].forEach(function (c) { root.appendChild(c); });

    var box = el('div', 'seq-box'), inner = el('div', 'seq-inner'), labels = el('div', 'seq-labels');
    var video = el('video', 'seq-video');
    video.muted = true; video.loop = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.preload = 'none';
    inner.appendChild(video); inner.appendChild(labels); box.appendChild(inner);
    var ctl = el('div', 'seq-ctl');
    var bPlay = el('button', 'cmp-tool seq-play', '<i class="fas fa-pause"></i>'); bPlay.type = 'button'; bPlay.title = 'Play / pause';
    var range = el('input', 'seq-range'); range.type = 'range'; range.min = 0; range.step = 1; range.value = 0; range.setAttribute('aria-label', 'Frame');
    var fTxt = el('span', 'seq-frame');
    var bSpeed = el('button', 'cmp-tool seq-speed', '1&times;'); bSpeed.type = 'button'; bSpeed.title = 'Playback speed';
    var vSeg = el('div', 'cmp-seg seq-variants');
    [bPlay, range, fTxt, bSpeed, vSeg].forEach(function (c) { ctl.appendChild(c); });
    var legend = el('div', 'seq-legend', '<span>0</span><i></i><span>&ge;10</span><small>geodesic error &times;100</small>');
    var hint = el('p', 'cmp-hint');
    [box, ctl, legend, hint].forEach(function (c) { stageCol.appendChild(c); });
    var chartHead = el('div', 'cmp-chart-head'), chart = el('div', 'cmp-chart'), note = el('p', 'cmp-note');
    [chartHead, chart, note].forEach(function (c) { panel.appendChild(c); });

    function M() { return modes.filter(function (o) { return o.id === st.mode; })[0]; }
    function D() { return M().data[st.scene]; }
    function ids() { var o = M(); return o.order.filter(function (id) { return o.data[id]; }); }
    function geoS(id) { return GEO.filter(function (s) { return s.id === id; })[0]; }
    function name(id) { var g = geoS(id); return g ? g.name : id; }
    function dataset(id) { return M().data[id].dataset || (geoS(id) || {}).dataset || ''; }
    function meth(label) { return D().methods.filter(function (m) { return m.label === label; })[0]; }
    function idx() { var d = D(); return clamp(Math.floor(video.currentTime * d.fps + 1e-3), 0, d.n - 1); }

    function buildScenes() {
      sceneBox.innerHTML = '';
      var groups = {}, order = [];
      ids().forEach(function (id) { var g = dataset(id); if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(id); });
      order.forEach(function (g) {
        var row = el('div', 'cmp-scene-group');
        row.appendChild(el('div', 'cmp-group-label', g));
        var chips = el('div', 'cmp-chips');
        groups[g].forEach(function (id) {
          var b = el('button', 'cmp-chip', name(id)); b.type = 'button'; b.dataset.id = id;
          b.addEventListener('click', function () { setScene(id); });
          chips.appendChild(b);
        });
        row.appendChild(chips); sceneBox.appendChild(row);
      });
    }

    function setMode(id) {
      st.mode = id;
      [].forEach.call(tabs.children, function (b) { b.classList.toggle('is-active', b.dataset.mode === id); });
      var o = M();
      vSeg.innerHTML = '';
      (o.variants || []).forEach(function (v) {
        var b = el('button', 'cmp-seg-btn', v[1]); b.type = 'button'; b.dataset.v = v[0];
        b.addEventListener('click', function () { st.variant = v[0]; render(false); });
        vSeg.appendChild(b);
      });
      vSeg.style.display = o.variants ? '' : 'none';
      buildScenes();
      var list = ids();
      setScene(list.indexOf(st.scene) >= 0 ? st.scene : (list.indexOf(o.scene) >= 0 ? o.scene : list[0]));
    }

    function setScene(id) {
      st.scene = id;
      [].forEach.call(sceneBox.querySelectorAll('.cmp-chip'), function (b) { b.classList.toggle('is-active', b.dataset.id === id); });
      if (!meth(st.left)) st.left = (meth('MoAngelo') || D().methods[0]).label;
      render(true);
    }

    function labelHtml() {
      var o = M(), d = D(), mL = meth(st.left), i = idx();
      var cols = mL.key === 'gt' ? [[o.ref(d), null], ['Ours', meth('Ours')]] : [[o.ref(d), null], [mL.label, mL], ['Ours', meth('Ours')]];
      labels.style.setProperty('--n', cols.length);
      labels.innerHTML = cols.map(function (c) {
        var v = c[1] ? o.show(c[1], i) : '';
        return '<div class="v3d-label' + (c[0] === 'Ours' ? ' is-ours' : '') + '"><b>' + c[0] + '</b>' + (v ? '<span>' + v + '</span>' : '') + '</div>';
      }).join('');
    }
    function upd() {
      if (!st.scene) return;
      var d = D(), i = idx(); range.max = d.n - 1; range.value = i;
      fTxt.textContent = 'frame ' + (d.first + i) + ' / ' + (d.first + d.n - 1);
      if (M().id === 'corr') labelHtml();
    }
    var lastI = -1;
    function tick() { var i = idx(); if (i !== lastI) { lastI = i; upd(); } if (!video.paused) requestAnimationFrame(tick); }
    video.addEventListener('play', function () { bPlay.innerHTML = '<i class="fas fa-pause"></i>'; requestAnimationFrame(tick); });
    video.addEventListener('pause', function () { bPlay.innerHTML = '<i class="fas fa-play"></i>'; upd(); });
    video.addEventListener('seeked', upd);
    bPlay.addEventListener('click', function () { if (video.paused) video.play().catch(function () {}); else video.pause(); });
    range.addEventListener('input', function () { video.pause(); video.currentTime = (+range.value + 0.5) / D().fps; upd(); });
    bSpeed.addEventListener('click', function () {
      st.spI = (st.spI + 1) % SPEEDS.length;
      video.defaultPlaybackRate = video.playbackRate = SPEEDS[st.spI];
      bSpeed.innerHTML = SPEEDS[st.spI] + '&times;';
    });

    function render(newScene) {
      var o = M(), d = D(), mL = meth(st.left);
      [].forEach.call(vSeg.children, function (b) { b.classList.toggle('is-active', b.dataset.v === st.variant); });
      legend.style.display = o.id === 'corr' && st.variant === 'err' ? '' : 'none';
      hint.textContent = o.hint;
      labelHtml();
      var url = o.base + st.scene + '/' + (o.file ? o.file(mL, st.variant) : mL.key) + '.mp4';
      if (video.getAttribute('src') !== url) {
        var t = newScene ? 0 : video.currentTime || 0, paused = !newScene && video.paused && video.dataset.started === '1';
        box.classList.add('is-loading');
        video.preload = 'auto'; video.src = url; video.defaultPlaybackRate = video.playbackRate = SPEEDS[st.spI];
        video.addEventListener('loadeddata', function () {
          box.classList.remove('is-loading');
          if (video.videoWidth) inner.style.setProperty('--ar', video.videoWidth / video.videoHeight);
          try { if (t) video.currentTime = t % video.duration; } catch (e) {}
          if (!paused) video.play().catch(function () {});
          upd();
        }, { once: true });
        video.dataset.started = '1';
      }
      renderChart(); upd();
      note.innerHTML = o.note(d);
    }

    function renderChart() {
      var o = M(), d = D();
      chartHead.innerHTML = '<span>Compare Ours with</span><small>' + o.metric + '</small>';
      chart.innerHTML = '';
      var vals = d.methods.map(o.val).filter(function (v) { return v != null; });
      var ours = o.val(meth('Ours')), hi = vals.length ? Math.max.apply(null, vals) : 1;
      if (ours) hi = Math.min(hi, ours * 4.5);
      var last = null;
      d.methods.forEach(function (m) {
        var g = m.key === 'gt' ? 'ref' : m.static ? 'static' : 'dyn';
        if (m.label === 'Ours') g = 'ours';
        if (g !== last && (g === 'static' || (g === 'dyn' && last === 'static'))) {
          chart.appendChild(el('div', 'cmp-row-group', g === 'static' ? 'Per-frame static (no correspondences)' : 'Dynamic'));
        }
        last = g;
        var isOurs = m.label === 'Ours';
        var row = el(isOurs ? 'div' : 'button', 'cmp-row' + (isOurs ? ' is-ours' : '') + (m.label === st.left ? ' is-active' : ''));
        if (!isOurs) { row.type = 'button'; row.addEventListener('click', function () { st.left = m.label; render(false); }); }
        row.title = isOurs ? 'Ours is always on the right' : 'Show ' + m.label + ' next to ours';
        row.appendChild(el('span', 'cmp-row-name', m.key === 'gt' ? 'Ground truth only' : m.label));
        var track = el('span', 'cmp-track'), v = o.val(m);
        if (v != null) {
          var bar = el('span', 'cmp-bar' + (v > hi ? ' is-clipped' : '')); bar.style.width = (clamp(v / hi, 0.02, 1) * 100) + '%';
          track.appendChild(bar);
        }
        row.appendChild(track);
        row.appendChild(el('span', 'cmp-row-val', o.row(m)));
        chart.appendChild(row);
      });
    }

    // load the first clip only when the viewer comes near the screen; pause while it is off screen
    var started = false;
    function start() { if (!started) { started = true; setMode(st.mode); } }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { start(); if (video.dataset.auto === '1') { video.dataset.auto = ''; video.play().catch(function () {}); } }
          else if (started && !video.paused) { video.pause(); video.dataset.auto = '1'; }
        });
      }, { rootMargin: '200px 0px' }).observe(root);
    } else start();
  }

  function init() {
    var r = document.getElementById('cmp-viewer');
    if (r) { try { Viewer(r); } catch (e) { console.error('comparison viewer', e); } }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
