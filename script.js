const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const topBar = document.getElementById('top-bar');
const scoreDisplay = document.getElementById('score-display');
const livesDisplay = document.getElementById('lives-display');
const finalScoreDisplay = document.getElementById('final-score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const levelDisplay = document.getElementById('level-display');
const xpBarFill = document.getElementById('xp-bar-fill');
const levelUpScreen = document.getElementById('level-up-screen');

const pauseBtn = document.getElementById('pause-btn');
const pauseScreen = document.getElementById('pause-screen');
const resumeBtn = document.getElementById('resume-btn');
const quitBtn = document.getElementById('quit-btn');
const volumeSlider = document.getElementById('volume-slider');
const volumeLabel = document.getElementById('volume-label');

// Supabase Setup
const supabaseUrl = 'https://qfppeugbiutluowvwwlr.supabase.co';
const supabaseKey = 'sb_publishable_ATeLhlG8FymVhOt21d0g2Q_BLF1WqQc';
const supabaseClient = typeof supabase !== 'undefined' ? supabase.createClient(supabaseUrl, supabaseKey) : null;

// Leaderboard Fetching
async function fetchLeaderboard() {
    if(!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('leaderboard')
            .select('player_name, score')
            .order('score', { ascending: false })
            .limit(5);

        if (error) throw error;
        
        const html = data.length > 0 
            ? data.map((row, i) => {
                let rankStr = `${i+1}.`;
                if (i === 0) rankStr = '🥇';
                else if (i === 1) rankStr = '🥈';
                else if (i === 2) rankStr = '🥉';
                
                const highlightColor = i === 0 ? '#ffd700' : i === 1 ? '#e3e3e3' : i === 2 ? '#cd7f32' : '#eee';
                const fontWeight = i < 3 ? 'bold' : 'normal';
                
                return `<li><span style="color: ${highlightColor}; font-weight: ${fontWeight};">${rankStr} ${row.player_name}</span> <span style="color: ${highlightColor}; font-weight: ${fontWeight};">${row.score}</span></li>`;
            }).join('')
            : '<li>No scores yet.</li>';
        const startList = document.getElementById('start-leaderboard-list');
        const endList = document.getElementById('end-leaderboard-list');
        const desktopList = document.getElementById('desktop-leaderboard-list');
        if(startList) startList.innerHTML = html;
        if(endList) endList.innerHTML = html;
        if(desktopList) desktopList.innerHTML = html;
        
        // Auto-sync local best score with global leaderboard if the player name matches
        const savedPlayerName = localStorage.getItem('dragonFlightPlayerName');
        if (savedPlayerName) {
            const myRow = data.find(r => r.player_name === savedPlayerName);
            if (myRow && myRow.score > highScore) {
                highScore = myRow.score;
                saveStoredHighScore(highScore);
                refreshUIHighScores(); // Update texts immediately
            }
        }
        
    } catch (err) {
        console.error('Error fetching leaderboard:', err);
        const errHtml = '<li>Failed to load.</li>';
        const startList = document.getElementById('start-leaderboard-list');
        if(startList) startList.innerHTML = errHtml;
    }
}

async function submitScore() {
    if(!supabaseClient) return;
    const nameInput = document.getElementById('player-name-input');
    const name = nameInput.value.trim().toUpperCase() || 'ANONYMOUS';
    const finalName = name.substring(0, 10);
    
    // Disable button to prevent spam
    const submitBtn = document.getElementById('submit-score-btn');
    submitBtn.disabled = true;
    submitBtn.innerText = 'Submitting...';

    try {
        // 기존 점수 확인 (동일 이름이 있는지) - 여러 개가 있을 수 있으므로 정렬하여 최상위 하나만 확인
        const fetchPromise = supabaseClient
            .from('leaderboard')
            .select('id, score')
            .eq('player_name', finalName)
            .order('score', { ascending: false });

        // 타임아웃 처리 (10초)
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000));
        const { data: results, error: fetchError } = await Promise.race([fetchPromise, timeoutPromise]);

        if (fetchError) throw fetchError;

        const existingData = results && results.length > 0 ? results[0] : null;

        if (existingData) {
            // 이미 존재하면, 새로운 점수가 더 높을 때만 업데이트
            if (score > existingData.score) {
                const { error: updateError } = await supabaseClient
                    .from('leaderboard')
                    .update({ score: score })
                    .eq('id', existingData.id);
                if (updateError) throw updateError;
            } else {
                // 점수가 낮으면 알림 후 종료
                alert(`Current score (${score}) is not higher than your best (${existingData.score})!`);
                submitBtn.innerText = 'NOT A HIGH SCORE';
                setTimeout(() => {
                    submitBtn.innerText = 'SUBMIT RANK';
                    submitBtn.disabled = false;
                }, 2000);
                return;
            }
        } else {
            // 존재하지 않으면 새로 삽입
            const { error: insertError } = await supabaseClient
                .from('leaderboard')
                .insert([{ player_name: finalName, score: score }]);
            if (insertError) throw insertError;
        }
        
        // 성공 시 로컬 닉네임 저장, UI 숨김 및 리더보드 갱신
        localStorage.setItem('dragonFlightPlayerName', finalName);
        document.getElementById('score-submit-container').classList.add('hidden');
        fetchLeaderboard();

        
    } catch (err) {
        console.error('Error submitting score:', err);
        const msg = err.message === 'Timeout' ? 'Network Timeout. Try again!' : 'Update failed. Try again!';
        submitBtn.innerText = msg;
        submitBtn.disabled = false;
    }
}

// Set canvas to full window size (constrained by css container)
function resizeCanvas() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Game State
function getStoredHighScore() {
    try { return parseInt(localStorage.getItem('dragonFlightHighScoreV2')) || 0; } catch(e) { return 0; }
}
function saveStoredHighScore(val) {
    try { localStorage.setItem('dragonFlightHighScoreV2', val); } catch(e) {}
}

let isPlaying = false;
let isPaused = false;
let score = 0;
let highScore = getStoredHighScore();
let lives = 3;
let level = 1;
let xp = 0;
let maxXp = 10;
let frameCount = 0;
let screenShakeTime = 0;
let screenShakeMagnitude = 0;
let animationId;

// Frame Rate Cap (ensures consistent speed on all monitors)
const TARGET_FPS = 60;
const FRAME_INTERVAL = 1000 / TARGET_FPS;
let lastFrameTime = 0;

// Entities
let player;
let projectiles = [];
let enemyProjectiles = [];
let enemies = [];
let particles = [];
let items = [];
let xpGems = [];
let boss = null;
let floatingTexts = [];

