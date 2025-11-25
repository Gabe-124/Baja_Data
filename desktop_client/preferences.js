const themeSelect = document.getElementById('themeSelect');
const themeStatus = document.getElementById('themeStatus');
const themeState = {
  current: 'dark',
  saving: false
};

function setThemeStatus(message, variant = '') {
  if (!themeStatus) return;
  themeStatus.textContent = message || '';
  themeStatus.classList.toggle('success', variant === 'success');
}

async function loadPreferences() {
  try {
    const config = (await window.electronAPI?.loadConfig?.()) || {};
    const preferred = typeof config.uiTheme === 'string' ? config.uiTheme : 'dark';
    themeState.current = preferred;
    themeSelect.value = preferred;
    setThemeStatus('');
  } catch (error) {
    console.error('Failed to load preferences:', error);
    setThemeStatus('Unable to load saved preferences.');
  }
}

async function saveThemePreference(mode) {
  if (themeState.saving) return;
  themeState.saving = true;
  setThemeStatus('Saving…');
  try {
    await window.electronAPI?.saveConfig?.({ uiTheme: mode });
    themeState.current = mode;
    setThemeStatus('Theme updated for all windows', 'success');
  } catch (error) {
    console.error('Failed to save theme preference:', error);
    setThemeStatus('Could not save theme. Try again.');
    themeSelect.value = themeState.current;
  } finally {
    themeState.saving = false;
  }
}

function handleThemeSelectChange(event) {
  const mode = event.target.value;
  if (!mode || mode === themeState.current) return;
  saveThemePreference(mode);
}

document.addEventListener('DOMContentLoaded', () => {
  loadPreferences();
  themeSelect.addEventListener('change', handleThemeSelectChange);
});

if (window?.electronAPI?.onConfigUpdated) {
  window.electronAPI.onConfigUpdated((config) => {
    if (!config || typeof config !== 'object') return;
    if (typeof config.uiTheme === 'string' && config.uiTheme !== themeState.current) {
      themeState.current = config.uiTheme;
      themeSelect.value = config.uiTheme;
      setThemeStatus('Theme updated in another window', 'success');
    }
  });
}
