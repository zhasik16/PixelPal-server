const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // Allow all origins in production
        methods: ["GET", "POST"]
    }
});

// Store active users and canvas data
const activeUsers = new Map(); // socketId -> { username, isBanned, banEndTime }
const canvasData = {
    main: {
        pixels: [],
        size: 64
    }
};

let isGlobalBanActive = false;
let globalBanEndTime = null;

// Function to log active users
const logActiveUsers = () => {
    console.log('\nActive Users:');
    activeUsers.forEach((user, socketId) => {
        console.log(`- ${user.username} (${socketId})${user.isBanned ? ' [BANNED]' : ''}`);
    });
    console.log('');
};

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Send current canvas state to new user
    socket.emit('canvas-state', canvasData.main);
    socket.emit('global-ban-status', { isActive: isGlobalBanActive, endTime: globalBanEndTime });

    // Handle user joining
    socket.on('user-join', (username) => {
        activeUsers.set(socket.id, {
            username,
            isBanned: false,
            banEndTime: null
        });
        console.log(`User joined: ${username} (${socket.id})`);
        logActiveUsers();

        io.emit('user-list', Array.from(activeUsers.values()).map(user => ({
            username: user.username,
            isBanned: user.isBanned
        })));
    });

    // Handle canvas updates
    socket.on('canvas-update', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && !user.isBanned && !isGlobalBanActive) {
            canvasData.main.pixels = [...canvasData.main.pixels, ...data.pixels];
            socket.broadcast.emit('canvas-update', data);
        }
    });

    // Handle clear canvas
    socket.on('clear-canvas', () => {
        canvasData.main.pixels = [];
        io.emit('canvas-clear');
    });

    // Handle canvas size change
    socket.on('canvas-size-change', (size) => {
        canvasData.main.size = size;
        io.emit('canvas-size-change', size);
    });

    // Handle global ban
    socket.on('activate-global-ban', () => {
        if (!isGlobalBanActive) {
            isGlobalBanActive = true;
            globalBanEndTime = Date.now() + 2000; // 2 seconds ban

            console.log(`Global pixel ban activated by ${activeUsers.get(socket.id).username}`);
            io.emit('global-ban-activated', { duration: 2 });

            setTimeout(() => {
                isGlobalBanActive = false;
                globalBanEndTime = null;
                io.emit('global-ban-deactivated');
                console.log('Global pixel ban deactivated');
            }, 2000);
        }
    });

    // Handle chat messages
    socket.on('chat-message', (message) => {
        const user = activeUsers.get(socket.id);
        if (user) {
            io.emit('chat-message', {
                username: user.username,
                message,
                timestamp: new Date().toLocaleTimeString()
            });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const user = activeUsers.get(socket.id);
        if (user) {
            console.log(`User disconnected: ${user.username} (${socket.id})`);
            activeUsers.delete(socket.id);
            logActiveUsers();

            io.emit('user-list', Array.from(activeUsers.values()).map(user => ({
                username: user.username,
                isBanned: user.isBanned
            })));
        }
    });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`WebSocket server running on port ${PORT}`);
}); 
