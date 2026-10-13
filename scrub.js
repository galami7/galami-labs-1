if ("scrollRestoration" in history) history.scrollRestoration = "manual";

const video = document.querySelector(".hero-video");
const track = document.querySelector(".scrub");
const pin = document.querySelector(".pin");
const endStill = document.querySelector(".end-still");
const nextButton = document.querySelector(".next");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const phoneQuery = window.matchMedia("(max-aspect-ratio: 4/5)");
const isPhone = () => phoneQuery.matches;

const phoneBand = () => {
  if (!isPhone()) return { top: 0, bottom: 0 };
  return { top: 24, bottom: 24 };
};

const nameKey = "galami-phone-names";
const nameAdjust = new URLSearchParams(location.search).has("names");
const blankNames = () => [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];

const readNameOffsets = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(nameKey));
    if (
      Array.isArray(saved)
      && saved.length === 3
      && saved.every((item) => item && Number.isFinite(item.x) && Number.isFinite(item.y))
    ) {
      return saved.map((item) => ({ x: item.x, y: item.y }));
    }
  } catch (error) {}
  return blankNames();
};

let nameOffsets = readNameOffsets();

const fitPhoneLine = (element, sidePad) => {
  if (!element) return;
  if (!isPhone()) {
    element.style.fontSize = "";
    element.style.width = "";
    return;
  }
  const available = Math.max(120, pin.clientWidth - sidePad * 2);
  element.style.width = "max-content";
  element.style.fontSize = "100px";
  const width = element.getBoundingClientRect().width;
  element.style.width = "";
  if (width <= 0) return;
  element.style.fontSize = `${(100 * available) / width}px`;
};

const fitStatementTitle = () => {
  fitPhoneLine(document.querySelector(".statement-title"), 20);
  fitPhoneLine(document.querySelector(".wordmark"), 22);
};

let safeProbe = null;

const readSafeInsets = () => {
  if (!safeProbe) {
    safeProbe = document.createElement("div");
    safeProbe.className = "safe-area-probe";
    safeProbe.setAttribute("aria-hidden", "true");
    document.documentElement.appendChild(safeProbe);
  }
  const style = getComputedStyle(safeProbe);
  const px = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    top: px(style.paddingTop),
    bottom: px(style.paddingBottom),
  };
};

const endScroll = () => {
  const span = isPhone() ? pin.offsetHeight : window.innerHeight;
  const end = Math.max(0, track.offsetHeight - span);
  return isPhone() ? Math.max(0, end - 1) : end;
};

const runway = () => (isPhone() ? Math.min(phoneBand().top, endScroll()) : 0);
const maxScroll = () => endScroll();

const progress = () => {
  const start = runway();
  const distance = maxScroll() - start;
  if (distance <= 0) return 0;
  return Math.min(1, Math.max(0, (window.scrollY - start) / distance));
};

const parkAtStart = () => {
  const offset = runway();
  if (window.scrollY < offset) window.scrollTo(0, offset);
};

const fitPhonePin = () => {
  if (!isPhone()) {
    pin.style.position = "";
    pin.style.top = "";
    pin.style.left = "";
    pin.style.width = "";
    pin.style.height = "";
    pin.style.removeProperty("--band-top");
    pin.style.removeProperty("--band-bottom");
    pin.style.removeProperty("--chrome-top");
    pin.style.removeProperty("--chrome-bottom");
    fitStatementTitle();
    return;
  }

  const band = phoneBand();
  const safe = readSafeInsets();
  const viewport = window.visualViewport;
  const topBar = viewport ? viewport.offsetTop : 0;
  const bottomBar = viewport ? Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height) : 0;
  pin.style.position = "sticky";
  pin.style.top = `${-band.top}px`;
  pin.style.left = "0";
  pin.style.width = "100%";
  pin.style.height = `${window.innerHeight + band.top + band.bottom}px`;
  pin.style.setProperty("--band-top", `${band.top}px`);
  pin.style.setProperty("--band-bottom", `${band.bottom}px`);
  pin.style.setProperty("--chrome-top", `${band.top + topBar + safe.top}px`);
  pin.style.setProperty("--chrome-bottom", `${band.bottom + Math.max(bottomBar, safe.bottom)}px`);
  fitStatementTitle();
  parkAtStart();
};

