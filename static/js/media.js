// Videos: play the data-autoplay ones only while visible (saves bandwidth), and the method step-by-step player.
(function () {
  'use strict';
  var vids = [].slice.call(document.querySelectorAll('video[data-autoplay]'));
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) { if (v.preload === 'none') v.preload = 'auto'; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        else if (!v.paused) v.pause();
      });
    }, { threshold: 0.25 });
    vids.forEach(function (v) { io.observe(v); });
  } else vids.forEach(function (v) { v.autoplay = true; v.preload = 'metadata'; });

  var root = document.getElementById('method-steps');
  if (!root) return;
  var btns = [].slice.call(root.querySelectorAll('.steps-btn'));
  var video = root.querySelector('.steps-video'), text = root.querySelector('.steps-text');
  var cur = 0, visible = false;
  function show(i, play) {
    cur = (i + btns.length) % btns.length;
    var b = btns[cur], n = b.dataset.name;
    btns.forEach(function (x, j) { x.classList.toggle('is-active', j === cur); x.setAttribute('aria-pressed', j === cur); });
    video.poster = 'static/images/' + n + '_poster.jpg';
    video.src = 'static/videos/' + n + '.mp4';
    text.innerHTML = b.dataset.text;
    if (play) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
  }
  btns.forEach(function (b, i) { b.addEventListener('click', function () { show(i, true); }); });
  // narration: muted until the visitor turns the sound on (browsers block autoplay with sound)
  var snd = root.querySelector('.steps-sound');
  function sndUpd() {
    var on = !video.muted;
    if (!snd) return;
    snd.setAttribute('aria-pressed', on); snd.classList.toggle('is-on', on);
    snd.innerHTML = on ? '<i class="fas fa-volume-up"></i><span>Sound on</span>' : '<i class="fas fa-volume-mute"></i><span>Sound off</span>';
  }
  if (snd) snd.addEventListener('click', function () {
    video.muted = !video.muted; sndUpd();
    if (!video.muted && video.paused) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
  });
  video.addEventListener('volumechange', sndUpd);
  video.addEventListener('ended', function () { show(cur + 1, visible); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible && video.paused && !video.dataset.started) { video.dataset.started = 1; var p = video.play(); if (p && p.catch) p.catch(function () {}); }
      else if (!visible && !video.paused) video.pause();
    }, { threshold: 0.4 }).observe(video);
  }
  show(0, false);
})();
