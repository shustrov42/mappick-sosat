const MAPS = [
    { id: 'ancient', name: 'Ancient', class: 'map-ancient' },
    { id: 'anubis', name: 'Anubis', class: 'map-anubis' },
    { id: 'dust2', name: 'Dust II', class: 'map-dust2' },
    { id: 'inferno', name: 'Inferno', class: 'map-inferno' },
    { id: 'mirage', name: 'Mirage', class: 'map-mirage' },
    { id: 'nuke', name: 'Nuke', class: 'map-nuke' },
    { id: 'overpass', name: 'Overpass', class: 'map-overpass' }
];

let state = {
    teamA: 'ВЕРХНЯЯ',
    teamB: 'НИЖНЯЯ',
    format: 'BO1',
    startingTeam: null, // null, 'A', or 'B'
    currentTurn: null, // 'A' or 'B'
    currentStep: 0,
    mapsLeft: [...MAPS],
    bannedMaps: [],
    pickedMaps: [],
    history: [],
    actionStack: [] // To support Undo
};

// UI Elements
const setupScreen = document.getElementById('setup-screen');
const vetoScreen = document.getElementById('veto-screen');
const resultScreen = document.getElementById('result-screen');
const mapsContainer = document.getElementById('maps-container');
const logList = document.getElementById('log-list');
const teamANameInput = document.getElementById('teamA');
const teamBNameInput = document.getElementById('teamB');
const startBtn = document.getElementById('start-btn');
const flipBtn = document.getElementById('flip-btn');
const coin = document.getElementById('coin');
const coinResult = document.getElementById('coin-result');

// Initialize
document.querySelectorAll('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.format = btn.dataset.format;
    });
});

let currentCoinRotation = 0;

// Coin Flip Logic
flipBtn.addEventListener('click', () => {
    flipBtn.disabled = true;
    startBtn.disabled = true;
    startBtn.classList.add('disabled');
    coinResult.innerText = `Бросаем...`;
    coinResult.style.color = 'var(--text-muted)';
    
    // Better randomness using crypto API
    const randomBuffer = new Uint32Array(1);
    const randomNum = window.crypto ? window.crypto.getRandomValues(randomBuffer)[0] / 4294967296 : Math.random();
    const winner = randomNum < 0.5 ? 0 : 1; // 0 = Team A, 1 = Team B
    
    // We want at least 4 full spins (1440 deg) from the base
    const extraSpins = 4 * 360; 
    let baseRotation = currentCoinRotation - (currentCoinRotation % 360);
    
    // If winner is B (1), we add 180 to land on Tails, otherwise 0 for Heads
    let targetRotation = baseRotation + extraSpins + (winner === 1 ? 180 : 0);
    
    // Apply jump animation to container
    const coinContainer = document.getElementById('coin-container');
    coinContainer.classList.remove('jump');
    void coinContainer.offsetWidth; // trigger reflow
    coinContainer.classList.add('jump');
    
    // Apply spin to coin
    coin.style.transition = 'transform 1.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    coin.style.transform = `rotateY(${targetRotation}deg)`;
    currentCoinRotation = targetRotation;
    
    setTimeout(() => {
        state.startingTeam = winner === 0 ? 'A' : 'B';
        const teamName = winner === 0 ? teamANameInput.value : teamBNameInput.value;
        coinResult.innerText = `Победитель монетки: ${teamName}!`;
        coinResult.style.color = '#fff';
        
        startBtn.disabled = false;
        startBtn.classList.remove('disabled');
        flipBtn.disabled = false;
        flipBtn.innerText = "ПЕРЕБРОСИТЬ"; // Allow flipping again if they want
    }, 1500);
});

startBtn.addEventListener('click', () => {
    state.teamA = teamANameInput.value || 'ВЕРХНЯЯ';
    state.teamB = teamBNameInput.value || 'НИЖНЯЯ';
    state.currentTurn = state.startingTeam;
    
    setupScreen.classList.remove('active');
    vetoScreen.classList.add('active');
    
    initVeto();
});

function initVeto() {
    renderMaps();
    updateTurnUI();
}

function renderMaps() {
    mapsContainer.innerHTML = '';
    MAPS.forEach(map => {
        const isBanned = state.bannedMaps.find(m => m.id === map.id);
        const isPicked = state.pickedMaps.find(m => m.id === map.id);
        
        const lastAction = state.actionStack[state.actionStack.length - 1];
        const isLast = lastAction && lastAction.mapId === map.id;
        
        const card = document.createElement('div');
        card.className = `map-card ${isBanned ? 'banned' : ''} ${isPicked ? 'picked' : ''} ${isLast ? 'last-action' : ''}`;
        card.innerHTML = `
            <div class="map-bg ${map.class}"></div>
            <div class="map-info">
                <div class="map-status">${isBanned ? 'BANNED' : isPicked ? 'PICKED' : 'AVAILABLE'}</div>
            </div>
        `;
        
        card.onclick = () => handleMapAction(map);
        
        mapsContainer.appendChild(card);
    });
}

