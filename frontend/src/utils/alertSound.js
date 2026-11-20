/** Plays a short synthesized alert tone for high- and critical-priority events. */
export function playPriorityAlert(priority) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const critical = priority === "CRITICAL";
    const offsets = critical ? [0, 0.22, 0.44] : [0];
    const frequency = critical ? 880 : 660;

    const play = () => {
      const now = ctx.currentTime;
      offsets.forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.22);
      });
      window.setTimeout(() => ctx.close().catch(() => {}), 1000);
    };

    if (ctx.state === "suspended") ctx.resume().then(play).catch(() => ctx.close());
    else play();
  } catch (err) {
    console.warn("Alert sound unavailable", err);
  }
}

const HINDI_ANNOUNCEMENT = {
  fire: "सावधान! आग लगने की घटना का पता चला है।",
  smoke: "सावधान! धुएं का पता चला है।",
  accident: "सावधान! एक दुर्घटना की सूचना मिली है।",
  fallen_person: "सूचना! एक व्यक्ति के गिरने का पता चला है।",
  crowd_anomaly: "सूचना! असामान्य भीड़ का पता चला है।",
  road_blockage: "सूचना! सड़क अवरोध की सूचना मिली है।",
};

/**
 * Speaks a Hindi voice announcement for a high/critical incident using the
 * browser's built-in Text-to-Speech (Web Speech API) — no audio file or
 * external service needed. Falls back silently if the browser has no
 * Hindi voice installed (rare, but the beep alert still plays either way).
 */
export function speakIncidentAlert(incidentType, priority) {
  try {
    if (!("speechSynthesis" in window)) return;
    const incidentMessage = HINDI_ANNOUNCEMENT[incidentType] || "एक आपातकालीन घटना का पता चला है।";
    const message = priority === "CRITICAL"
      ? `गंभीर चेतावनी! ${incidentMessage} कृपया तुरंत समीक्षा करें।`
      : `उच्च प्राथमिकता अलर्ट! ${incidentMessage} कृपया समीक्षा करें।`;
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "hi-IN";
    utterance.rate = 0.95;
    utterance.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const hindiVoice = voices.find((v) => v.lang === "hi-IN") || voices.find((v) => v.lang.startsWith("hi"));
    if (hindiVoice) utterance.voice = hindiVoice;

    window.speechSynthesis.cancel(); // stop any overlapping previous announcement
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Voice alert unavailable", err);
  }
}