const updateChrome = () => {
  const amount = progress();
  const atEnd = amount > 0.98;
  const atStart = amount <= 0.02 && !playing && !driving;
  pin.classList.toggle("is-away", !atStart);
  pin.classList.toggle("is-end", atEnd);
  pin.style.removeProperty("--mix");
  endStill.setAttribute("aria-hidden", atEnd ? "false" : "true");
  nextButton.disabled = !atStart;
  nextButton.setAttribute("aria-hidden", atStart ? "false" : "true");
  syncPeaks();
};

let frame = -1;
let queued = false;
let playing = false;
let driving = false;
let playFrame = 0;

// v8 plays forward instead of jumping between frames.
// Hands lower from about 1.3s to 2.9s, at half speed. The rest runs at double speed.
const handsSegments = [
  { until: 1.3, rate: 2 },
  { until: 2.9, rate: 0.5 },
  { until: Infinity, rate: 2 },
];
const handsPoints = [
  [0, 0],
  [0.12, 0.215],
  [0.71, 0.48],
  [1, 1],
];

const videoProgress = (amount) => {
  if (video.dataset.pace !== "hands") return amount;
  for (let i = 1; i < handsPoints.length; i += 1) {
    const [start, from] = handsPoints[i - 1];
    const [end, to] = handsPoints[i];
    if (amount <= end) {
      return from + ((amount - start) / (end - start)) * (to - from);
    }
  }
  return 1;
};

const scrollProgressForVideo = (amount) => {
  for (let i = 1; i < handsPoints.length; i += 1) {
    const [start, from] = handsPoints[i - 1];
    const [end, to] = handsPoints[i];
    if (amount <= to) {
      return start + ((amount - from) / (to - from)) * (end - start);
    }
  }
  return 1;
};

const handsRate = (time) => {
  for (const segment of handsSegments) {
    if (time < segment.until) return segment.rate;
  }
  return 2;
};

const seek = () => {
  queued = false;
  updateChrome();
  if (driving) return;
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0 || video.seekable.length === 0) return;

  const count = Math.max(1, Math.round(duration * 24));
  const next = Math.round(videoProgress(progress()) * (count - 1));
  if (next === frame) return;

  frame = next;
  video.currentTime = next / 24;
};

const requestSeek = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(seek);
};

const stopPlayback = () => {
  playing = false;
  driving = false;
  cancelAnimationFrame(playFrame);
  video.pause();
  video.playbackRate = 1;
};

const playHands = () => {
  driving = true;
  video.currentTime = 0;
  video.playbackRate = handsSegments[0].rate;
  frame = -1;

  const follow = () => {
    if (!driving) return;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      playFrame = requestAnimationFrame(follow);
      return;
    }

    const targetRate = handsRate(video.currentTime);
    if (Math.abs(video.playbackRate - targetRate) > 0.04) {
      video.playbackRate += (targetRate - video.playbackRate) * 0.35;
    } else {
      video.playbackRate = targetRate;
    }
    const amount = Math.min(1, video.currentTime / duration);
    const travel = Math.max(0, maxScroll() - runway());
    window.scrollTo(0, runway() + scrollProgressForVideo(amount) * travel);

    if (video.ended || amount >= 0.995) {
      driving = false;
      playing = false;
      video.pause();
      video.playbackRate = 1;
      window.scrollTo(0, maxScroll());
      updateChrome();
      return;
    }

    playFrame = requestAnimationFrame(follow);
  };

  const started = video.play();
  if (started && typeof started.catch === "function") {
    started.catch(() => {
      driving = false;
      playing = false;
    });
  }
  playFrame = requestAnimationFrame(follow);
};

const playToEnd = () => {
  if (reduceMotion.matches || maxScroll() === 0) {
    pin.classList.add("is-end");
    endStill.setAttribute("aria-hidden", "false");
    syncPeaks();
    return;
  }

  stopPlayback();
  playing = true;
  pin.classList.add("is-away");
  nextButton.disabled = true;

  if (video.dataset.pace === "hands") {
    playHands();
    return;
  }

  const start = window.scrollY;
  const target = maxScroll();
  const duration = 2000;
  const startedAt = performance.now();

  const step = (now) => {
    if (!playing) return;
    const t = Math.min(1, (now - startedAt) / duration);
    window.scrollTo(0, start + (target - start) * t);
    requestSeek();
    if (t < 1) {
      playFrame = requestAnimationFrame(step);
      return;
    }
    playing = false;
    window.scrollTo(0, target);
    updateChrome();
  };

  playFrame = requestAnimationFrame(step);
};

