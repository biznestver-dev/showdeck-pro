const elements = {
  open: document.getElementById('open'),
  stop: document.getElementById('stop'),
  file: document.getElementById('file'),
  status: document.getElementById('status')
};

elements.open.addEventListener('click', async () => {
  try {
    const result = await window.vlcPrototype.open();
    if (result.canceled) return;
    if (result.filePath) elements.file.textContent = result.filePath;
    elements.status.textContent = 'Видео запущено в VLC. Сравните плавность с ShowDeck.';
  } catch (error) {
    elements.status.textContent = `Не удалось открыть видео: ${error.message}`;
  }
});

elements.stop.addEventListener('click', async () => {
  try {
    await window.vlcPrototype.stop();
    elements.status.textContent = 'Окно VLC закрыто.';
  } catch (error) {
    elements.status.textContent = `Не удалось закрыть VLC: ${error.message}`;
  }
});

window.vlcPrototype.onExit(({ code, signal }) => {
  elements.status.textContent = `VLC завершился (${signal || `код ${code}`}).`;
});
window.vlcPrototype.onError(message => {
  elements.status.textContent = `Ошибка запуска VLC: ${message}`;
});