// --- AUDIO SYSTEM ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
let globalGain;
let sfxVolume = 0.5;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
        globalGain = audioCtx.createGain();
        globalGain.gain.value = sfxVolume;
        globalGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSound(type) {
    if (!audioCtx || globalGain.gain.value === 0) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(globalGain);
    
    const now = audioCtx.currentTime;
    
    if (type === 'shoot') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'explosion') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'levelup') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.setValueAtTime(600, now + 0.1);
        osc.frequency.setValueAtTime(800, now + 0.2);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
    } else if (type === 'boss') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(50, now + 1);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 1);
        osc.start(now);
        osc.stop(now + 1);
    }
}

// Input handling
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    ArrowDown: false,
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false
};

// Colors
const colors = {
    player: '#00ffff',
    projectile: '#ffff00',
    enemyProjectile: '#ff3333',
    enemy1: '#ff0055',
    enemy2: '#ff9900',
    boss: '#9900ff',
    item: '#00ff00',
    xpGem: '#00ffff',
    particle: ['#ff0055', '#ff9900', '#ffffff', '#00ffff', '#ff3333', '#00ff00', '#9900ff']
};

window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.code)) keys[e.code] = true;
    if ((e.code === 'Escape' || e.code === 'KeyP') && isPlaying) togglePause();
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.code)) keys[e.code] = false;
});

// Mouse / Touch handling for player movement
let targetX = canvas.width / 2;
let targetY = canvas.height - 100;
let isInteracting = false;

function handleInteractionStart(e) {
    if(!isPlaying) return;
    isInteracting = true;
    updateTargetPosition(e);
}

function handleInteractionMove(e) {
    if(!isPlaying || !isInteracting) return;
    updateTargetPosition(e);
}

function handleInteractionEnd() {
    isInteracting = false;
}

function updateTargetPosition(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    targetX = clientX - rect.left;
    targetY = clientY - rect.top;
    
    // Allow target to go slightly outside to ensure dragon reaches the very edge
    targetX = Math.max(-50, Math.min(canvas.width + 50, targetX));
    targetY = Math.max(-50, Math.min(canvas.height + 50, targetY));
}

canvas.addEventListener('mousedown', handleInteractionStart);
window.addEventListener('mousemove', handleInteractionMove);
window.addEventListener('mouseup', handleInteractionEnd);

canvas.addEventListener('touchstart', handleInteractionStart, {passive: true});
window.addEventListener('touchmove', handleInteractionMove, {passive: true});
window.addEventListener('touchend', handleInteractionEnd);

class Player {
    constructor() {
        this.width = 35; // 50% width
        this.height = 45; // 50% height
        this.x = canvas.width / 2;
        this.y = canvas.height - 100;
        this.speed = 7;
        this.color = '#00e6b8'; // Main scale color (cyan/green)
        this.wingColor = '#00997a'; // Darker for wings
        this.hornColor = '#ffd700'; // Gold horns
        this.fireRate = 10; // Fire every 10 frames
        this.weaponLevel = 1;
        this.maxWeaponLevel = 5;
        this.invulnerable = 0;
        this.baseDamage = 1; // player bullets do baseDamage
        this.magnetRadius = 80; // Distance to attract XP gems
        this.element = 'Normal'; // Normal, Fire, Ice, Lightning
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(0.5, 0.5); // Shrink the visual drawing by 50%
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        
        // Wing Flap Animation based on frameCount
        const flapOffset = Math.sin(frameCount * 0.4) * 20;
        
        // --- Left Wing (Detailed) ---
        ctx.beginPath();
        ctx.moveTo(-10, -20); // Connect to shoulder
        ctx.quadraticCurveTo(-40 - flapOffset, -40, -50 - flapOffset, -20); // Top curve
        ctx.lineTo(-65 - flapOffset, 0 + flapOffset/2); // Outer tip
        ctx.lineTo(-45 - flapOffset/2, 20 + flapOffset); // Bottom point 1
        ctx.lineTo(-30 - flapOffset/3, 10 + flapOffset/2); // Inner joint
        ctx.lineTo(-15, 25 + flapOffset/1.5); // Bottom point 2
        ctx.lineTo(-5, 10); // Connect to lower body
        ctx.closePath();
        ctx.fillStyle = this.wingColor;
        ctx.fill();
        ctx.strokeStyle = '#00cca3'; // Wing webbing lines
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // --- Right Wing (Detailed) ---
        ctx.beginPath();
        ctx.moveTo(10, -20); 
        ctx.quadraticCurveTo(40 + flapOffset, -40, 50 + flapOffset, -20);
        ctx.lineTo(65 + flapOffset, 0 + flapOffset/2); 
        ctx.lineTo(45 + flapOffset/2, 20 + flapOffset);
        ctx.lineTo(30 + flapOffset/3, 10 + flapOffset/2);
        ctx.lineTo(15, 25 + flapOffset/1.5);
        ctx.lineTo(5, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // --- Tail ---
        const tailWag = Math.sin(frameCount * 0.2) * 10;
        ctx.beginPath();
        ctx.moveTo(-8, 20);
        ctx.quadraticCurveTo(tailWag, 50, 0 + tailWag * 1.5, 70); // Wavy tail
        ctx.quadraticCurveTo(tailWag, 50, 8, 20);
        ctx.closePath();
        ctx.fillStyle = this.color;
        ctx.fill();
        
        // Tail Spikes
        ctx.fillStyle = this.hornColor;
        ctx.beginPath(); ctx.moveTo(0 + tailWag*0.5, 35); ctx.lineTo(-8 + tailWag*0.5, 45); ctx.lineTo(0 + tailWag*0.5, 50); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0 + tailWag*0.5, 35); ctx.lineTo(8 + tailWag*0.5, 45); ctx.lineTo(0 + tailWag*0.5, 50); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0 + tailWag*1.5, 65); ctx.lineTo(-10 + tailWag*1.5, 75); ctx.lineTo(0 + tailWag*1.5, 85); ctx.lineTo(10 + tailWag*1.5, 75); ctx.fill(); // Tip blade