function handleMapAction(map) {
    const isBanned = state.bannedMaps.find(m => m.id === map.id);
    const isPicked = state.pickedMaps.find(m => m.id === map.id);
    
    // Undo Logic: If user clicks the last performed action again
    if (isBanned || isPicked) {
        const lastAction = state.actionStack[state.actionStack.length - 1];
        if (lastAction && lastAction.mapId === map.id) {
            undoAction(map);
            return;
        }
        return; // Clicked a non-last card, do nothing
    }

    // Normal Logic: BAN or PICK
    const action = getActionForCurrentStep();
    const teamName = state.currentTurn === 'A' ? state.teamA : state.teamB;
    
    if (action === 'BAN' || action === 'БАН') {
        state.bannedMaps.push(map);
    } else {
        state.pickedMaps.push(map);
    }
    
    state.actionStack.push({ mapId: map.id, action: action });
    state.mapsLeft = state.mapsLeft.filter(m => m.id !== map.id);
    addToLog(teamName, action, map.name);
    
    state.currentStep++;
    
    if (isGameOver()) {
        showResults();
    } else {
        state.currentTurn = state.currentTurn === 'A' ? 'B' : 'A';
        updateTurnUI();
        renderMaps();
    }
}

function undoAction(map) {
    const lastAction = state.actionStack.pop();
    if (!lastAction) return;

    // Revert state
    if (lastAction.action === 'BAN') {
        state.bannedMaps = state.bannedMaps.filter(m => m.id !== map.id);
    } else {
        state.pickedMaps = state.pickedMaps.filter(m => m.id !== map.id);
    }
    
    state.mapsLeft.push(map);
    state.currentStep--;
    state.currentTurn = state.currentTurn === 'A' ? 'B' : 'A'; // Go back
    
    // UI Cleanup
    state.history.pop();
    logList.removeChild(logList.firstChild); // Remove top entry from UI log list
    
    updateTurnUI();
    renderMaps();
}

function getActionForCurrentStep() {
    if (state.format === 'BO1') {
        // BO1: All 6 are bans
        return 'BAN';
    } else {
        // BO3: 
        // 0: Ban A, 1: Ban B
        // 2: Pick A, 3: Pick B
        // 4: Ban A, 5: Ban B
        if (state.currentStep <= 1) return 'BAN';
        if (state.currentStep <= 3) return 'PICK';
        return 'BAN';
    }
}

function updateTurnUI() {
    const currentTeamName = state.currentTurn === 'A' ? state.teamA : state.teamB;
    document.getElementById('current-turn-team').innerText = currentTeamName;
    document.getElementById('current-action').innerText = getActionForCurrentStep();
}

function addToLog(team, action, map) {
    const li = document.createElement('li');
    // For logging, map "BAN" -> "BANNED" and "PICK" -> "PICKED"
    const actionPastTense = action === 'BAN' ? 'BANNED' : 'PICKED';
    li.innerHTML = `<span class="team">${team}</span> <span class="action">${actionPastTense}</span> <span class="map">${map}</span>`;
    logList.prepend(li); // Show latest at top
    state.history.push(`${team} ${action} ${map}`);
}

function isGameOver() {
    if (state.format === 'BO1') {
        return state.bannedMaps.length === 6;
    } else {
        return state.currentStep === 6; // 6 actions (2 bans, 2 picks, 2 bans) -> 1 left
    }
}

function showResults() {
    vetoScreen.classList.remove('active');
    resultScreen.classList.add('active');
    
    const finalMapDisplay = document.getElementById('final-maps-display');
    finalMapDisplay.innerHTML = '';
    
    if (state.format === 'BO1') {
        const lastMap = state.mapsLeft[0];
        document.getElementById('final-map-title').innerText = 'ФИНАЛЬНАЯ КАРТА';
        createFinalMapCard(lastMap, 'ИГРАЕМ', finalMapDisplay);
    } else {
        document.getElementById('final-map-title').innerText = 'ВЫБРАННЫЕ КАРТЫ';
        createFinalMapCard(state.pickedMaps[0], 'КАРТА 1', finalMapDisplay);
        createFinalMapCard(state.pickedMaps[1], 'КАРТА 2', finalMapDisplay);
        createFinalMapCard(state.mapsLeft[0], 'DECIDER', finalMapDisplay);
    }
}

function createFinalMapCard(map, label, container) {
    const div = document.createElement('div');
    div.className = 'map-card picked final-card';
    div.innerHTML = `
        <div class="map-bg ${map.class}"></div>
        <div class="map-info">
            <div class="map-status">${label}</div>
        </div>
    `;
    container.appendChild(div);
}

// Global actions
document.getElementById('restart-btn').onclick = () => location.reload();

document.getElementById('copy-btn').onclick = () => {
    let text = `Итог вето CS2 (${state.format})\n`;
    text += `${state.teamA} vs ${state.teamB}\n\n`;
    
    if (state.format === 'BO1') {
        text += `ФИНАЛЬНАЯ КАРТА: ${state.mapsLeft[0].name}\n`;
    } else {
        text += `КАРТА 1: ${state.pickedMaps[0].name} (пик ${state.teamA})\n`;
        text += `КАРТА 2: ${state.pickedMaps[1].name} (пик ${state.teamB})\n`;
        text += `DECIDER: ${state.mapsLeft[0].name}\n`;
    }
    
    text += `\nИстория:\n` + state.history.join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
        alert('Результаты скопированы в буфер обмена!');
    });
};
