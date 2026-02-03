(function () {
  const applyTheme = (theme) => {
    if (!theme) return;
    const root = document.documentElement;
    const mapping = {
      '--event-primary': theme.primary,
      '--event-secondary': theme.secondary,
      '--event-accent': theme.accent,
      '--event-background': theme.background,
      '--event-card': theme.card
    };
    Object.entries(mapping).forEach(([key, value]) => {
      if (value) root.style.setProperty(key, value);
    });
    if (theme.background && document.body) {
      document.body.style.background = theme.background;
    }
  };

  const applyTextTokens = (config) => {
    const tokens = {
      appName: config.appName,
      eventName: config.eventName,
      tagline: config.tagline,
      wifiSsid: config.wifi?.ssid,
      wifiPassword: config.wifi?.password,
      playlistPrimaryLabel: config.playlists?.primary?.label,
      playlistSecondaryLabel: config.playlists?.secondary?.label,
      playlistPrimaryName: config.playlists?.primary?.name,
      playlistSecondaryName: config.playlists?.secondary?.name,
      playlistPrimaryShort: config.playlists?.primary?.shortName,
      playlistSecondaryShort: config.playlists?.secondary?.shortName
    };

    document.querySelectorAll('[data-event-text]').forEach((el) => {
      const key = el.getAttribute('data-event-text');
      if (key && tokens[key]) {
        el.textContent = tokens[key];
      }
    });

    if (config.appName) {
      const suffix = document.documentElement.getAttribute('data-title-suffix');
      document.title = suffix ? `${config.appName} - ${suffix}` : config.appName;
    }
  };

  const applyConfig = (config) => {
    if (!config) return;
    window.eventConfig = config;
    applyTheme(config.theme);
    applyTextTokens(config);
  };

  window.applyEventConfig = applyConfig;

  const defaultConfig = {
    appName: 'Wedding Jukebox',
    eventName: 'Wedding',
    tagline: 'Add songs and keep the party going'
  };

  fetch('/api/event-config')
    .then((response) => response.ok ? response.json() : defaultConfig)
    .then((config) => applyConfig(config))
    .catch(() => applyConfig(defaultConfig));
})();
