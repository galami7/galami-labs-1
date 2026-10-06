const video = document.querySelector(".hero-video");
const track = document.querySelector(".scrub");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (!reduceMotion.matches) {
  const fps = 24;
  let frame = -1;
  let queued = false;

  const seek = () => {
    queued = false;
    const distance = track.offsetHeight - window.innerHeight;
    const progress = distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;

    const count = Math.max(1, Math.round(duration * fps));
    const next = Math.round(progress * (count - 1));
    if (next === frame) return;

    frame = next;
    video.currentTime = next / fps;
  };

  const requestSeek = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(seek);
  };

  const reveal = () => {
    video.classList.add("is-ready");
  };

  video.addEventListener("loadedmetadata", requestSeek);
  video.addEventListener("seeked", reveal);
  if ("requestVideoFrameCallback" in video) {
    video.addEventListener("loadeddata", () => {
      video.requestVideoFrameCallback(reveal);
    }, { once: true });
  }

  video.addEventListener("loadeddata", () => {
    const started = video.play();
    const unlock = () => {
      video.pause();
      requestSeek();
    };
    if (started && typeof started.then === "function") {
      started.then(unlock).catch(unlock);
    } else {
      unlock();
    }
  });

  video.preload = "auto";
  video.src = "scrub.mp4";
  window.addEventListener("scroll", requestSeek, { passive: true });
  window.addEventListener("resize", requestSeek);
}
