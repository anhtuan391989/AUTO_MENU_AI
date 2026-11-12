(() => {
  'use strict';
  let lastSignature = '';
  let lastVideo = null;
  let lastUrl = location.href;

  function videoIdFromUrl() {
    try {
      const u = new URL(location.href);
      if (u.hostname === 'youtu.be') return u.pathname.split('/').filter(Boolean)[0] || '';
      if (u.pathname === '/watch') return u.searchParams.get('v') || '';
      const p = u.pathname.split('/').filter(Boolean);
      return p.length > 1 && ['shorts', 'live', 'embed', 'v'].includes(p[0]) ? p[1] : '';
    } catch (_) { return ''; }
  }

  function getPlayingVideoTitle(id) {
    // Prefer the title attached to the currently playing video. document.title can
    // describe a playlist/container instead of the selected item in some YouTube views.
    try {
      const playerTitle = window.ytInitialPlayerResponse
        && window.ytInitialPlayerResponse.videoDetails
        && window.ytInitialPlayerResponse.videoDetails.title;
      if (typeof playerTitle === 'string' && playerTitle.trim()) return playerTitle.trim();
    } catch (_) {}
    const selectors = [
      'h1.ytd-watch-metadata yt-formatted-string',
      'ytd-watch-metadata h1 yt-formatted-string',
      'meta[itemprop="name"]',
      'meta[name="title"]'
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const value = node && (node.content || node.textContent || '');
      if (value && value.trim()) return value.trim();
    }
    return (document.title || '').replace(/\s*-\s*YouTube\s*$/i, '').trim() || id;
  }

  function sendState(force = false) {
    const id = videoIdFromUrl();
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    const title = getPlayingVideoTitle(id);
    const video = document.querySelector('video.html5-main-video, video');
    const isPlaying = !!(video && !video.paused && !video.ended && video.readyState >= 2);
    // Đang chiếu quảng cáo thì currentTime là của quảng cáo, không gửi để khỏi lệch mốc đổi tone.
    const adShowing = !!document.querySelector('.html5-video-player.ad-showing');
    const currentTime = (video && !adShowing && isFinite(video.currentTime)) ? video.currentTime : null;
    // Thời lượng video (giây) để AUTO MENU AI hiện đồng hồ "00:43 / 05:05" và so đúng bản thu. Quảng cáo / phát trực tiếp (Infinity) => null.
    const duration = (video && !adShowing && isFinite(video.duration) && video.duration > 0) ? video.duration : null;
    const info = { video_id: id, url: `https://www.youtube.com/watch?v=${id}`, title, title_source: 'video', is_playing: isPlaying, current_time: currentTime, duration, is_ad: adShowing };
    const timeBucket = currentTime === null ? 'ad-or-unknown' : Math.floor(currentTime);
    const signature = `${id}|${title}|${isPlaying}|${adShowing}|${timeBucket}|${video ? video.readyState : 0}|${duration === null ? 'x' : Math.floor(duration)}`;
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    try { chrome.runtime.sendMessage({ type: 'ht-youtube-state', info }); } catch (_) {}
  }

  function bindVideo(video) {
    if (!video || video === lastVideo) return;
    lastVideo = video;
    ['play', 'playing', 'pause', 'ended', 'seeked', 'loadeddata', 'canplay', 'emptied'].forEach(evt =>
      video.addEventListener(evt, () => sendState(true), { passive: true })
    );
  }

  // The service worker requests a fresh player snapshot when a tab becomes active.
  // Only this content script can authoritatively read video.paused/currentTime.
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'ht-request-youtube-state') {
      lastSignature = '';
      sendState(true);
    }
  });

  // Detect YouTube SPA navigation and player state without waiting for the tab title event.
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastSignature = '';
      lastVideo = null;
    }
    bindVideo(document.querySelector('video.html5-main-video, video'));
    sendState(false);
  }, 1000);
  // Gửi playhead mỗi 1 giây; sự kiện play/pause/seek vẫn được gửi ngay lập tức.
  document.addEventListener('yt-navigate-finish', () => { lastSignature = ''; sendState(true); }, true);
  window.addEventListener('popstate', () => { lastSignature = ''; sendState(true); }, true);
  sendState(true);
})();