        // --- Main Body (Scales/Torso) ---
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 28, 0, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        
        // Belly (lighter color)
        ctx.beginPath();
        ctx.ellipse(0, 2, 8, 20, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#66ffdb';
        ctx.fill();

        // --- Head/Neck ---
        // Neck
        ctx.beginPath();
        ctx.moveTo(-6, -20);
        ctx.lineTo(6, -20);
        ctx.lineTo(4, -35); // base of head
        ctx.lineTo(-4, -35);
        ctx.closePath();
        ctx.fillStyle = this.color;
        ctx.fill();

        // Head Base
        ctx.beginPath();
        ctx.moveTo(-10, -35);
        ctx.lineTo(10, -35);
        ctx.lineTo(12, -45); // temples
        ctx.lineTo(6, -55); // snout
        ctx.lineTo(-6, -55);
        ctx.lineTo(-12, -45);
        ctx.closePath();
        ctx.fill();
        
        // Horns
        ctx.fillStyle = this.hornColor;
        // Left horn
        ctx.beginPath(); ctx.moveTo(-8, -35); ctx.quadraticCurveTo(-20, -40, -22, -25); ctx.lineTo(-12, -38); ctx.fill();
        // Right horn
        ctx.beginPath(); ctx.moveTo(8, -35); ctx.quadraticCurveTo(20, -40, 22, -25); ctx.lineTo(12, -38); ctx.fill();

        // Eyes
        ctx.fillStyle = '#ff1a1a'; // Fierce red eyes
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#ff1a1a';
        ctx.beginPath(); ctx.ellipse(-5, -45, 3, 2, Math.PI/4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(5, -45, 3, 2, -Math.PI/4, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; // reset shadow
        
        ctx.restore();
    }

    update() {
        if (this.invulnerable > 0) {
            this.invulnerable--;
            // Blink effect every 10 frames
            if (Math.floor(this.invulnerable / 10) % 2 === 0) {
                return; // Skip drawing this frame
            }
        }
        // Keyboard movement overrides mouse/touch if active
        let movedWithKeys = false;
        if (keys.ArrowLeft || keys.KeyA) { this.x -= this.speed; movedWithKeys = true; }
        if (keys.ArrowRight || keys.KeyD) { this.x += this.speed; movedWithKeys = true; }
        if (keys.ArrowUp || keys.KeyW) { this.y -= this.speed; movedWithKeys = true; }
        if (keys.ArrowDown || keys.KeyS) { this.y += this.speed; movedWithKeys = true; }

        if (!movedWithKeys && isInteracting) {
            // Smoothly move towards target (Higher value = Snappier)
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            // X축은 더 기민하게(0.8), Y축은 부드럽게(0.3) 따라오도록 설정
            this.x += dx * 0.8; 
            this.y += dy * 0.3;
        } else if (movedWithKeys) {
            // Update target to current pos so it doesn't snap back
            targetX = this.x;
            targetY = this.y;
        }

        // Keep within bounds
        this.x = Math.max(this.width / 2, Math.min(canvas.width - this.width / 2, this.x));
        this.y = Math.max(this.height / 2, Math.min(canvas.height - this.height / 2, this.y));

        this.draw();

        // Auto Shoot
        if (frameCount % this.fireRate === 0) {
            this.shoot();
        }
    }

    shoot() {
        playSound('shoot');
        const snoutY = this.y - 27; // Y position of the dragon's snout scaled down (55 / 2)
        
        if (this.weaponLevel === 1) {
            // Level 1: Single powerful shot from mouth
            projectiles.push(new Projectile(this.x, snoutY));
        } else if (this.weaponLevel === 2) {
            // Level 2: Double shot from mouth
            projectiles.push(new Projectile(this.x - 5, snoutY));
            projectiles.push(new Projectile(this.x + 5, snoutY));
        } else if (this.weaponLevel === 3) {
            // Level 3: Triple shot from mouth
            projectiles.push(new Projectile(this.x, snoutY));
            projectiles.push(new Projectile(this.x - 10, snoutY, -0.5));
            projectiles.push(new Projectile(this.x + 10, snoutY, 0.5));
        } else {
            // Level 4+: Penta shot with spread from mouth
            projectiles.push(new Projectile(this.x, snoutY, 0));
            projectiles.push(new Projectile(this.x - 8, snoutY, -1));
            projectiles.push(new Projectile(this.x + 8, snoutY, 1));
            projectiles.push(new Projectile(this.x - 16, snoutY + 5, -2));
            projectiles.push(new Projectile(this.x + 16, snoutY + 5, 2));
            
            // Further levels increase fire rate
            if(this.weaponLevel > 4) {
               this.fireRate = Math.max(5, 10 - (this.weaponLevel - 4));
            }
        }
    }
}

class Projectile {
    constructor(x, y, dx = 0) {
        this.x = x;
        this.y = y;
        this.dx = dx;
        this.radius = 5; // thicker projectile matches dragon breath
        this.speed = 18; // slightly faster
        this.element = player.element; // Inherit current element
        
        if (this.element === 'Fire') {
            this.color = '#ffaa00';
            this.coreColor = '#ffff00';
            this.trailColor = 'rgba(255, 85, 0, 0.4)';
            this.shadowColor = '#ff5500';
        } else if (this.element === 'Ice') {
            this.color = '#00ffff';
            this.coreColor = '#ffffff';
            this.trailColor = 'rgba(0, 200, 255, 0.4)';
            this.shadowColor = '#00aaff';
        } else if (this.element === 'Lightning') {
            this.color = '#ffff00';
            this.coreColor = '#ffffff';
            this.trailColor = 'rgba(255, 255, 0, 0.4)';
            this.shadowColor = '#cccc00';
        } else {
            // Normal
            this.color = '#ffaa00';
            this.coreColor = '#ffff00';
            this.trailColor = 'rgba(255, 85, 0, 0.4)';
            this.shadowColor = '#ff5500';
        }
    }

    draw() {
        ctx.beginPath();
        ctx.ellipse(this.x, this.y, this.radius, this.radius * 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.shadowColor;
        ctx.fill();
        
        ctx.beginPath();
        ctx.ellipse(this.x, this.y + 2, this.radius - 2, this.radius, 0, 0, Math.PI * 2);
        ctx.fillStyle = this.coreColor;
        ctx.fill();
        
        // Trail
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + this.radius);
        ctx.lineTo(this.x, this.y + this.radius + 15);
        ctx.strokeStyle = this.trailColor;
        ctx.lineWidth = this.radius;
        ctx.stroke();
    }

    update() {
        this.y -= this.speed;
        this.x += this.dx;
        this.draw();
    }
}

class EnemyProjectile {
    constructor(x, y, dx, dy) {
        this.x = x;
        this.y = y;
        this.dx = dx;
        this.dy = dy;
        this.radius = 5;
        this.color = colors.enemyProjectile;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
    }

    update() {
        this.x += this.dx;
        this.y += this.dy;
        this.draw();
    }
}

class Enemy {
    constructor() {
        // Random size/type
        this.type = Math.random() > 0.8 ? 'tough' : 'basic';
        this.radius = this.type === 'tough' ? 25 : 15 + Math.random() * 10;
        
        this.x = Math.random() * (canvas.width - this.radius * 2) + this.radius;
        this.y = -this.radius - 10;
        
        this.speed = (Math.random() * 2 + 2) + (score * 0.005); // Speed increases with score
        if(this.type === 'tough') this.speed *= 0.7; // Tough enemies are slower
        
        this.color = this.type === 'tough' ? colors.enemy2 : colors.enemy1;
        this.hp = this.type === 'tough' ? 5 : 1;
        this.maxHp = this.hp;
        
        // Wobble effect
        this.angle = Math.random() * Math.PI * 2;
        this.wobbleSpeed = Math.random() * 0.05 + 0.02;

        // Shooting mechanics
        this.lastShotTime = frameCount + Math.random() * 60;
        this.fireRate = this.type === 'tough' ? 80 : 150; // frames between shots
        
        // Status Effects
        this.burnTimer = 0;
        this.slowTimer = 0;
        this.hitFlashTimer = 0;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        ctx.beginPath();
        if(this.type === 'tough') {
            // Hexagon for tough
            for (let i = 0; i < 6; i++) {
                ctx.lineTo(this.radius * Math.cos(i * Math.PI / 3), this.radius * Math.sin(i * Math.PI / 3));
            }
        } else {
            // Diamond for basic
            ctx.moveTo(0, -this.radius);
            ctx.lineTo(this.radius, 0);
            ctx.lineTo(0, this.radius);
            ctx.lineTo(-this.radius, 0);
        }
        ctx.closePath();
        
        if (this.hitFlashTimer > 0) {
            ctx.fillStyle = '#ffffff';
        } else {
            ctx.fillStyle = `rgba(${this.type === 'tough' ? '255,153,0' : '255,0,85'}, ${this.hp/this.maxHp})`;
        }
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
    }

    update() {
        if (this.hitFlashTimer > 0) this.hitFlashTimer--;

        // Apply Slow effect
        let currentSpeed = this.speed;
        if (this.slowTimer > 0) {
            currentSpeed *= 0.5; // 50% slow
            this.slowTimer--;
            // Ice particles
            if (frameCount % 10 === 0) particles.push(new Particle(this.x, this.y, '#00ffff'));
        }
        
        // Apply Burn effect
        if (this.burnTimer > 0) {
            if (frameCount % 30 === 0) {
                this.hp -= player.baseDamage * 0.5; // DoT tick
                particles.push(new Particle(this.x, this.y, '#ff3300'));
            }
            this.burnTimer--;
        }

        this.y += currentSpeed;
        this.angle += this.wobbleSpeed;
        this.x += Math.sin(frameCount * this.wobbleSpeed) * 1.5; // slight horizontal wave
        
        // Keep in x bounds
        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        
        this.draw();
        
        // Shoot (only if not frozen too hard, but base slow just affects movement for now)
        if (frameCount - this.lastShotTime > this.fireRate) {
            this.shoot();
            this.lastShotTime = frameCount;
        }
    }

    shoot() {
        // Aim at player if player exists
        if (player) {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            const speed = 4 + (score * 0.002);
            
            if (this.type === 'tough') {
                // 다각형(tough) 적은 3방향 확산탄(Spread) 발사
                for (let i = -1; i <= 1; i++) {
                    const spreadAngle = angle + (i * 0.4); 
                    const dx = Math.cos(spreadAngle) * speed;
                    const dy = Math.sin(spreadAngle) * speed;
                    enemyProjectiles.push(new EnemyProjectile(this.x, this.y, dx, dy));
                }
            } else {
                // 사각형(basic) 적은 단일 조준탄 발사
                const dx = Math.cos(angle) * speed;
                const dy = Math.sin(angle) * speed;
                enemyProjectiles.push(new EnemyProjectile(this.x, this.y, dx, dy));
            }
        }
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.radius = Math.random() * 3 + 1;
        const velocity = Math.random() * 5 + 2;
        const angle = Math.random() * Math.PI * 2;
        this.dx = Math.cos(angle) * velocity;
        this.dy = Math.sin(angle) * velocity;
        this.color = color;
        this.alpha = 1;
        this.decay = Math.random() * 0.02 + 0.015;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }

    update() {
        this.x += this.dx;
        this.y += this.dy;
        this.alpha -= this.decay;
        this.draw();
    }
}

class FloatingText {
    constructor(x, y, text, color) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.alpha = 1;
        this.life = 40;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = this.color;
        ctx.font = "bold 20px Outfit";
        ctx.textAlign = "center";
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }

    update() {
        this.y -= 1.5;
        this.life--;
        if (this.life < 20) this.alpha = this.life / 20;
        this.draw();
    }
}

class Item {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 12;
        this.speed = 3;
        this.color = colors.item;
        this.angle = 0;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        this.angle += 0.05;
        ctx.rotate(this.angle);
        
