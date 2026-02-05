const refreshBtn = document.getElementById('refreshBtn');
const managerBadge = document.getElementById('managerBadge');
const modeNotice = document.getElementById('modeNotice');
const activeProfile = document.getElementById('activeProfile');
const activeDevice = document.getElementById('activeDevice');
const activeMode = document.getElementById('activeMode');
const viewRawBtn = document.getElementById('viewRawBtn');
const downloadRawBtn = document.getElementById('downloadRawBtn');
const rawPanel = document.getElementById('rawPanel');
const rawConfig = document.getElementById('rawConfig');
const hideRawBtn = document.getElementById('hideRawBtn');

const nmSection = document.getElementById('nmSection');
const hostapdSection = document.getElementById('hostapdSection');

const nmForm = document.getElementById('hotspotForm');
const nmStatus = document.getElementById('formStatus');
const connectionSelect = document.getElementById('connectionSelect');
const connectionName = document.getElementById('connectionName');
const createBtn = document.getElementById('createBtn');
const togglePassBtn = document.getElementById('togglePassBtn');
const restartAfterSave = document.getElementById('restartAfterSave');

const nmFields = {
    interface: document.getElementById('interface'),
    ssid: document.getElementById('ssid'),
    psk: document.getElementById('psk'),
    channel: document.getElementById('channel'),
    band: document.getElementById('band'),
    ipv4Address: document.getElementById('ipv4Address')
};

const hostapdForm = document.getElementById('hostapdForm');
const hostapdStatus = document.getElementById('hostapdStatus');
const haTogglePassBtn = document.getElementById('ha-togglePassBtn');
const haToggleAdvancedBtn = document.getElementById('ha-toggleAdvancedBtn');
const haAdvancedFields = document.getElementById('ha-advancedFields');
const haRestartAfterSave = document.getElementById('ha-restartAfterSave');

const haFields = {
    interface: document.getElementById('ha-interface'),
    ssid: document.getElementById('ha-ssid'),
    wpa_passphrase: document.getElementById('ha-wpa_passphrase'),
    channel: document.getElementById('ha-channel'),
    hw_mode: document.getElementById('ha-hw_mode'),
    country_code: document.getElementById('ha-country_code'),
    ignore_broadcast_ssid: document.getElementById('ha-ignore_broadcast_ssid'),
    driver: document.getElementById('ha-driver'),
    wpa: document.getElementById('ha-wpa'),
    wpa_key_mgmt: document.getElementById('ha-wpa_key_mgmt'),
    rsn_pairwise: document.getElementById('ha-rsn_pairwise'),
    wmm_enabled: document.getElementById('ha-wmm_enabled'),
    macaddr_acl: document.getElementById('ha-macaddr_acl'),
    auth_algs: document.getElementById('ha-auth_algs')
};

let nmConnections = [];
let nmActiveName = '';
let mode = 'networkmanager';
let hostapdPath = '';

function setBadgeActive(active) {
    if (active) {
        managerBadge.textContent = 'active';
        managerBadge.classList.remove('badge-off');
        managerBadge.classList.add('badge-on');
        return;
    }
    managerBadge.textContent = 'inactive';
    managerBadge.classList.remove('badge-on');
    managerBadge.classList.add('badge-off');
}

function setStatus(el, message, tone = 'info') {
    el.textContent = message;
    el.classList.remove('text-green-300', 'text-red-300', 'text-gray-300');
    if (tone === 'success') {
        el.classList.add('text-green-300');
    } else if (tone === 'error') {
        el.classList.add('text-red-300');
    } else {
        el.classList.add('text-gray-300');
    }
}

function showMode(nextMode) {
    mode = nextMode;
    nmSection.classList.toggle('hidden', mode !== 'networkmanager');
    hostapdSection.classList.toggle('hidden', mode !== 'hostapd');
    rawPanel.classList.add('hidden');
    rawConfig.value = '';

    if (mode === 'networkmanager') {
        modeNotice.textContent = 'NetworkManager hotspot is active.';
    } else if (mode === 'hostapd') {
        modeNotice.textContent = 'Hostapd configuration is active on this system.';
    } else {
        modeNotice.textContent = 'No hotspot manager detected.';
    }
}

function populateNmSelect(items) {
    connectionSelect.innerHTML = '';
    items.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.name;
        option.textContent = item.name + (item.active ? ' (active)' : '');
        connectionSelect.appendChild(option);
    });
}

function normalizeChannel(value) {
    if (!value || value === '0') return '';
    return value;
}

