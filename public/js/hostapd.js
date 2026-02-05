const form = document.getElementById('hostapdForm');
const refreshBtn = document.getElementById('refreshBtn');
const formStatus = document.getElementById('formStatus');
const serviceBadge = document.getElementById('serviceBadge');
const serviceStatus = document.getElementById('serviceStatus');
const configPath = document.getElementById('configPath');
const togglePassBtn = document.getElementById('togglePassBtn');
const toggleAdvancedBtn = document.getElementById('toggleAdvancedBtn');
const advancedFields = document.getElementById('advancedFields');
const viewRawBtn = document.getElementById('viewRawBtn');
const downloadRawBtn = document.getElementById('downloadRawBtn');
const rawPanel = document.getElementById('rawPanel');
const rawConfig = document.getElementById('rawConfig');
const hideRawBtn = document.getElementById('hideRawBtn');

const fields = {
    interface: document.getElementById('interface'),
    ssid: document.getElementById('ssid'),
    wpa_passphrase: document.getElementById('wpa_passphrase'),
    channel: document.getElementById('channel'),
    hw_mode: document.getElementById('hw_mode'),
    country_code: document.getElementById('country_code'),
    ignore_broadcast_ssid: document.getElementById('ignore_broadcast_ssid'),
    driver: document.getElementById('driver'),
    wpa: document.getElementById('wpa'),
    wpa_key_mgmt: document.getElementById('wpa_key_mgmt'),
    rsn_pairwise: document.getElementById('rsn_pairwise'),
    wmm_enabled: document.getElementById('wmm_enabled'),
    macaddr_acl: document.getElementById('macaddr_acl'),
    auth_algs: document.getElementById('auth_algs')
};

const restartAfterSave = document.getElementById('restartAfterSave');
let currentConfig = {};

function setStatus(message, tone = 'info') {
    formStatus.textContent = message;
    formStatus.classList.remove('text-green-300', 'text-red-300', 'text-gray-300');
    if (tone === 'success') {
        formStatus.classList.add('text-green-300');
    } else if (tone === 'error') {
        formStatus.classList.add('text-red-300');
    } else {
        formStatus.classList.add('text-gray-300');
    }
}

function setServiceBadge(service) {
    if (service?.ok && service.active) {
        serviceBadge.textContent = 'active';
        serviceBadge.classList.remove('badge-off');
        serviceBadge.classList.add('badge-on');
        serviceStatus.textContent = service.status || 'active';
        return;
    }
    serviceBadge.textContent = 'inactive';
    serviceBadge.classList.remove('badge-on');
    serviceBadge.classList.add('badge-off');
    serviceStatus.textContent = service?.status || service?.error || 'unknown';
}

function applyDefaults(config) {
    return {
        interface: config.interface || 'wlan0',
        ssid: config.ssid || 'Event-Jukebox',
        wpa_passphrase: config.wpa_passphrase || '',
        channel: config.channel || '7',
        hw_mode: config.hw_mode || 'g',
        country_code: config.country_code || '',
        ignore_broadcast_ssid: config.ignore_broadcast_ssid || '0',
        driver: config.driver || 'nl80211',
        wpa: config.wpa || '2',
        wpa_key_mgmt: config.wpa_key_mgmt || 'WPA-PSK',
        rsn_pairwise: config.rsn_pairwise || 'CCMP',
        wmm_enabled: config.wmm_enabled || '0',
        macaddr_acl: config.macaddr_acl || '0',
        auth_algs: config.auth_algs || '1'
    };
}

function populateForm(config) {
    currentConfig = config;
    const normalized = applyDefaults(config);

    fields.interface.value = normalized.interface;
    fields.ssid.value = normalized.ssid;
    fields.wpa_passphrase.value = normalized.wpa_passphrase;
    fields.channel.value = normalized.channel;
    fields.hw_mode.value = normalized.hw_mode;
    fields.country_code.value = normalized.country_code;
    fields.ignore_broadcast_ssid.checked = normalized.ignore_broadcast_ssid === '1';
    fields.driver.value = normalized.driver;
    fields.wpa.value = normalized.wpa;
    fields.wpa_key_mgmt.value = normalized.wpa_key_mgmt;
    fields.rsn_pairwise.value = normalized.rsn_pairwise;
    fields.wmm_enabled.value = normalized.wmm_enabled;
    fields.macaddr_acl.value = normalized.macaddr_acl;
    fields.auth_algs.value = normalized.auth_algs;
}