const playToStart = () => {
  if (reduceMotion.matches || maxScroll() === 0) {
    stopPlayback();
    window.scrollTo(0, runway());
    updateChrome();
    return;
  }

  stopPlayback();
  playing = true;
  const start = window.scrollY;
  const target = runway();
  const duration = 2000;
  const startedAt = performance.now();

  const step = (now) => {
    if (!playing) return;
    const t = Math.min(1, (now - startedAt) / duration);
    window.scrollTo(0, start + (target - start) * t);
    requestSeek();
    if (t < 1) {
      playFrame = requestAnimationFrame(step);
      return;
    }
    playing = false;
    window.scrollTo(0, target);
    updateChrome();
  };

  playFrame = requestAnimationFrame(step);
};

nextButton.addEventListener("click", playToEnd);
window.addEventListener("touchstart", () => {
  if (!video || video.readyState < 2) return;
  const started = video.play();
  const unlock = () => {
    video.pause();
    frame = -1;
    requestSeek();
  };
  if (started && typeof started.then === "function") started.then(unlock).catch(unlock);
  else unlock();
}, { once: true, passive: true });
window.addEventListener("wheel", () => {
  if (playing) stopPlayback();
}, { passive: true });
window.addEventListener("touchmove", () => {
  if (playing) stopPlayback();
}, { passive: true });

let videoReady = false;
let videoBound = false;
let activeSource = "";

const scrubSource = () => (
  isPhone()
    ? (video.dataset.phoneScrub || "iphone-scrub.mp4")
    : (video.dataset.scrub || "scrub.mp4")
);

const loadBar = document.querySelector(".phone-load-bar");

const setLoadProgress = (amount) => {
  const t = Math.min(1, Math.max(0, amount));
  document.documentElement.style.setProperty("--load-blur", `${(1 - t) * 18}px`);
  if (loadBar) loadBar.style.width = `${Math.round(t * 100)}%`;
};

const finishPhoneLoad = () => {
  document.documentElement.classList.remove("is-video-loading");
  document.documentElement.classList.add("is-video-ready");
  parkAtStart();
};

let phoneBlobUrl = "";

const loadEntireVideo = async (source) => {
  const openPage = () => finishPhoneLoad();
  setLoadProgress(0);
  const giveUp = window.setTimeout(openPage, 12000);
  try {
    const response = await fetch(source);
    if (!response.ok || !response.body) throw new Error("missing video");
    const length = Number(response.headers.get("content-length")) || 0;
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (length) setLoadProgress(received / length);
    }
    setLoadProgress(1);
    if (phoneBlobUrl) URL.revokeObjectURL(phoneBlobUrl);
    phoneBlobUrl = URL.createObjectURL(new Blob(chunks, { type: "video/mp4" }));
    video.src = phoneBlobUrl;
    video.load();
    window.clearTimeout(giveUp);
    openPage();
    frame = -1;
    requestSeek();
  } catch (error) {
    window.clearTimeout(giveUp);
    if (!video.currentSrc) video.src = source;
    openPage();
  }
};

const enableVideo = () => {
  if (reduceMotion.matches || !video) return;
  const source = scrubSource();
  if (videoReady && activeSource === source) return;

  if (!videoBound) {
    videoBound = true;
    const reveal = () => {
      video.classList.add("is-ready");
    };

    video.addEventListener("loadedmetadata", requestSeek);
    video.addEventListener("canplay", requestSeek);
    video.addEventListener("progress", requestSeek);
    video.addEventListener("seeked", reveal);
    video.addEventListener("loadeddata", () => {
      video.removeAttribute("poster");
      const started = video.play();
      const unlock = () => {
        video.pause();
        frame = -1;
        requestSeek();
      };
      if (started && typeof started.then === "function") {
        started.then(unlock).catch(unlock);
      } else {
        unlock();
      }
      if ("requestVideoFrameCallback" in video) {
        video.requestVideoFrameCallback(reveal);
      }
    });
  }

  videoReady = true;
  activeSource = source;
  frame = -1;
  video.preload = "auto";
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.poster = isPhone() ? "Mobile First Frame.jpg" : "trial-first.jpg";
  if (isPhone()) {
    loadEntireVideo(source);
    return;
  }
  video.src = source;
};

if (reduceMotion.matches) finishPhoneLoad();

fitPhonePin();
if (!reduceMotion.matches) enableVideo();

window.addEventListener("scroll", requestSeek, { passive: true });
window.addEventListener("resize", () => {
  fitPhonePin();
  if (!reduceMotion.matches) enableVideo();
  requestSeek();
});
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    fitPhonePin();
    requestSeek();
  });
  window.visualViewport.addEventListener("scroll", fitPhonePin);
}