        ctx.beginPath();
        // Star shape for item
        for (let i = 0; i < 4; i++) {
            ctx.lineTo(this.radius, 0);
            ctx.lineTo(this.radius / 3, this.radius / 3);
            ctx.rotate(Math.PI / 2);
        }
        ctx.closePath();
        
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.restore();
    }

    update() {
        this.y += this.speed;
        this.draw();
    }
}

class XpGem {
    constructor(x, y, value = 1) {
        this.x = x;
        this.y = y;
        this.radius = 6;
        this.value = value;
        this.color = colors.xpGem;
        
        // Initial tiny explosion velocity
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2;
        this.dx = Math.cos(angle) * speed;
        this.dy = Math.sin(angle) * speed - 1; // slight upward pop
    }

    draw() {
        ctx.beginPath();
        // Diamond shape
        ctx.moveTo(this.x, this.y - this.radius);
        ctx.lineTo(this.x + this.radius, this.y);
        ctx.lineTo(this.x, this.y + this.radius);
        ctx.lineTo(this.x - this.radius, this.y);
        ctx.closePath();
        
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        
        // Inner highlight
        ctx.beginPath();
        ctx.moveTo(this.x, this.y - this.radius/2);
        ctx.lineTo(this.x + this.radius/2, this.y);
        ctx.lineTo(this.x, this.y + this.radius/2);
        ctx.lineTo(this.x - this.radius/2, this.y);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }

    update() {
        // Magnet effect to player
        let pulled = false;
        if (player && !isPaused) {
            const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
            if (distToPlayer < player.magnetRadius) {
                pulled = true;
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                // Speed scales up as it gets closer
                const pullForce = Math.max(2, 10 - (distToPlayer / 10)); 
                this.dx = Math.cos(angle) * pullForce;
                this.dy = Math.sin(angle) * pullForce;
            }
        }
        
        if (!pulled) {
            // Normal drift downwards
            this.dx *= 0.95; // Add friction to initial explosion
            this.dy += 0.05; // Gravity pull downwards
            if (this.dy > 3) this.dy = 3; // Terminal velocity
        }
        
        this.x += this.dx;
        this.y += this.dy;
        this.draw();
    }
}

class Boss {
    constructor() {
        this.x = canvas.width / 2;
        this.y = -100; // Start off-screen
        this.radius = 60;
        this.hp = 200 + (Math.floor(score / 500) * 100); // Scales with score progression
        this.maxHp = this.hp;
        this.color = colors.boss;
        this.speedX = 2; // Sideways speed
        this.speedY = 1.5; // Entry speed
        this.phase = "entering"; // entering, sideways
        
        // Attack timers
        this.lastShotTime = frameCount;
        this.attackPattern = 0; // Cycles through patterns
        this.attackTimer = 0;
        this.hitFlashTimer = 0;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Boss Shape (octagon-like)
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            ctx.lineTo(this.radius * Math.cos(i * Math.PI / 4), this.radius * Math.sin(i * Math.PI / 4));
        }
        ctx.closePath();
        