function populateNmForm(item) {
    if (!item) return;
    connectionName.value = item.name || '';
    nmFields.interface.value = item.iface || '';
    nmFields.ssid.value = item.ssid || '';
    nmFields.psk.value = '';
    nmFields.channel.value = normalizeChannel(item.channel || '');
    nmFields.band.value = item.band || 'bg';
    nmFields.ipv4Address.value = item.ipv4Addresses || '';
}

async function loadNmStatus() {
    setStatus(nmStatus, 'Loading hotspot settings...');
    const response = await fetch('/api/hotspot/nm');
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Unable to load hotspot profiles');
    }
    nmConnections = data.connections || [];
    nmActiveName = data.active || '';
    populateNmSelect(nmConnections);

    const active = nmConnections.find((item) => item.name === nmActiveName) || nmConnections[0];
    if (active) {
        connectionSelect.value = active.name;
        populateNmForm(active);
        activeProfile.textContent = active.name || '--';
        activeDevice.textContent = active.device || active.iface || '--';
        activeMode.textContent = active.mode || 'ap';
    } else {
        activeProfile.textContent = '--';
        activeDevice.textContent = '--';
        activeMode.textContent = '--';
    }

    setStatus(nmStatus, 'Ready.');
}

function applyHostapdDefaults(config) {
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

function populateHostapdForm(config) {
    const normalized = applyHostapdDefaults(config || {});
    haFields.interface.value = normalized.interface;
    haFields.ssid.value = normalized.ssid;
    haFields.wpa_passphrase.value = normalized.wpa_passphrase;
    haFields.channel.value = normalized.channel;
    haFields.hw_mode.value = normalized.hw_mode;
    haFields.country_code.value = normalized.country_code;
    haFields.ignore_broadcast_ssid.checked = normalized.ignore_broadcast_ssid === '1';
    haFields.driver.value = normalized.driver;
    haFields.wpa.value = normalized.wpa;
    haFields.wpa_key_mgmt.value = normalized.wpa_key_mgmt;
    haFields.rsn_pairwise.value = normalized.rsn_pairwise;
    haFields.wmm_enabled.value = normalized.wmm_enabled;
    haFields.macaddr_acl.value = normalized.macaddr_acl;
    haFields.auth_algs.value = normalized.auth_algs;
}

async function loadHostapdStatus() {
    setStatus(hostapdStatus, 'Loading hostapd config...');
    const response = await fetch('/api/hostapd');
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Unable to load hostapd config');
    }
    hostapdPath = data.path || '';
    populateHostapdForm(data.config || {});
    setStatus(hostapdStatus, 'Ready.');
}

async function loadMode() {
    try {
        const response = await fetch('/api/hotspot/status');
        const data = await response.json();
        if (data.mode === 'networkmanager') {
            setBadgeActive(true);
            showMode('networkmanager');
            await loadNmStatus();
        } else if (data.mode === 'hostapd') {
            setBadgeActive(true);
            showMode('hostapd');
            await loadHostapdStatus();
        } else {
            setBadgeActive(false);
            showMode('none');
            setStatus(nmStatus, 'No hotspot manager detected.', 'error');
        }
    } catch (error) {
        setBadgeActive(false);
        showMode('none');
        setStatus(nmStatus, error.message, 'error');
    }
}

function buildNmPayload() {
    return {
        connectionName: connectionSelect.value,
        newName: connectionName.value.trim(),
        restart: restartAfterSave.checked,
        config: {
            ssid: nmFields.ssid.value.trim(),
            iface: nmFields.interface.value.trim(),
            band: nmFields.band.value,
            channel: nmFields.channel.value.trim(),
            psk: nmFields.psk.value.trim(),
            ipv4Address: nmFields.ipv4Address.value.trim()
        }
    };
}

function buildNmCreatePayload() {
    return {
        name: connectionName.value.trim(),
        restart: restartAfterSave.checked,
        config: {
            ssid: nmFields.ssid.value.trim(),
            iface: nmFields.interface.value.trim(),
            band: nmFields.band.value,
            channel: nmFields.channel.value.trim(),
            psk: nmFields.psk.value.trim(),
            ipv4Address: nmFields.ipv4Address.value.trim()
        }
    };
}

function buildHostapdPayload() {
    const optional = {
        country_code: haFields.country_code.value.trim().toUpperCase(),
        driver: haFields.driver.value.trim(),
        wpa: haFields.wpa.value.trim(),
        wpa_key_mgmt: haFields.wpa_key_mgmt.value.trim(),
        rsn_pairwise: haFields.rsn_pairwise.value.trim(),
        wmm_enabled: haFields.wmm_enabled.value.trim(),
        macaddr_acl: haFields.macaddr_acl.value.trim(),
        auth_algs: haFields.auth_algs.value.trim()
    };

    const config = {
        interface: haFields.interface.value.trim(),
        ssid: haFields.ssid.value.trim(),
        wpa_passphrase: haFields.wpa_passphrase.value,
        channel: haFields.channel.value.trim(),
        hw_mode: haFields.hw_mode.value,
        ignore_broadcast_ssid: haFields.ignore_broadcast_ssid.checked ? '1' : '0'
    };

    Object.entries(optional).forEach(([key, value]) => {
        if (value) {
            config[key] = value;
        }
    });

    return { config, restart: haRestartAfterSave.checked };
}

nmForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(nmStatus, 'Saving hotspot settings...');
    try {
        const response = await fetch('/api/hotspot/nm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildNmPayload())
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.details || data.error || 'Save failed');
        }
        setStatus(nmStatus, 'Saved hotspot settings.', 'success');
        await loadNmStatus();
    } catch (error) {
        setStatus(nmStatus, error.message, 'error');
    }
});

createBtn.addEventListener('click', async () => {
    setStatus(nmStatus, 'Creating hotspot profile...');
    try {
        const response = await fetch('/api/hotspot/nm/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildNmCreatePayload())
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.details || data.error || 'Create failed');
        }
        setStatus(nmStatus, 'Created hotspot profile.', 'success');
        await loadNmStatus();
        connectionSelect.value = data.name;
        const selected = nmConnections.find((item) => item.name === data.name);
        populateNmForm(selected);
    } catch (error) {
        setStatus(nmStatus, error.message, 'error');
    }
});

connectionSelect.addEventListener('change', () => {
    const selected = nmConnections.find((item) => item.name === connectionSelect.value);
    populateNmForm(selected);
});

refreshBtn.addEventListener('click', (event) => {
    event.preventDefault();
    loadMode();
});

togglePassBtn.addEventListener('click', () => {
    const isPassword = nmFields.psk.type === 'password';
    nmFields.psk.type = isPassword ? 'text' : 'password';
    togglePassBtn.textContent = isPassword ? 'Hide' : 'Show';
});

async function loadRawConfig() {
    if (mode === 'networkmanager') {
        const name = connectionSelect.value;
        const response = await fetch(`/api/hotspot/nm/raw?name=${encodeURIComponent(name)}`);
        const text = await response.text();
        if (!response.ok) {
            throw new Error(text || 'Unable to load connection details');
        }
        return text;
    }

    const response = await fetch('/api/hostapd/raw');
    const text = await response.text();
    if (!response.ok) {
        throw new Error(text || 'Unable to load hostapd config');
    }
    return text;
}

viewRawBtn.addEventListener('click', async () => {
    try {
        setStatus(mode === 'hostapd' ? hostapdStatus : nmStatus, 'Loading details...');
        const text = await loadRawConfig();
        rawConfig.value = text;
        rawPanel.classList.remove('hidden');
        setStatus(mode === 'hostapd' ? hostapdStatus : nmStatus, 'Details loaded.');
    } catch (error) {
        setStatus(mode === 'hostapd' ? hostapdStatus : nmStatus, error.message, 'error');
    }
});

hideRawBtn.addEventListener('click', () => {
    rawPanel.classList.add('hidden');
});

downloadRawBtn.addEventListener('click', async () => {
    try {
        setStatus(mode === 'hostapd' ? hostapdStatus : nmStatus, 'Preparing download...');
        const text = await loadRawConfig();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = mode === 'networkmanager'
            ? `${connectionSelect.value || 'hotspot'}.nmcli.txt`
            : 'hostapd.conf';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setStatus(mode === 'hostapd' ? hostapdStatus : nmStatus, 'Download ready.', 'success');
    } catch (error) {
        setStatus(mode === 'hostapd' ? hostapdStatus : nmStatus, error.message, 'error');
    }
});

hostapdForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(hostapdStatus, 'Saving hostapd config...');
    try {
        const response = await fetch('/api/hostapd', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildHostapdPayload())
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.details || data.error || 'Save failed');
        }
        setStatus(hostapdStatus, 'Saved hostapd config.', 'success');
        await loadHostapdStatus();
    } catch (error) {
        setStatus(hostapdStatus, error.message, 'error');
    }
});

haTogglePassBtn.addEventListener('click', () => {
    const isPassword = haFields.wpa_passphrase.type === 'password';
    haFields.wpa_passphrase.type = isPassword ? 'text' : 'password';
    haTogglePassBtn.textContent = isPassword ? 'Hide' : 'Show';
});

haToggleAdvancedBtn.addEventListener('click', () => {
    const isHidden = haAdvancedFields.classList.contains('hidden');
    haAdvancedFields.classList.toggle('hidden', !isHidden);
    haToggleAdvancedBtn.textContent = isHidden ? 'Hide' : 'Show';
});

loadMode();