const peaks = document.querySelector(".peaks");
if (isPhone() && peaks) peaks.hidden = false;
const advance = document.querySelector(".advance");
const prevStep = document.querySelector(".step-prev");
const nextStep = document.querySelector(".step-next");
const summitLayer = document.querySelector(".summits");
const peakExit = document.querySelector(".peak-exit");
const replay = document.querySelector(".replay");
const peakDots = document.querySelector(".peak-dots");
if (replay) replay.addEventListener("click", playToStart);
const moreFog = document.querySelector(".more-fog");
const peakReadout = document.querySelector(".peak-readout");
const peakHeights = ["1,798 m", "2,128 m", "4,478 m"];
const heightDigits = [
  [1, 7, 9, 8],
  [2, 1, 2, 8],
  [4, 4, 7, 8],
];
let lastHeightIndex = 0;
let heightRoll = 0;

const fillHeightReels = () => {
  if (!peakReadout) return;
  const sequence = [...Array(10).keys(), ...Array(10).keys()];
  peakReadout.querySelectorAll(".height-reel").forEach((reel) => {
    reel.replaceChildren(...sequence.map((digit) => {
      const span = document.createElement("span");
      span.textContent = String(digit);
      return span;
    }));
  });
};

const snapHeights = (index) => {
  if (!peakReadout) return;
  peakReadout.querySelectorAll(".height-reel").forEach((reel, i) => {
    reel.style.transition = "none";
    reel.style.transform = `translateY(${-heightDigits[index][i]}em)`;
  });
  lastHeightIndex = index;
};

const rollHeights = (index) => {
  if (!peakReadout) return;
  const forward = index >= lastHeightIndex;
  const token = ++heightRoll;
  peakReadout.querySelectorAll(".height-reel").forEach((reel, i) => {
    const to = heightDigits[index][i];
    const cell = reel.firstElementChild;
    const cellHeight = cell ? cell.getBoundingClientRect().height : 0;
    const matrix = new DOMMatrix(getComputedStyle(reel).transform);
    const from = cellHeight ? Math.round(Math.abs(matrix.m42) / cellHeight) % 10 : 0;
    const steps = forward ? (to - from + 10) % 10 : (from - to + 10) % 10;
    if (!steps || reduceMotion.matches) {
      reel.style.transition = "none";
      reel.style.transform = `translateY(${-to}em)`;
      return;
    }
    const start = forward ? from : from + 10;
    const end = forward ? from + steps : from + 10 - steps;
    reel.style.transition = "none";
    reel.style.transform = `translateY(${-start}em)`;
    void reel.offsetWidth;
    reel.dataset.roll = String(token);
    reel.style.transition = `transform ${Math.max(0.45, steps * 0.16)}s cubic-bezier(0.4, 0.05, 0.2, 1)`;
    reel.style.transform = `translateY(${-end}em)`;
    reel.ontransitionend = (event) => {
      if (event.propertyName !== "transform" || reel.dataset.roll !== String(token)) return;
      reel.ontransitionend = null;
      reel.style.transition = "none";
      reel.style.transform = `translateY(${-to}em)`;
    };
  });
  lastHeightIndex = index;
};

fillHeightReels();
snapHeights(0);
const peakCount = document.querySelector(".peak-close") ? 4 : document.querySelector(".range") ? 3 : 0;
let peakIndex = 0;

const clampNameLabels = () => {
  if (!isPhone() || !summitLayer) return;
  const pad = 8;
  summitLayer.querySelectorAll(".summit-label").forEach((label) => {
    label.style.setProperty("--name-x", "0px");
    const box = label.getBoundingClientRect();
    let shift = 0;
    if (box.left < pad) shift = pad - box.left;
    else if (box.right > window.innerWidth - pad) shift = window.innerWidth - pad - box.right;
    label.style.setProperty("--name-x", `${shift}px`);
  });
};

