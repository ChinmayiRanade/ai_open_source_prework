// Game client for Mini MMORPG
class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // Game state
        this.myPlayerId = null;
        this.players = {};
        this.avatars = {};
        this.myPosition = { x: 0, y: 0 };
        
        // Camera/viewport
        this.camera = { x: 0, y: 0 };
        
        // WebSocket
        this.socket = null;
        this.connectionState = 'disconnected';
        
        // Rendering
        this.needsRedraw = true;
        
        // Movement
        this.keysPressed = {};
        this.movementDirections = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right'
        };
        
        // UI Elements
        this.ui = {
            loadingScreen: null,
            gameUI: null,
            connectionStatus: null,
            statusText: null,
            statusIndicator: null,
            playerUsername: null,
            playerPosition: null,
            playersOnline: null,
            statusMessage: null
        };
        
        this.init();
    }
    
    init() {
        this.setupUI();
        this.setupCanvas();
        this.loadWorldMap();
        this.setupKeyboardControls();
        this.connectToServer();
        this.startGameLoop();
    }
    
    setupCanvas() {
        // Set canvas size to fill the browser window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.updateCamera();
            this.needsRedraw = true;
        });
    }
    
    loadWorldMap() {
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            this.needsRedraw = true;
        };
        this.worldImage.src = 'world.jpg';
    }
    
    setupUI() {
        // Get UI elements
        this.ui.loadingScreen = document.getElementById('loadingScreen');
        this.ui.gameUI = document.getElementById('gameUI');
        this.ui.connectionStatus = document.getElementById('connectionStatus');
        this.ui.statusText = document.getElementById('statusText');
        this.ui.statusIndicator = document.querySelector('.status-indicator');
        this.ui.playerUsername = document.getElementById('playerUsername');
        this.ui.playerPosition = document.getElementById('playerPosition');
        this.ui.playersOnline = document.getElementById('playersOnline');
        this.ui.statusMessage = document.getElementById('statusMessage');
        
        // Initial UI state
        this.updateConnectionStatus('disconnected', 'Connecting...');
        this.showStatusMessage('Initializing game...', 'info');
    }
    
    updateConnectionStatus(status, text) {
        this.connectionState = status;
        this.ui.statusText.textContent = text;
        this.ui.statusIndicator.className = `status-indicator ${status}`;
    }
    
    showStatusMessage(message, type = 'info') {
        this.ui.statusMessage.textContent = message;
        this.ui.statusMessage.className = `status-message ${type}`;
        
        // Auto-hide info messages after 3 seconds
        if (type === 'info') {
            setTimeout(() => {
                this.ui.statusMessage.textContent = '';
                this.ui.statusMessage.className = 'status-message';
            }, 3000);
        }
    }
    
    updatePlayerInfo() {
        if (this.myPlayerId && this.players[this.myPlayerId]) {
            const player = this.players[this.myPlayerId];
            this.ui.playerUsername.textContent = player.username || 'Chinmayi';
            this.ui.playerPosition.textContent = `${Math.round(player.x)}, ${Math.round(player.y)}`;
        }
        
        // Count online players
        const onlineCount = Object.keys(this.players).length;
        this.ui.playersOnline.textContent = onlineCount;
    }
    
    hideLoadingScreen() {
        this.ui.loadingScreen.style.display = 'none';
        this.ui.gameUI.classList.remove('hidden');
    }
    
    showLoadingScreen() {
        this.ui.loadingScreen.style.display = 'flex';
        this.ui.gameUI.classList.add('hidden');
    }
    
    setupKeyboardControls() {
        // Make canvas focusable for keyboard events
        this.canvas.tabIndex = 0;
        this.canvas.focus();
        
        // Add keyboard event listeners
        document.addEventListener('keydown', (event) => this.handleKeyDown(event));
        document.addEventListener('keyup', (event) => this.handleKeyUp(event));
        
        // Prevent default arrow key behavior (scrolling)
        document.addEventListener('keydown', (event) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
                event.preventDefault();
            }
        });
    }
    
    handleKeyDown(event) {
        const direction = this.movementDirections[event.code];
        if (!direction) return;
        
        // Only send move command if this key wasn't already pressed
        if (!this.keysPressed[event.code]) {
            this.keysPressed[event.code] = true;
            this.sendMoveCommand(direction);
        }
    }
    
    handleKeyUp(event) {
        const direction = this.movementDirections[event.code];
        if (!direction) return;
        
        this.keysPressed[event.code] = false;
        
        // Check if any movement keys are still pressed
        const anyKeysPressed = Object.values(this.movementDirections).some(dir => 
            Object.keys(this.keysPressed).some(key => 
                this.movementDirections[key] === dir && this.keysPressed[key]
            )
        );
        
        // If no movement keys are pressed, send stop command
        if (!anyKeysPressed) {
            this.sendStopCommand();
        }
    }
    
    sendMoveCommand(direction) {
        if (this.connectionState !== 'connected') return;
        
        const message = {
            action: 'move',
            direction: direction
        };
        
        this.socket.send(JSON.stringify(message));
    }
    
    sendStopCommand() {
        if (this.connectionState !== 'connected') return;
        
        const message = {
            action: 'stop'
        };
        
        this.socket.send(JSON.stringify(message));
    }
    
    // WebSocket connection
    connectToServer() {
        try {
            this.updateConnectionStatus('connecting', 'Connecting...');
            this.showStatusMessage('Connecting to game server...', 'info');
            
            this.socket = new WebSocket('wss://codepath-mmorg.onrender.com');
            
            this.socket.onopen = () => {
                console.log('Connected to game server');
                this.updateConnectionStatus('connected', 'Connected');
                this.showStatusMessage('Connected to server!', 'success');
                this.joinGame();
            };
            
            this.socket.onmessage = (event) => {
                this.handleServerMessage(JSON.parse(event.data));
            };
            
            this.socket.onclose = () => {
                console.log('Disconnected from game server');
                this.updateConnectionStatus('disconnected', 'Disconnected');
                this.showStatusMessage('Disconnected from server. Reconnecting...', 'error');
                // Attempt to reconnect after 3 seconds
                setTimeout(() => this.connectToServer(), 3000);
            };
            
            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus('error', 'Connection Error');
                this.showStatusMessage('Failed to connect to server. Retrying...', 'error');
            };
        } catch (error) {
            console.error('Failed to connect to server:', error);
            this.updateConnectionStatus('error', 'Connection Error');
            this.showStatusMessage('Connection failed. Please refresh the page.', 'error');
        }
    }
    
    joinGame() {
        if (this.connectionState !== 'connected') return;
        
        const message = {
            action: 'join_game',
            username: 'Chinmayi'
        };
        
        this.socket.send(JSON.stringify(message));
    }
    
    handleServerMessage(data) {
        switch (data.action) {
            case 'join_game':
                if (data.success) {
                    this.myPlayerId = data.playerId;
                    this.players = data.players;
                    this.avatars = data.avatars;
                    this.updateMyPosition();
                    this.updateCamera();
                    this.updatePlayerInfo();
                    this.hideLoadingScreen();
                    this.needsRedraw = true;
                    console.log('Joined game successfully');
                    this.showStatusMessage(`Welcome to the game, ${data.players[data.playerId]?.username || 'Chinmayi'}!`, 'success');
                } else {
                    console.error('Failed to join game:', data.error);
                    this.showStatusMessage(`Failed to join game: ${data.error}`, 'error');
                }
                break;
                
            case 'players_moved':
                this.players = { ...this.players, ...data.players };
                this.updateMyPosition();
                this.updateCamera();
                this.updatePlayerInfo();
                this.needsRedraw = true;
                break;
                
            case 'player_joined':
                this.players[data.player.id] = data.player;
                this.avatars[data.avatar.name] = data.avatar;
                this.updatePlayerInfo();
                this.needsRedraw = true;
                this.showStatusMessage(`${data.player.username} joined the game!`, 'info');
                break;
                
            case 'player_left':
                const playerName = this.players[data.playerId]?.username || 'Player';
                delete this.players[data.playerId];
                this.updatePlayerInfo();
                this.needsRedraw = true;
                this.showStatusMessage(`${playerName} left the game.`, 'info');
                break;
                
            default:
                console.log('Unknown message:', data);
        }
    }
    
    updateMyPosition() {
        if (this.myPlayerId && this.players[this.myPlayerId]) {
            this.myPosition = {
                x: this.players[this.myPlayerId].x,
                y: this.players[this.myPlayerId].y
            };
        }
    }
    
    updateCamera() {
        if (!this.myPlayerId) return;
        
        // Center camera on player
        this.camera.x = this.myPosition.x - this.canvas.width / 2;
        this.camera.y = this.myPosition.y - this.canvas.height / 2;
        
        // Clamp camera to world bounds
        this.camera.x = Math.max(0, Math.min(this.camera.x, this.worldWidth - this.canvas.width));
        this.camera.y = Math.max(0, Math.min(this.camera.y, this.worldHeight - this.canvas.height));
    }
    
    startGameLoop() {
        const gameLoop = () => {
            if (this.needsRedraw) {
                this.draw();
                this.needsRedraw = false;
            }
            requestAnimationFrame(gameLoop);
        };
        gameLoop();
    }
    
    draw() {
        if (!this.worldImage) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw world map with camera offset
        this.ctx.drawImage(
            this.worldImage,
            this.camera.x, this.camera.y, this.canvas.width, this.canvas.height,  // source rectangle
            0, 0, this.canvas.width, this.canvas.height  // destination rectangle
        );
        
        // Draw all players
        this.drawPlayers();
    }
    
    drawPlayers() {
        Object.values(this.players).forEach(player => {
            this.drawPlayer(player);
        });
    }
    
    drawPlayer(player) {
        if (!this.avatars[player.avatar]) return;
        
        const avatar = this.avatars[player.avatar];
        const frames = avatar.frames[player.facing] || avatar.frames.south;
        const frameIndex = player.animationFrame || 0;
        const frameData = frames[frameIndex];
        
        if (!frameData) return;
        
        // Calculate screen position (world position - camera offset)
        const screenX = player.x - this.camera.x;
        const screenY = player.y - this.camera.y;
        
        // Only draw if player is visible on screen
        if (screenX < -50 || screenX > this.canvas.width + 50 || 
            screenY < -50 || screenY > this.canvas.height + 50) {
            return;
        }
        
        // Load and draw avatar image
        const img = new Image();
        img.onload = () => {
            // Calculate avatar size (maintain aspect ratio)
            const avatarSize = 32;
            const aspectRatio = img.width / img.height;
            const width = avatarSize;
            const height = avatarSize / aspectRatio;
            
            // Draw avatar centered on player position
            this.ctx.drawImage(
                img,
                screenX - width / 2,
                screenY - height,
                width,
                height
            );
            
            // Draw username label
            this.drawPlayerLabel(player.username, screenX, screenY - height - 5);
        };
        img.src = frameData;
    }
    
    drawPlayerLabel(username, x, y) {
        this.ctx.save();
        
        // Draw background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(x - 30, y - 15, 60, 15);
        
        // Draw text
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(username, x, y - 3);
        
        this.ctx.restore();
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});
