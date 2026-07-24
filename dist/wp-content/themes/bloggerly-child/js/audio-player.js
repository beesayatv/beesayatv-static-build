(function () {
    "use strict";

    var icons = {
        play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>',
        pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zm7 0h3v14h-3z"></path></svg>'
    };

    function formatTime(seconds) {
        if (!Number.isFinite(seconds)) return "0:00";
        return Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
    }

    function makeRange(className, label, min, max, value, step) {
        var range = document.createElement("input");
        range.className = "btv-audio-player__range " + className;
        range.type = "range";
        range.setAttribute("aria-label", label);
        range.min = min;
        range.max = max;
        range.value = value;
        range.step = step;
        return range;
    }

    function enhanceAudio(audio) {
        var block = audio.closest(".wp-block-audio");
        if (audio.dataset.btvAudioEnhanced || !block) return;

        var controls = document.createElement("div");
        var playButton = document.createElement("button");
        var progress = document.createElement("div");
        var seek = makeRange("btv-audio-player__seek", "Audio progress", 0, 0, 0, 0.1);
        var time = document.createElement("span");

        audio.dataset.btvAudioEnhanced = "true";
        block.classList.add("btv-audio-player");
        audio.classList.add("btv-audio-player__native");
        audio.removeAttribute("controls");

        controls.className = "btv-audio-player__controls";
        playButton.className = "btv-audio-player__button";
        playButton.type = "button";
        playButton.setAttribute("aria-label", "Play audio");
        playButton.innerHTML = icons.play;
        progress.className = "btv-audio-player__progress";
        time.className = "btv-audio-player__time";
        time.textContent = "-0:00";
        progress.append(seek);
        controls.append(playButton, progress, time);
        audio.after(controls);

        function updatePlayButton() {
            var playing = !audio.paused && !audio.ended;
            playButton.innerHTML = playing ? icons.pause : icons.play;
            playButton.setAttribute("aria-label", playing ? "Pause audio" : "Play audio");
        }

        function updateTimeline() {
            var duration = Number.isFinite(audio.duration) ? audio.duration : 0;
            var progressPercent = duration ? (audio.currentTime / duration) * 100 : 0;
            seek.max = duration;
            seek.value = Math.min(audio.currentTime, duration);
            seek.style.setProperty("--btv-audio-progress", progressPercent + "%");
            time.textContent = "-" + formatTime(Math.max(duration - audio.currentTime, 0));
        }

        playButton.addEventListener("click", function () {
            if (audio.paused || audio.ended) audio.play().catch(function () {});
            else audio.pause();
        });
        seek.addEventListener("input", function () { audio.currentTime = Number(seek.value); });
        audio.addEventListener("loadedmetadata", updateTimeline);
        audio.addEventListener("durationchange", updateTimeline);
        audio.addEventListener("timeupdate", updateTimeline);
        audio.addEventListener("play", updatePlayButton);
        audio.addEventListener("pause", updatePlayButton);
        audio.addEventListener("ended", updatePlayButton);
    }

    function init() { document.querySelectorAll(".wp-block-audio audio").forEach(enhanceAudio); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
}());
