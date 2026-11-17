let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioContext = new AudioCtx();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

// Play short haptic feedback for phone touch
export function triggerHaptic(duration = 20) {
  if (typeof window !== 'undefined' && 'navigator' in window && navigator.vibrate) {
    try {
      navigator.vibrate(duration);
    } catch {
      // ignore
    }
  }
}

// Play a buzzer sound for quarter end / timeout
export function playBuzzerSound() {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.6);

    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch (e) {
    console.warn('Audio playback error:', e);
  }
}

// Play pleasant positive beep for scored points
export function playScoreSound(points = 2) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const baseFreq = points === 3 ? 587.33 : points === 2 ? 523.25 : 440; // D5, C5, A4
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.2);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(now + 0.25);
  } catch (e) {
    console.warn('Audio score sound error:', e);
  }
}

// Play a subtle click for UI feedback
export function playClickSound() {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(350, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch {
    // ignore
  }
}

// Current playing audio element
let currentAudio: HTMLAudioElement | null = null;

// Announce play or speak text using Gemini TTS with browser SpeechSynthesis fallback
export async function announcePlay(
  text: string,
  options: {
    voice?: string;
    style?: string;
    onStart?: () => void;
    onEnd?: () => void;
  } = {}
): Promise<void> {
  const { voice = 'Puck', style = 'Energetic Polish basketball court announcer', onStart, onEnd } = options;

  // Stop currently playing audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  onStart?.();

  // Try Gemini TTS first
  if (navigator.onLine) {
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, style }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.audioData) {
          const audio = new Audio(`data:audio/wav;base64,${data.audioData}`);
          currentAudio = audio;
          audio.onended = () => {
            currentAudio = null;
            onEnd?.();
          };
          audio.onerror = () => {
            currentAudio = null;
            speakWithBrowser(text, onEnd);
          };
          await audio.play();
          return;
        }
      }
    } catch (err) {
      console.warn('Gemini TTS failed, falling back to local speech synthesis:', err);
    }
  }

  // Fallback to browser SpeechSynthesis (works 100% offline)
  speakWithBrowser(text, onEnd);
}

function speakWithBrowser(text: string, onEnd?: () => void) {
  if (!('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pl-PL';
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Try finding Polish voice
    const voices = window.speechSynthesis.getVoices();
    const plVoice = voices.find((v) => v.lang.startsWith('pl') || v.lang === 'pl-PL');
    if (plVoice) {
      utterance.voice = plVoice;
    }

    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis error:', err);
    onEnd?.();
  }
}

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