const placeSummits = () => {
  fitPhonePin();
  if (!summitLayer || !endStill.naturalWidth) return;
  const viewW = pin.clientWidth;
  const viewH = pin.clientHeight;
  const scale = Math.max(viewW / endStill.naturalWidth, viewH / endStill.naturalHeight);
  const drawnW = endStill.naturalWidth * scale;
  const drawnH = endStill.naturalHeight * scale;
  const offsetX = (viewW - drawnW) / 2;
  const offsetY = (viewH - drawnH) / 2;
  const markerX = (marker) => Number(isPhone() && marker.dataset.phoneX ? marker.dataset.phoneX : marker.dataset.x);
  const markerY = (marker) => Number(isPhone() && marker.dataset.phoneY ? marker.dataset.phoneY : marker.dataset.y);
  const shapes = window.galamiSummitTriangles;
  const triangles = shapes && !isPhone() ? shapes.read() : null;
  summitLayer.querySelectorAll(".summit").forEach((marker, index) => {
    const spot = marker.parentElement && marker.parentElement.classList.contains("summit-spot") ? marker.parentElement : null;
    const triangle = triangles && triangles[index];
    if (spot && triangle) {
      const pts = triangle.map(([x, y]) => [offsetX + x * drawnW, offsetY + y * drawnH]);
      const minX = Math.min(...pts.map((point) => point[0]));
      const minY = Math.min(...pts.map((point) => point[1]));
      const width = Math.max(1, Math.max(...pts.map((point) => point[0])) - minX);
      const height = Math.max(1, Math.max(...pts.map((point) => point[1])) - minY);
      spot.style.left = `${minX}px`;
      spot.style.top = `${minY}px`;
      spot.style.width = `${width}px`;
      spot.style.height = `${height}px`;
      spot.style.minWidth = "0";
      spot.style.minHeight = "0";
      spot.style.transform = "none";
      const polygon = pts
        .map(([x, y]) => `${((x - minX) / width) * 100}% ${((y - minY) / height) * 100}%`)
        .join(", ");
      marker.style.clipPath = `polygon(${polygon})`;
      marker.style.webkitClipPath = `polygon(${polygon})`;
      spot.style.setProperty("--apex-x", `${pts[0][0] - minX}px`);
      spot.style.setProperty("--apex-y", `${pts[0][1] - minY}px`);
      return;
    }
    const host = spot || marker;
    const nudge = isPhone() ? nameOffsets[index] : { x: 0, y: 0 };
    host.style.left = `${offsetX + (markerX(marker) + nudge.x) * drawnW}px`;
    host.style.top = `${offsetY + (markerY(marker) + nudge.y) * drawnH}px`;
    if (!spot) return;
    host.style.width = "";
    host.style.height = "";
    host.style.minWidth = "";
    host.style.minHeight = "";
    host.style.transform = "";
    host.style.removeProperty("--apex-x");
    host.style.removeProperty("--apex-y");
    marker.style.clipPath = "";
    marker.style.webkitClipPath = "";
  });
  const along = (nx) => `${offsetX + nx * drawnW}px`;
  if (nextButton) nextButton.style.left = along(isPhone() ? 0.5 : 0.516);
  const advanceButton = document.querySelector(".advance");
  if (advanceButton) advanceButton.style.left = along(isPhone() ? 0.5 : 0.496);
  fitPilatusStick();
  clampNameLabels();
  placeStatement();
};

let skySample = null;
let skySampleKey = "";

const readSky = () => {
  if (!endStill.naturalWidth || !pin.clientWidth || !pin.clientHeight) return null;
  const key = `${pin.clientWidth}x${pin.clientHeight}x${endStill.naturalWidth}x${endStill.naturalHeight}`;
  if (skySample && skySampleKey === key) return skySample;
  const width = Math.max(1, Math.round(pin.clientWidth / 2));
  const height = Math.max(1, Math.round(pin.clientHeight / 2));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const scale = Math.max(width / endStill.naturalWidth, height / endStill.naturalHeight);
  const drawnWidth = endStill.naturalWidth * scale;
  const drawnHeight = endStill.naturalHeight * scale;
  context.drawImage(endStill, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight);
  skySample = { data: context.getImageData(0, 0, width, height).data, width, height };
  skySampleKey = key;
  return skySample;
};

const skyIsCloud = (map, pinX, pinY) => {
  const sx = Math.max(0, Math.min(map.width - 1, Math.round((pinX / pin.clientWidth) * (map.width - 1))));
  const sy = Math.max(0, Math.min(map.height - 1, Math.round((pinY / pin.clientHeight) * (map.height - 1))));
  const index = (sy * map.width + sx) * 4;
  const red = map.data[index];
  const green = map.data[index + 1];
  const blue = map.data[index + 2];
  const luma = (red + green + blue) / 3;
  return luma > 198 && blue - red < 18 && blue - green < 22;
};

