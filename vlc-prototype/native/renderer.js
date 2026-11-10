const elements = {
  open: document.getElementById('open'),
  play: document.getElementById('play'),
  pause: document.getElementById('pause'),
  stop: document.getElementById('stop'),
  fullscreen: document.getElementById('fullscreen'),
  seek: document.getElementById('seek'),
  current: document.getElementById('current'),
  duration: document.getElementById('duration'),
  volume: document.getElementById('volume'),
  file: document.getElementById('file'),
  status: document.getElementById('status')
};

let seeking = false;

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

async function updateStatus() {
  try {
    const status = await window.vlcNative.status();
    if (status.filePath) elements.file.textContent = status.filePath;
    if (status.durationMs > 0) {
      elements.seek.max = String(status.durationMs);
      elements.duration.textContent = formatTime(status.durationMs);
    }
    if (!seeking) {
      elements.seek.value = String(status.timeMs);
      elements.current.textContent = formatTime(status.timeMs);
    }
    if (status.state) elements.status.textContent = status.state;
  } catch (error) {
    elements.status.textContent = `Ошибка VLC: ${error.message}`;
  }
}

for (const [button, method] of [
  [elements.open, 'open'],
  [elements.play, 'play'],
  [elements.pause, 'pause'],
  [elements.stop, 'stop'],
  [elements.fullscreen, 'fullscreen']
]) {
  button.addEventListener('click', async () => {
    try {
      const result = await window.vlcNative[method]();
      if (result?.filePath) elements.file.textContent = result.filePath;
      if (result?.durationMs > 0) {
        elements.seek.max = String(result.durationMs);
        elements.duration.textContent = formatTime(result.durationMs);
      }
      if (result?.state) elements.status.textContent = result.state;
    } catch (error) {
      elements.status.textContent = `${method === 'open' ? 'Не удалось открыть' : 'Ошибка VLC'}: ${error.message}`;
    }
  });
}

elements.seek.addEventListener('input', () => {
  seeking = true;
  elements.current.textContent = formatTime(Number(elements.seek.value));
});
elements.seek.addEventListener('change', async () => {
  try {
    await window.vlcNative.seek(Number(elements.seek.value));
  } catch (error) {
    elements.status.textContent = `Ошибка перемотки: ${error.message}`;
  } finally {
    seeking = false;
  }
});

elements.volume.addEventListener('input', () => {
  window.vlcNative.volume(Number(elements.volume.value)).catch(error => {
    elements.status.textContent = `Ошибка громкости: ${error.message}`;
  });
});

window.vlcNative.onState(state => {
  if (state) elements.status.textContent = state;
});

setInterval(updateStatus, 500);
