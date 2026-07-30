(function () {
    "use strict";
    var activeAudio = null;
    var playlist = [];
    var playlistIndex = 0;
    var todayButton = document.querySelector("[data-news-play-today]");

    function setTodayButton(playing) {
        if (!todayButton) return;
        todayButton.setAttribute("aria-pressed", playing ? "true" : "false");
        todayButton.querySelector("[data-news-today-icon]").textContent = playing ? "■" : "▶";
        todayButton.querySelector("[data-news-today-label]").textContent = playing ? "Stop Today's News" : "Play Today's News";
    }
    function setButton(audio, playing) {
        var row = audio.closest(".btv-news-row");
        var button = row && row.querySelector("[data-news-play]");
        if (!button) return;
        button.classList.toggle("is-playing", playing);
        button.setAttribute("aria-label", playing ? "Pause audio" : button.getAttribute("aria-label").replace("Pause", "Play"));
    }
    function play(audio) {
        if (activeAudio && activeAudio !== audio) {
            activeAudio.pause();
            activeAudio.currentTime = 0;
            setButton(activeAudio, false);
        }
        activeAudio = audio;
        audio.play().then(function () { setButton(audio, true); }).catch(function () { setButton(audio, false); });
    }
    function stopToday() {
        if (activeAudio) {
            activeAudio.pause();
            activeAudio.currentTime = 0;
            setButton(activeAudio, false);
        }
        playlist = [];
        playlistIndex = 0;
        setTodayButton(false);
    }
    function formatRemaining(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
        seconds = Math.ceil(seconds);
        return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
    }
    function updateRemaining(audio) {
        var row = audio.closest(".btv-news-row");
        var timer = row && row.querySelector("[data-news-remaining]");
        if (!timer) return;
        timer.textContent = formatRemaining(Math.max(audio.duration - audio.currentTime, 0));
    }
    document.addEventListener("click", function (event) {
        var playButton = event.target.closest("[data-news-play]");
        if (playButton) {
            event.preventDefault();
            event.stopPropagation();
            playlist = [];
            setTodayButton(false);
            var audio = playButton.closest(".btv-news-row").querySelector("audio");
            if (audio.paused) play(audio);
            else { audio.pause(); setButton(audio, false); }
            return;
        }
        var row = event.target.closest("[data-news-row]");
        if (row && !event.target.closest("a,button")) window.location.href = row.dataset.newsUrl;
    });
    document.addEventListener("keydown", function (event) {
        var row = event.target.closest && event.target.closest("[data-news-row]");
        if (row && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); window.location.href = row.dataset.newsUrl; }
    });
    document.querySelectorAll(".btv-news-row audio,[data-news-today-audio]").forEach(function (audio) {
        audio.addEventListener("loadedmetadata", function () { updateRemaining(audio); });
        audio.addEventListener("durationchange", function () { updateRemaining(audio); });
        audio.addEventListener("timeupdate", function () { updateRemaining(audio); });
        audio.addEventListener("pause", function () { if (!audio.ended) setButton(audio, false); });
        audio.addEventListener("ended", function () {
            setButton(audio, false);
            updateRemaining(audio);
            if (playlist.length && playlist[playlistIndex] === audio && ++playlistIndex < playlist.length) play(playlist[playlistIndex]);
            else { playlist = []; setTodayButton(false); }
        });
    });
    if (todayButton) todayButton.addEventListener("click", function () {
        if (playlist.length) { stopToday(); return; }
        playlist = Array.prototype.slice.call(document.querySelectorAll("[data-news-today-audio]"));
        playlistIndex = 0;
        if (playlist.length) { setTodayButton(true); play(playlist[0]); }
    });
}());