const inkBox = (element) => {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect();
};

const textOnSky = (map, rect, pinRect) => {
  const left = rect.left - pinRect.left - 12;
  const right = rect.right - pinRect.left - 14;
  const top = rect.top - pinRect.top;
  const bottom = rect.bottom - pinRect.top + 6;
  if (right <= left) return true;
  for (let y = top; y <= bottom; y += 4) {
    for (let x = left; x <= right; x += 6) {
      if (skyIsCloud(map, x, y)) return false;
    }
  }
  return true;
};

const placeStatement = () => {
  const statement = document.querySelector(".statement");
  if (!statement) return;
  if (!isPhone()) {
    statement.style.top = "";
    return;
  }
  const label = document.querySelector(".summit-spot:last-child .summit-label");
  if (!label) return;
  const pinRect = pin.getBoundingClientRect();
  const labelTop = label.getBoundingClientRect().top;
  const safeTop = readSafeInsets().top;
  const height = statement.offsetHeight;
  const gap = 12;
  const drop = 48;
  const mid = (Math.max(safeTop, 0) + labelTop) / 2;
  let viewTop = mid - height / 2 + drop;
  const minTop = safeTop + 4;
  const maxTop = labelTop - gap - height;
  viewTop = Math.min(Math.max(viewTop, minTop), Math.max(minTop, maxTop));
  statement.style.top = `${viewTop - pinRect.top}px`;
  const map = readSky();
  const title = document.querySelector(".statement-title");
  const hint = document.querySelector(".hint-tap");
  if (!map || !title || !hint) return;
  for (let step = 0; step < 36 && viewTop > minTop; step += 1) {
    if (textOnSky(map, inkBox(title), pinRect) && textOnSky(map, inkBox(hint), pinRect)) break;
    viewTop = Math.max(minTop, viewTop - 4);
    statement.style.top = `${viewTop - pinRect.top}px`;
  }
};

const fitPilatusStick = () => {
  const marker = document.querySelector(".summit-pilatus");
  const spot = marker && marker.closest(".summit-spot");
  const title = document.querySelector(".statement-title");
  const label = spot && spot.querySelector(".summit-label");
  if (!spot || !title || !label) return;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const full = 2.45 * rem;
  const gap = 0.3 * rem;
  const pad = 0.4 * rem;
  const ink = document.createRange();
  ink.selectNodeContents(title);
  const apexLocal = parseFloat(getComputedStyle(spot).getPropertyValue("--apex-y"));
  const apex = spot.getBoundingClientRect().top + (Number.isFinite(apexLocal) ? apexLocal : 0.6 * rem);
  const room = apex - ink.getBoundingClientRect().bottom - label.offsetHeight - gap - pad;
  const stick = Math.min(full, Math.max(0, room));
  spot.style.setProperty("--stick", `${stick}px`);
};

if (summitLayer) {
  const namePanel = document.querySelector(".name-adjust");
  const nameFrame = () => {
    const viewW = pin.clientWidth;
    const viewH = pin.clientHeight;
    const scale = Math.max(viewW / endStill.naturalWidth, viewH / endStill.naturalHeight);
    return {
      drawnW: endStill.naturalWidth * scale,
      drawnH: endStill.naturalHeight * scale,
    };
  };
  const paintNameReadout = () => {
    const readout = namePanel && namePanel.querySelector(".name-adjust-readout");
    if (!readout || !endStill.naturalWidth) return;
    const { drawnW, drawnH } = nameFrame();
    const names = ["Rigi", "Pilatus", "Matterhorn"];
    readout.textContent = nameOffsets
      .map((offset, index) => `${names[index]} ${Math.round(offset.x * drawnW)}, ${Math.round(offset.y * drawnH)}`)
      .join("\n");
  };
  if (nameAdjust && isPhone() && namePanel) {
    namePanel.hidden = false;
    paintNameReadout();
    summitLayer.querySelectorAll(".summit-label").forEach((label, index) => {
      label.classList.add("is-adjustable");
      label.addEventListener("pointerdown", (event) => {
        if (!isPhone() || !endStill.naturalWidth) return;
        event.preventDefault();
        event.stopPropagation();
        label.setPointerCapture(event.pointerId);
        const startX = event.clientX;
        const startY = event.clientY;
        const origin = { ...nameOffsets[index] };
        const { drawnW, drawnH } = nameFrame();
        const move = (ev) => {
          nameOffsets[index] = {
            x: origin.x + (ev.clientX - startX) / drawnW,
            y: origin.y + (ev.clientY - startY) / drawnH,
          };
          placeSummits();
          paintNameReadout();
        };
        const up = () => {
          label.removeEventListener("pointermove", move);
          label.removeEventListener("pointerup", up);
          label.removeEventListener("pointercancel", up);
          localStorage.setItem(nameKey, JSON.stringify(nameOffsets));
          paintNameReadout();
        };
        label.addEventListener("pointermove", move);
        label.addEventListener("pointerup", up);
        label.addEventListener("pointercancel", up);
      });
    });
    const resetNames = namePanel.querySelector(".name-adjust-reset");
    if (resetNames) {
      resetNames.addEventListener("click", () => {
        nameOffsets = blankNames();
        localStorage.removeItem(nameKey);
        placeSummits();
        paintNameReadout();
      });
    }
  }
  if (endStill.complete && endStill.naturalWidth) placeSummits();
  endStill.addEventListener("load", placeSummits);
  window.addEventListener("resize", placeSummits);
  window.addEventListener("storage", (event) => {
    if (event.key === (window.galamiSummitTriangles && window.galamiSummitTriangles.key)) placeSummits();
  });
}