async function loadConfig() {
    setStatus('Loading hostapd config...');
    try {
        const response = await fetch('/api/hostapd');
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Unable to load hostapd config');
        }
        configPath.textContent = data.path || '--';
        populateForm(data.config || {});
        setServiceBadge(data.service);
        setStatus('Ready.');
    } catch (error) {
        setStatus(error.message, 'error');
        setServiceBadge(null);
        configPath.textContent = '--';
    }
}

async function loadRawConfig() {
    const response = await fetch('/api/hostapd/raw');
    const text = await response.text();
    if (!response.ok) {
        throw new Error(text || 'Unable to load raw config');
    }
    return text;
}

function buildPayload() {
    const config = {
        interface: fields.interface.value.trim(),
        ssid: fields.ssid.value.trim(),
        wpa_passphrase: fields.wpa_passphrase.value,
        channel: fields.channel.value.trim(),
        hw_mode: fields.hw_mode.value,
        ignore_broadcast_ssid: fields.ignore_broadcast_ssid.checked ? '1' : '0'
    };

    const optional = {
        country_code: fields.country_code.value.trim().toUpperCase() || currentConfig.country_code || '',
        driver: fields.driver.value.trim() || currentConfig.driver || '',
        wpa: fields.wpa.value.trim() || currentConfig.wpa || '',
        wpa_key_mgmt: fields.wpa_key_mgmt.value.trim() || currentConfig.wpa_key_mgmt || '',
        rsn_pairwise: fields.rsn_pairwise.value.trim() || currentConfig.rsn_pairwise || '',
        wmm_enabled: fields.wmm_enabled.value.trim() || currentConfig.wmm_enabled || '',
        macaddr_acl: fields.macaddr_acl.value.trim() || currentConfig.macaddr_acl || '',
        auth_algs: fields.auth_algs.value.trim() || currentConfig.auth_algs || ''
    };

    Object.entries(optional).forEach(([key, value]) => {
        if (value) {
            config[key] = value;
        }
    });

    return { config, restart: restartAfterSave.checked };
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Saving hostapd config...');
    try {
        const response = await fetch('/api/hostapd', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildPayload())
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.details || data.error || 'Save failed');
        }
        populateForm(data.config || currentConfig);
        if (data.restart?.ok) {
            setServiceBadge(data.restart);
            setStatus('Saved and restarted hostapd.', 'success');
        } else if (restartAfterSave.checked) {
            setStatus(`Saved, but restart failed: ${data.restart?.error || 'unknown error'}`, 'error');
        } else {
            setStatus('Saved without restart.', 'success');
        }
    } catch (error) {
        setStatus(error.message, 'error');
    }
});

refreshBtn.addEventListener('click', (event) => {
    event.preventDefault();
    loadConfig();
});

togglePassBtn.addEventListener('click', () => {
    const isPassword = fields.wpa_passphrase.type === 'password';
    fields.wpa_passphrase.type = isPassword ? 'text' : 'password';
    togglePassBtn.textContent = isPassword ? 'Hide' : 'Show';
});

toggleAdvancedBtn.addEventListener('click', () => {
    const isHidden = advancedFields.classList.contains('hidden');
    advancedFields.classList.toggle('hidden', !isHidden);
    toggleAdvancedBtn.textContent = isHidden ? 'Hide' : 'Show';
});

viewRawBtn.addEventListener('click', async () => {
    try {
        setStatus('Loading raw config...');
        const text = await loadRawConfig();
        rawConfig.value = text;
        rawPanel.classList.remove('hidden');
        setStatus('Raw config loaded.');
    } catch (error) {
        setStatus(error.message, 'error');
    }
});

hideRawBtn.addEventListener('click', () => {
    rawPanel.classList.add('hidden');
});

downloadRawBtn.addEventListener('click', async () => {
    try {
        setStatus('Preparing download...');
        const text = await loadRawConfig();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'hostapd.conf';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setStatus('Download ready.', 'success');
    } catch (error) {
        setStatus(error.message, 'error');
    }
});

loadConfig();
