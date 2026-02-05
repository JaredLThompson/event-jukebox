const form = document.getElementById('hotspotForm');
const refreshBtn = document.getElementById('refreshBtn');
const formStatus = document.getElementById('formStatus');
const managerBadge = document.getElementById('managerBadge');
const activeProfile = document.getElementById('activeProfile');
const activeDevice = document.getElementById('activeDevice');
const activeMode = document.getElementById('activeMode');
const connectionSelect = document.getElementById('connectionSelect');
const connectionName = document.getElementById('connectionName');
const togglePassBtn = document.getElementById('togglePassBtn');
const viewRawBtn = document.getElementById('viewRawBtn');
const downloadRawBtn = document.getElementById('downloadRawBtn');
const rawPanel = document.getElementById('rawPanel');
const rawConfig = document.getElementById('rawConfig');
const hideRawBtn = document.getElementById('hideRawBtn');

const fields = {
    interface: document.getElementById('interface'),
    ssid: document.getElementById('ssid'),
    psk: document.getElementById('psk'),
    channel: document.getElementById('channel'),
    band: document.getElementById('band'),
    ipv4Address: document.getElementById('ipv4Address')
};

const restartAfterSave = document.getElementById('restartAfterSave');
let connections = [];
let activeName = '';

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

function setManagerBadge(ok) {
    if (ok) {
        managerBadge.textContent = 'active';
        managerBadge.classList.remove('badge-off');
        managerBadge.classList.add('badge-on');
        return;
    }
    managerBadge.textContent = 'inactive';
    managerBadge.classList.remove('badge-on');
    managerBadge.classList.add('badge-off');
}

function populateSelect(items) {
    connectionSelect.innerHTML = '';
    items.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.name;
        option.textContent = item.name + (item.active ? ' (active)' : '');
        connectionSelect.appendChild(option);
    });
}

function populateForm(item) {
    if (!item) return;
    connectionName.value = item.name || '';
    fields.interface.value = item.iface || '';
    fields.ssid.value = item.ssid || '';
    fields.psk.value = '';
    fields.channel.value = item.channel || '';
    fields.band.value = item.band || 'bg';
    fields.ipv4Address.value = item.ipv4Addresses || '';
}

async function loadStatus() {
    setStatus('Loading hotspot settings...');
    try {
        const statusResponse = await fetch('/api/hotspot/status');
        const statusData = await statusResponse.json();
        if (statusData.mode !== 'networkmanager') {
            setManagerBadge(false);
            setStatus('NetworkManager is not active on this host.', 'error');
            return;
        }
        setManagerBadge(true);

        const response = await fetch('/api/hotspot/nm');
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Unable to load hotspot profiles');
        }
        connections = data.connections || [];
        activeName = data.active || '';
        populateSelect(connections);

        const active = connections.find((item) => item.name === activeName) || connections[0];
        if (active) {
            connectionSelect.value = active.name;
            populateForm(active);
            activeProfile.textContent = active.name || '--';
            activeDevice.textContent = active.device || active.iface || '--';
            activeMode.textContent = active.mode || 'ap';
        } else {
            activeProfile.textContent = '--';
            activeDevice.textContent = '--';
            activeMode.textContent = '--';
        }

        setStatus('Ready.');
    } catch (error) {
        setManagerBadge(false);
        setStatus(error.message, 'error');
    }
}

function buildPayload() {
    const selectedName = connectionSelect.value;
    return {
        connectionName: selectedName,
        newName: connectionName.value.trim(),
        restart: restartAfterSave.checked,
        config: {
            ssid: fields.ssid.value.trim(),
            iface: fields.interface.value.trim(),
            band: fields.band.value,
            channel: fields.channel.value.trim(),
            psk: fields.psk.value.trim(),
            ipv4Address: fields.ipv4Address.value.trim()
        }
    };
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Saving hotspot settings...');
    try {
        const response = await fetch('/api/hotspot/nm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildPayload())
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.details || data.error || 'Save failed');
        }
        setStatus('Saved hotspot settings.', 'success');
        await loadStatus();
    } catch (error) {
        setStatus(error.message, 'error');
    }
});

connectionSelect.addEventListener('change', () => {
    const selected = connections.find((item) => item.name === connectionSelect.value);
    populateForm(selected);
});

refreshBtn.addEventListener('click', (event) => {
    event.preventDefault();
    loadStatus();
});

togglePassBtn.addEventListener('click', () => {
    const isPassword = fields.psk.type === 'password';
    fields.psk.type = isPassword ? 'text' : 'password';
    togglePassBtn.textContent = isPassword ? 'Hide' : 'Show';
});

async function loadRawConfig() {
    const name = connectionSelect.value;
    const response = await fetch(`/api/hotspot/nm/raw?name=${encodeURIComponent(name)}`);
    const text = await response.text();
    if (!response.ok) {
        throw new Error(text || 'Unable to load connection details');
    }
    return text;
}

viewRawBtn.addEventListener('click', async () => {
    try {
        setStatus('Loading connection details...');
        const text = await loadRawConfig();
        rawConfig.value = text;
        rawPanel.classList.remove('hidden');
        setStatus('Connection details loaded.');
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
        link.download = `${connectionSelect.value || 'hotspot'}.nmcli.txt`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setStatus('Download ready.', 'success');
    } catch (error) {
        setStatus(error.message, 'error');
    }
});

loadStatus();