function syncPeaks() {
  if (!advance) return;
  const open = pin.classList.contains("is-peaks");
  const atEnd = pin.classList.contains("is-end");
  advance.hidden = open || !atEnd;
  if (replay) replay.hidden = open || !atEnd;
  if (prevStep) prevStep.hidden = !open || peakIndex <= 0;
  if (nextStep) nextStep.hidden = !open || peakIndex >= peakCount - 1;
  if (peakDots) {
    peakDots.hidden = !open;
    peakDots.querySelectorAll("button").forEach((dot, index) => {
      const on = open && index === peakIndex;
      dot.classList.toggle("is-on", on);
      if (on) dot.setAttribute("aria-current", "step");
      else dot.removeAttribute("aria-current");
    });
  }
  if (peakExit) {
    const onFinal = open && peakIndex === peakCount - 1;
    const menuOpen = onFinal && moreFog && !moreFog.hidden;
    peakExit.hidden = !open;
    peakExit.classList.toggle("is-more", onFinal);
    peakExit.classList.toggle("is-open", menuOpen);
    peakExit.setAttribute("aria-label", onFinal ? (menuOpen ? "Close" : "More") : "Back to the mountains");
    if (onFinal) peakExit.setAttribute("aria-expanded", menuOpen ? "true" : "false");
    else peakExit.removeAttribute("aria-expanded");
    if (!onFinal && moreFog && !moreFog.hidden) {
      moreFog.hidden = true;
    }
  }
  if (peakReadout) {
    const index = Math.min(peakIndex, 2);
    const showReadout = open && peakIndex < 3;
    peakReadout.hidden = !showReadout;
    if (showReadout) {
      if (index !== lastHeightIndex) rollHeights(index);
    } else if (lastHeightIndex !== 0) {
      snapHeights(0);
    }
    const live = peakReadout.querySelector(".peak-readout-live");
    if (live) live.textContent = showReadout ? `${peakHeights[index]} (Altitude)` : "";
  }
  if (summitLayer) summitLayer.setAttribute("aria-hidden", atEnd && !open ? "false" : "true");
}

let peakPosition = 0;
let peakFrame = 0;
let slideFrom = 0;
let slideTo = 0;
let slideStart = 0;
let slideDuration = 0.62;

const easeSlide = (t) => 1 - (1 - t) ** 2;

const springPeak = (now) => {
  const t = Math.min(1, (now - slideStart) / (slideDuration * 1000));
  peakPosition = slideFrom + (slideTo - slideFrom) * easeSlide(t);
  if (t >= 1) {
    peakPosition = slideTo;
    peakFrame = 0;
  } else {
    peakFrame = requestAnimationFrame(springPeak);
  }
  peaks.style.setProperty("--peak", String(peakPosition));
};

const showPeak = (index) => {
  if (!peaks || index < 0 || index >= peakCount) return;
  if (index === peakIndex) {
    syncPeaks();
    return;
  }
  peakIndex = index;
  syncPeaks();
  slideFrom = peakPosition;
  slideTo = index;
  const slideDistance = Math.abs(slideTo - slideFrom);
  slideDuration = Math.min(0.72, 0.46 + slideDistance * 0.08);
  if (slideTo === peakCount - 1 && slideTo > slideFrom) slideDuration *= 0.62;
  slideStart = performance.now();
  if (reduceMotion.matches) {
    cancelAnimationFrame(peakFrame);
    peakFrame = 0;
    peakPosition = index;
    peaks.style.setProperty("--peak", String(index));
    return;
  }
  if (!peakFrame) peakFrame = requestAnimationFrame(springPeak);
};