        // Pulsing glow
        const pulse = Math.abs(Math.sin(frameCount * 0.05));
        if (this.hitFlashTimer > 0) {
            ctx.fillStyle = '#ffffff';
        } else {
            ctx.fillStyle = `rgba(153, 0, 255, ${0.4 + pulse * 0.3})`;
        }
        ctx.shadowBlur = 30;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Core
        ctx.beginPath();
        ctx.arc(0, 0, this.radius / 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 51, 51, ${this.hp/this.maxHp})`;
        ctx.fill();
        
        ctx.restore();
        
        // Draw HP Bar at top of screen
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(20, 10, canvas.width - 40, 15);
        ctx.fillStyle = this.color;
        const hpPercent = Math.max(0, this.hp / this.maxHp);
        ctx.fillRect(20, 10, (canvas.width - 40) * hpPercent, 15);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(20, 10, canvas.width - 40, 15);
    }

    update() {
        if (this.hitFlashTimer > 0) this.hitFlashTimer--;

        if (this.phase === "entering") {
            this.y += this.speedY;
            if (this.y > 150) {
                this.phase = "sideways";
            }
        } else if (this.phase === "sideways") {
            this.x += this.speedX;
            if (this.x > canvas.width - this.radius || this.x < this.radius) {
                this.speedX *= -1;
            }
            this.handleAttacks();
        }
        
        this.draw();
    }

    handleAttacks() {
        this.attackTimer++;
        
        // Change pattern every 200 frames
        if (this.attackTimer > 200) {
            this.attackPattern = (this.attackPattern + 1) % 3;
            this.attackTimer = 0;
        }

        if (this.attackPattern === 0) {
            // Pattern 0: Rapid fire 5-way spread
            if (frameCount - this.lastShotTime > 20) {
                const angle = Math.PI / 2; // straight down
                for (let i = -2; i <= 2; i++) {
                    const dx = Math.cos(angle + i * 0.3) * 6;
                    const dy = Math.sin(angle + i * 0.3) * 6;
                    enemyProjectiles.push(new EnemyProjectile(this.x, this.y + this.radius, dx, dy));
                }
                this.lastShotTime = frameCount;
            }
        } else if (this.attackPattern === 1) {
            // Pattern 1: Circular burst every 50 frames
            if (frameCount - this.lastShotTime > 50) {
                for (let i = 0; i < 12; i++) {
                    const angle = (Math.PI * 2 / 12) * i;
                    const dx = Math.cos(angle) * 5;
                    const dy = Math.sin(angle) * 5;
                    enemyProjectiles.push(new EnemyProjectile(this.x, this.y, dx, dy));
                }
                this.lastShotTime = frameCount;
            }
        } else if (this.attackPattern === 2) {
            // Pattern 2: Targeted barrage (streams towards player)
            if (frameCount - this.lastShotTime > 8) {
                if(player) {
                    const angle = Math.atan2(player.y - this.y, player.x - this.x);
                    // Add slight random scatter
                    const scatter = (Math.random() - 0.5) * 0.2;
                    const dx = Math.cos(angle + scatter) * 7;
                    const dy = Math.sin(angle + scatter) * 7;
                    enemyProjectiles.push(new EnemyProjectile(this.x, this.y + this.radius, dx, dy));
                }
                this.lastShotTime = frameCount;
            }
        }
    }
}

function spawnEnemy() {
    // Stop normal spawns entirely, or heavily reduce them if boss is active
    if (boss) return; 

    // Spawn boss every 500 score (e.g. at 500, 1000, 1500)
    if (score > 0 && score % 500 === 0 && !boss) {
        boss = new Boss();
        score += 10; // offset score so we don't spam spawn bosses
        return;
    }

    // Spawn rate increases with score
    const spawnChance = 60 - Math.min(40, Math.floor(score / 50));
    if (frameCount % spawnChance === 0) {
        enemies.push(new Enemy());
    }
}

function createExplosion(x, y, type) {
    const count = type === 'tough' ? 30 : 15;
    for (let i = 0; i < count; i++) {
        const color = colors.particle[Math.floor(Math.random() * colors.particle.length)];
        particles.push(new Particle(x, y, color));
    }
}

// Background stars (4 layers for parallax)
const stars = [];
const starColors = ['#ffffff', '#00ffff', '#ffddaa', '#aaffff', '#ffbbee'];
for(let i=0; i<4; i++) {
    const layerStars = Array(40).fill().map(() => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * (i + 1) * 0.8 + 0.5,
        speed: (i + 1) * 0.5 + Math.random() * 0.5,
        alpha: (i + 1) * 0.25,
        color: starColors[Math.floor(Math.random() * starColors.length)]
    }));
    stars.push(layerStars);
}

function drawBackground() {
    ctx.fillStyle = 'rgba(5, 5, 16, 0.4)'; // Trail effect
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add speed warp effect when boss is present or at high score
    const speedMultiplier = boss ? 3 : (1 + (score * 0.0002));
    
    stars.forEach((layer, layerIndex) => {
        layer.forEach(star => {
            ctx.fillStyle = star.color;
            ctx.globalAlpha = star.alpha;
            ctx.beginPath();
            ctx.ellipse(star.x, star.y, star.size, star.size * Math.max(1, speedMultiplier * 0.8), 0, 0, Math.PI * 2);
            ctx.fill();
            star.y += (star.speed + (score * 0.001 * (layerIndex + 1))) * speedMultiplier;
            
            if (star.y > canvas.height) {
                star.y = 0;
                star.x = Math.random() * canvas.width;
            }
        });
    });
    ctx.globalAlpha = 1;
}

function updateLivesDisplay() {
    livesDisplay.innerText = '❤️'.repeat(Math.max(0, lives));
}

function updateScoreDisplay() {
    scoreDisplay.innerText = score;
    // Update real-time high score if playing
    if (score > highScore) {
        highScore = score;
        saveStoredHighScore(highScore); // Now saves immediately when broken!
        const topBarHighScore = document.getElementById('top-bar-high-score');
        if (topBarHighScore) {
            topBarHighScore.innerText = highScore;
        }
    }
}

function takeDamage() {
    if (player.invulnerable > 0) return;
    
    lives--;
    updateLivesDisplay();
    
    createExplosion(player.x, player.y, 'basic');
    playSound('explosion');
    triggerScreenShake(15, 8); // Shake duration, magnitude
    
    if (lives <= 0) {
        gameOver();
    } else {
        player.invulnerable = 120; // 2 seconds i-frames
        player.weaponLevel = Math.max(1, player.weaponLevel - 1); // Lose 1 weapon level on hit
    }
}

function triggerScreenShake(time, magnitude) {
    screenShakeTime = time;
    screenShakeMagnitude = magnitude;
}

function updateXpDisplay() {
    const xpPercent = Math.min(100, (xp / maxXp) * 100);
    if(xpBarFill) xpBarFill.style.width = `${xpPercent}%`;
    if(levelDisplay) levelDisplay.innerText = `LV. ${level}`;
}

function initGame() {
    resizeCanvas();
    player = new Player();
    projectiles = [];
    enemyProjectiles = [];
    enemies = [];
    particles = [];
    items = [];
    xpGems = [];
    floatingTexts = [];
    boss = null;
    score = 0;
    lives = 3;
    level = 1;
    xp = 0;
    maxXp = 10;
    frameCount = 0;
    isPaused = false;
    lastFrameTime = 0;
    updateScoreDisplay();
    updateLivesDisplay();
    updateXpDisplay();
    targetX = player.x;
    targetY = player.y;
    isInteracting = false;
}

function checkLevelUp() {
    if (xp >= maxXp) {
        xp -= maxXp; // Keep remainder, or reset to 0 based on preference
        maxXp = Math.floor(maxXp * 1.5); // Increase next level requirement
        level++;
        playSound('levelup');
        updateXpDisplay();
        triggerLevelUp();
    }
}

function triggerLevelUp() {
    isPaused = true; // Stop the animate loop logic
    levelUpScreen.classList.remove('hidden');
    // We will populate upgrade choices dynamically here later
    const upgradeCardsContainer = document.getElementById('upgrade-cards');
    upgradeCardsContainer.innerHTML = ''; // Clear old

    let choices = [];
    if (level % 5 === 0) {
        // Elemental Upgrade Level
        choices = getElementalUpgrades(3);
        document.getElementById('level-up-title').innerText = "ELEMENTAL AWAKENING!";
        document.getElementById('level-up-title').style.color = "#00ffff";
    } else {
        // Standard Upgrade Level
        choices = getStandardUpgrades(3);
        document.getElementById('level-up-title').innerText = "LEVEL UP!";
        document.getElementById('level-up-title').style.color = "#ffd700";
    }

    choices.forEach((upgrade, index) => {
        const card = document.createElement('div');
        card.className = `upgrade-card ${upgrade.cssClass || ''}`;
        card.onclick = () => applyUpgrade(upgrade);
        card.innerHTML = `
            <div class="upgrade-icon">${upgrade.icon}</div>
            <h3 class="upgrade-name">${upgrade.name}</h3>
            <p class="upgrade-text">${upgrade.desc}</p>
        `;
        upgradeCardsContainer.appendChild(card);
    });
}

function getStandardUpgrades(count) {
    const pool = [
        { id: 'weapon', name: 'Weapon Up', icon: '⚔️', desc: 'Increase projectiles', weight: player.weaponLevel < player.maxWeaponLevel ? 10 : 0 },
        { id: 'fireRate', name: 'Attack Speed', icon: '⚡', desc: 'Fire faster', weight: player.fireRate > 2 ? 8 : 0 },
        { id: 'damage', name: 'Damage Up', icon: '💥', desc: 'Increase bullet damage', weight: 8 },
        { id: 'speed', name: 'Agility', icon: '💨', desc: 'Move faster', weight: player.speed < 15 ? 5 : 0 },
        { id: 'heart', name: 'Heart Up', icon: '❤️', desc: '+1 Max Life & Heal', weight: 3 },
        { id: 'magnet', name: 'Magnet', icon: '🧲', desc: 'Increase XP pickup range', weight: 5 }
    ];
    
    // Filter available options based on weights
    const available = pool.filter(o => o.weight > 0);
    // Shuffle and pick
    available.sort(() => 0.5 - Math.random());
    return available.slice(0, Math.min(count, available.length));
}

function getElementalUpgrades(count) {
    // Only offer elements the player doesn't already have as their main element, or just offer all for swapping
    const pool = [
        { id: 'ele_fire', name: 'Fire Dragon', icon: '🔥', desc: 'Fireballs burn enemies over time', cssClass: 'fire' },
        { id: 'ele_ice', name: 'Ice Dragon', icon: '❄️', desc: 'Attacks slow enemy movement', cssClass: 'ice' },
        { id: 'ele_lightning', name: 'Storm Dragon', icon: '🌩️', desc: 'Attacks arc to nearby enemies', cssClass: 'lightning' }
    ];
    
    pool.sort(() => 0.5 - Math.random());
    return pool.slice(0, count);
}

function applyUpgrade(upgrade) {
    if (upgrade.id === 'weapon') player.weaponLevel++;
    else if (upgrade.id === 'fireRate') player.fireRate = Math.max(2, player.fireRate - 1);
    else if (upgrade.id === 'damage') player.baseDamage += 1;
    else if (upgrade.id === 'speed') player.speed += 1.5;
    else if (upgrade.id === 'heart') { lives++; updateLivesDisplay(); }
    else if (upgrade.id === 'magnet') player.magnetRadius += 30;
    
    else if (upgrade.id === 'ele_fire') setElement('Fire');
    else if (upgrade.id === 'ele_ice') setElement('Ice');
    else if (upgrade.id === 'ele_lightning') setElement('Lightning');
    
    resumeGame();
}

function setElement(elem) {
    player.element = elem;
    if (elem === 'Fire') {
        player.color = '#ff3300';
        player.wingColor = '#cc0000';
        player.hornColor = '#111111'; // obsidian horns
    } else if (elem === 'Ice') {
        player.color = '#00ffff';
        player.wingColor = '#0099ff';
        player.hornColor = '#e6ffff';
    } else if (elem === 'Lightning') {
        player.color = '#ffff00';
        player.wingColor = '#cca300';
        player.hornColor = '#ffffff';
    }
}

function resumeGame() {
    levelUpScreen.classList.add('hidden');
    isPaused = false;
    
    // Clear keyboard states to prevent stuck movement after unpausing
    for (let key in keys) {
        keys[key] = false;
    }
}

function animate(currentTime) {
    // Reset screen shake state properly before a new animation frame starts
    ctx.setTransform(1, 0, 0, 1, 0, 0); 

    if (!isPlaying) return;
    
    // Always request the next frame so background can still draw and we can unpause
    animationId = requestAnimationFrame(animate);
    
    // Frame rate cap: skip this frame if not enough time has passed
    if (!lastFrameTime) lastFrameTime = currentTime;
    const elapsed = currentTime - lastFrameTime;
    if (elapsed < FRAME_INTERVAL) {
        // Still draw background and static elements for smooth visuals
        if (isPaused) {
            drawBackground();
            player.draw();
            boss && boss.draw();
            enemies.forEach(e => e.draw());
            xpGems.forEach(x => x.draw());
            items.forEach(i => i.draw());
            projectiles.forEach(p => p.draw());
            enemyProjectiles.forEach(ep => ep.draw());
            particles.forEach(p => p.draw());
            floatingTexts.forEach(ft => ft.draw());
        }
        return;
    }
    lastFrameTime = currentTime - (elapsed % FRAME_INTERVAL); // Account for remainder
    
    // If paused (e.g., Level Up screen), draw background but don't update game logic
    if (isPaused) {
        drawBackground();
        player.draw();
        
        // Draw things statically
        boss && boss.draw();
        enemies.forEach(e => e.draw());
        xpGems.forEach(x => x.draw());
        items.forEach(i => i.draw());
        projectiles.forEach(p => p.draw());
        enemyProjectiles.forEach(ep => ep.draw());
        particles.forEach(p => p.draw());
        floatingTexts.forEach(ft => ft.draw());
        return; 
    }
    
    frameCount++;
    
    // Apply Screen Shake
    if (screenShakeTime > 0) {
        screenShakeTime--;
        const dx = (Math.random() - 0.5) * screenShakeMagnitude;
        const dy = (Math.random() - 0.5) * screenShakeMagnitude;
        ctx.translate(dx, dy);
    }
    
    drawBackground();
    
    spawnEnemy();
    
    if (boss) boss.update();

    player.update();
    
    // Update Items and Collisions
    for (let i = items.length - 1; i >= 0; i--) {
        items[i].update();
        
        // Check collision with player
        const distToPlayer = Math.hypot(player.x - items[i].x, player.y - items[i].y);
        if (distToPlayer - player.width / 2 - items[i].radius < 0) {
            // Upgrade weapon
            player.weaponLevel++;
            
            // Pickup effect
            for(let p = 0; p < 15; p++) {
                particles.push(new Particle(items[i].x, items[i].y, colors.item));
            }
            items.splice(i, 1);
            continue;
        }
        
        // Remove off-screen items
        if (items[i] && items[i].y > canvas.height + items[i].radius) {
            items.splice(i, 1);
        }
    }
    
    // Update XP Gems
    for (let i = xpGems.length - 1; i >= 0; i--) {
        xpGems[i].update();
        
        // Check collision with player
        const distToPlayer = Math.hypot(player.x - xpGems[i].x, player.y - xpGems[i].y);
        if (distToPlayer - player.width / 3 - xpGems[i].radius < 0) {
            // Collect XP
            xp += xpGems[i].value;
            updateXpDisplay();
            
            // Small sound/particle combo for xp
            for(let p = 0; p < 3; p++) {
                particles.push(new Particle(xpGems[i].x, xpGems[i].y, colors.xpGem));
            }
            xpGems.splice(i, 1);
            
            checkLevelUp(); // See if we reached the max
            continue;
        }
        
        // Remove off-screen gems if they fell past
        if (xpGems[i] && xpGems[i].y > canvas.height + 50) {
            xpGems.splice(i, 1);
        }
    }

    // Update Floating Texts
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].update();
        if (floatingTexts[i].life <= 0) {
            floatingTexts.splice(i, 1);
        }
    }

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].alpha <= 0) {
            particles.splice(i, 1);
        }
    }
    
    // Update Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        projectiles[i].update();
        
        // Remove off-screen projectiles
        if (projectiles[i].y + projectiles[i].radius < 0) {
            projectiles.splice(i, 1);
        }
    }

    // Update Enemy Projectiles
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
        enemyProjectiles[i].update();
        
        // Check collision with player
        let hitPlayer = false;
        if (player && player.invulnerable <= 0) {
            const distToPlayer = Math.hypot(player.x - enemyProjectiles[i].x, player.y - enemyProjectiles[i].y);
            if (distToPlayer - player.width / 3 - enemyProjectiles[i].radius < 0) {
                hitPlayer = true;
                takeDamage();
            }
        }

        // Remove off-screen enemy projectiles
        if (hitPlayer || enemyProjectiles[i].y > canvas.height || enemyProjectiles[i].x < 0 || enemyProjectiles[i].x > canvas.width || enemyProjectiles[i].y < 0) {
            enemyProjectiles.splice(i, 1);
        }
    }
    
    // Boss & Projectile Collision
    if (boss) {
        // Boss hits player
        if (player && player.invulnerable <= 0) {
            const bossDist = Math.hypot(player.x - boss.x, player.y - boss.y);
            if (bossDist - boss.radius - 15 < 0) {
                takeDamage();
            }
        }

        // Projectiles hit Boss
        for (let j = projectiles.length - 1; j >= 0; j--) {
            const p = projectiles[j];
            const dist = Math.hypot(p.x - boss.x, p.y - boss.y);
            
            if (dist - boss.radius - p.radius < 0) {
                boss.hp -= 2; // player bullets do 2 damage
                boss.hitFlashTimer = 3;
                playSound('hit');
                projectiles.splice(j, 1);
                
                // Hit effect
                particles.push(new Particle(p.x, p.y, colors.item));

                if (boss.hp <= 0) {
                    // Boss Dies
                    playSound('explosion');
                    triggerScreenShake(40, 15); // Big shake when boss dies
                    createExplosion(boss.x, boss.y, 'tough');
                    createExplosion(boss.x - 30, boss.y + 20, 'tough');
                    createExplosion(boss.x + 30, boss.y + 20, 'basic');
                    
                    floatingTexts.push(new FloatingText(boss.x, boss.y, '+500', '#ffd700'));
                    score += 500;
                    updateScoreDisplay();
                    scoreDisplay.style.transform = 'scale(2)';
                    setTimeout(() => { scoreDisplay.style.transform = 'scale(1)'; }, 200);

                    // Drop 3-4 items
                    for(let i=0; i < 3 + Math.random()*2; i++) {
                        items.push(new Item(boss.x + (Math.random()-0.5)*100, boss.y));
                    }
                    
                    boss = null;
                    break;
                }
            }
        }
    }

    // Update Enemies & Collision Detection
    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].update();
        
        // Player vs Enemy Collision (Distance based)
        if (player && player.invulnerable <= 0) {
            const distToPlayer = Math.hypot(player.x - enemies[i].x, player.y - enemies[i].y);
            // Player hitbox approximation
            if (distToPlayer - enemies[i].radius - 15 < 0) {
                takeDamage();
                // Destroy the enemy that hit the player
                enemies.splice(i, 1);
                continue;
            }
        }
        
        // Projectile vs Enemy Collision
        for (let j = projectiles.length - 1; j >= 0; j--) {
            const projectile = projectiles[j];
            const distToProj = Math.hypot(projectile.x - enemies[i].x, projectile.y - enemies[i].y);
            
            if (distToProj - enemies[i].radius - projectile.radius < 0) {
                // Hit
                projectiles.splice(j, 1);
                enemies[i].hp -= player.baseDamage;
                enemies[i].hitFlashTimer = 3;
                playSound('hit');
                
                // Elemental Effects On Hit
                if (projectile.element === 'Fire') {
                    enemies[i].burnTimer = 150; // 2.5 seconds burn
                } else if (projectile.element === 'Ice') {
                    enemies[i].slowTimer = 120; // 2 seconds slow
                } else if (projectile.element === 'Lightning') {
                    // Chain to nearest enemy
                    let closestEnemy = null;
                    let minDist = 150; // max bounce distance
                    
                    for (let k = 0; k < enemies.length; k++) {
                        if (k === i) continue; // skip self
                        const bounceDist = Math.hypot(enemies[k].x - enemies[i].x, enemies[k].y - enemies[i].y);
                        if (bounceDist < minDist) {
                            minDist = bounceDist;
                            closestEnemy = enemies[k];
                        }
                    }
                    
                    if (closestEnemy) {
                        closestEnemy.hp -= player.baseDamage * 0.7; // 70% bounce damage
                        
                        // Draw lightning arc visually
                        ctx.beginPath();
                        ctx.moveTo(enemies[i].x, enemies[i].y);
                        ctx.lineTo(closestEnemy.x, closestEnemy.y);
                        ctx.strokeStyle = '#ffff00';
                        ctx.lineWidth = 3;
                        ctx.stroke();
                        
                        // Hit effect on secondary target
                        for(let p=0; p<3; p++) particles.push(new Particle(closestEnemy.x, closestEnemy.y, '#ffff00'));
                        
                        // Check if secondary died
                        if (closestEnemy.hp <= 0) {
                            createExplosion(closestEnemy.x, closestEnemy.y, closestEnemy.type);
                            score += closestEnemy.type === 'tough' ? 50 : 10;
                            updateScoreDisplay();
                            
                            // Drop XP for bounced kill
                            const xpAmount = closestEnemy.type === 'tough' ? 5 : 1;
                            for(let x = 0; x < xpAmount; x++) xpGems.push(new XpGem(closestEnemy.x, closestEnemy.y, 1));
                            
                            // Remove immediately to avoid array mutation issues, handled via filter or splice
                            // In this case, we just set HP to deeply negative so main loop catches it, 
                            // or leave it for the main loop to clean up next frame to avoid breaking the `i` index cleanly.
                        }
                    }
                }
                
                // Create small hit effect
                for(let k=0; k<3; k++) {
                    particles.push(new Particle(projectile.x, projectile.y, '#ffffff'));
                }
                
                if (enemies[i].hp <= 0) {
                    // Destroy enemy
                    playSound('explosion');
                    createExplosion(enemies[i].x, enemies[i].y, enemies[i].type);
                    const scoreGain = enemies[i].type === 'tough' ? 50 : 10;
                    floatingTexts.push(new FloatingText(enemies[i].x, enemies[i].y - 20, '+' + scoreGain, '#00ffff'));
                    score += scoreGain;
                    updateScoreDisplay();
                    
                    // Score pop effect
                    scoreDisplay.style.transform = 'scale(1.5)';
                    scoreDisplay.style.color = '#fff';
                    setTimeout(() => {
                        if(scoreDisplay) {
                            scoreDisplay.style.transform = 'scale(1)';
                            scoreDisplay.style.color = '#00ffff';
                        }
                    }, 100);
                    
                    // Drop XP
                    const xpAmount = enemies[i].type === 'tough' ? 5 : 1;
                    for(let x = 0; x < xpAmount; x++) {
                        xpGems.push(new XpGem(enemies[i].x, enemies[i].y, 1)); // 1 value per gem
                    }
                    
                    // 5% Chance to drop weapon upgrade item
                    if (Math.random() < 0.05) {
                        items.push(new Item(enemies[i].x, enemies[i].y));
                    }
                    
                    enemies.splice(i, 1);
                    break; // Move to next enemy
                }
            }
        }
        
        // Remove off-screen enemies
        if (enemies[i] && enemies[i].y - enemies[i].radius > canvas.height) {
            enemies.splice(i, 1);
        }
    }
}

function startGame() {
    initAudio();
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    topBar.classList.add('visible');
    pauseBtn.style.display = 'block';
    
    // Pull the latest high score from storage just in case
    highScore = getStoredHighScore();
    
    // Make sure high score is shown at start
    const topBarHighScore = document.getElementById('top-bar-high-score');
    if (topBarHighScore) topBarHighScore.innerText = highScore;
    
    initGame();
    isPlaying = true;
    animate();
}

function gameOver() {
    isPlaying = false;
    cancelAnimationFrame(animationId);
    pauseBtn.style.display = 'none';
    
    // Save high score unconditionally as it represents the highest score achieved
    saveStoredHighScore(highScore);
    
    // Big explosion at player
    playSound('explosion');
    triggerScreenShake(30, 12);
    createExplosion(player.x, player.y, 'tough');
    for(let i=0; i<30; i++) particles[i].update(); // pre-warm
    
    setTimeout(() => {
        topBar.classList.remove('visible');
        gameOverScreen.classList.remove('hidden');
        finalScoreDisplay.innerText = score;
        
        const endHighScore = document.getElementById('end-high-score');
        if(endHighScore) endHighScore.innerText = highScore;
        
        // Setup Submit UI
        const submitContainer = document.getElementById('score-submit-container');
        if(score > 0) {
            submitContainer.classList.remove('hidden');
            const submitBtn = document.getElementById('submit-score-btn');
            if(submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'SUBMIT RANK';
            }
        } else {
            submitContainer.classList.add('hidden');
        }
        
        fetchLeaderboard(); // refresh when dying
    }, 500);
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
const submitScoreBtn = document.getElementById('submit-score-btn');
if(submitScoreBtn) submitScoreBtn.addEventListener('click', submitScore);

// --- PAUSE & AUDIO LOGIC ---
function togglePause() {
    if (!isPlaying || levelUpScreen.classList.contains('hidden') === false) return;
    isPaused = !isPaused;
    if (isPaused) {
        pauseScreen.classList.remove('hidden');
        pauseBtn.style.display = 'none';
        for (let key in keys) { keys[key] = false; }
    } else {
        pauseScreen.classList.add('hidden');
        pauseBtn.style.display = 'block';
    }
}
if(pauseBtn) pauseBtn.addEventListener('click', togglePause);
if(resumeBtn) resumeBtn.addEventListener('click', togglePause);
if(quitBtn) quitBtn.addEventListener('click', () => { location.reload(); });
if(volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
        sfxVolume = parseFloat(e.target.value);
        volumeLabel.innerText = Math.round(sfxVolume * 100) + '%';
        if (globalGain) globalGain.gain.value = sfxVolume;
    });
}

// Initialize UI on load
function refreshUIHighScores() {
    const highScoreDisplay = document.getElementById('high-score-display');
    if (highScoreDisplay) highScoreDisplay.innerText = `BEST: ${highScore}`;
    const topBarHighScoreDisplay = document.getElementById('top-bar-high-score');
    if (topBarHighScoreDisplay) topBarHighScoreDisplay.innerText = highScore;
}
refreshUIHighScores();

// Restore previous player name if exists
const savedName = localStorage.getItem('dragonFlightPlayerName');
const nameInput = document.getElementById('player-name-input');
if (savedName && nameInput) nameInput.value = savedName;

// Draw initial static background
drawBackground();

// Fetch Leaderboard on load
fetchLeaderboard();