const flash = document.querySelector(".flash");

const playFlash = () => {
  if (!flash || reduceMotion.matches) return;
  flash.hidden = false;
  flash.classList.remove("is-on");
  void flash.offsetWidth;
  flash.classList.add("is-on");
  flash.addEventListener("animationend", () => {
    flash.classList.remove("is-on");
    flash.hidden = true;
  }, { once: true });
};

const openPeaks = (index) => {
  if (isPhone()) peaks.hidden = false;
  pin.classList.add("is-peaks");
  peaks.hidden = false;
  showPeak(index);
  if (!isPhone()) playFlash();
};

if (peaks && advance && prevStep && nextStep) {
  advance.addEventListener("click", () => openPeaks(0));
  if (summitLayer) {
    let summitHideTimer = 0;
    summitLayer.querySelectorAll(".summit").forEach((marker) => {
      marker.addEventListener("click", () => {
        requestAnimationFrame(() => marker.blur());
        if (!isPhone() || !pin.classList.contains("is-end") || pin.classList.contains("is-peaks")) return;
        const spot = marker.closest(".summit-spot");
        const shown = spot && spot.classList.contains("is-shown");
        window.clearTimeout(summitHideTimer);
        summitLayer.querySelectorAll(".summit-spot").forEach((item) => item.classList.remove("is-shown"));
        if (!spot || shown) return;
        spot.classList.add("is-shown");
        summitHideTimer = window.setTimeout(() => spot.classList.remove("is-shown"), 8000);
      });
    });
  }
  let swipeX = 0;
  let swipeY = 0;
  pin.addEventListener("touchstart", (event) => {
    swipeX = event.changedTouches[0].clientX;
    swipeY = event.changedTouches[0].clientY;
  }, { passive: true });
  pin.addEventListener("touchend", (event) => {
    if (!pin.classList.contains("is-peaks")) return;
    const dx = event.changedTouches[0].clientX - swipeX;
    const dy = event.changedTouches[0].clientY - swipeY;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    showPeak(peakIndex + (dx < 0 ? 1 : -1));
  }, { passive: true });
  prevStep.addEventListener("click", () => showPeak(peakIndex - 1, true));
  nextStep.addEventListener("click", () => showPeak(peakIndex + 1, true));
  if (peakDots) {
    peakDots.querySelectorAll("button").forEach((dot, index) => {
      dot.addEventListener("click", () => showPeak(index));
    });
  }
  const closeMore = () => {
    if (!moreFog || moreFog.hidden) return;
    moreFog.hidden = true;
    syncPeaks();
  };
  const openMore = () => {
    if (!moreFog) return;
    moreFog.hidden = false;
    syncPeaks();
  };
  const closePeaks = () => {
    if (moreFog) moreFog.hidden = true;
    pin.classList.remove("is-peaks");
    if (!isPhone()) peaks.hidden = true;
    cancelAnimationFrame(peakFrame);
    peakFrame = 0;
    peakIndex = 0;
    peakPosition = 0;
    peaks.style.setProperty("--peak", "0");
    syncPeaks();
  };
  if (peakExit) {
    peakExit.addEventListener("click", () => {
      if (peakExit.classList.contains("is-more")) {
        if (moreFog && moreFog.hidden) openMore();
        else closeMore();
        return;
      }
      closePeaks();
    });
  }
  if (moreFog) {
    moreFog.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      closeMore();
    });
  }
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !pin.classList.contains("is-peaks")) return;
    if (moreFog && !moreFog.hidden) closeMore();
    else closePeaks();
  });
  const keepPeaks = (event) => {
    if (pin.classList.contains("is-peaks")) event.preventDefault();
  };
  window.addEventListener("wheel", keepPeaks, { passive: false });
  window.addEventListener("touchmove", keepPeaks, { passive: false });
}

phoneQuery.addEventListener("change", () => {
  document.documentElement.classList.toggle("is-phone", isPhone());
  if (playing) stopPlayback();
  videoReady = false;
  activeSource = "";
  frame = -1;
  fitPhonePin();
  if (!reduceMotion.matches) enableVideo();
  placeSummits();
  updateChrome();
});

updateChrome();
