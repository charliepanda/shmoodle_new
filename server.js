import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';

export const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

const canvasWidth = 1440;
const canvasHeight = 821;

const rooms = {};
const topics = [
  "question1",
  "question2",
  "question3",
  "question4",
  "question5",
];

let currentTopicIndex = 0;

function assignInitialTopic(roomID) {
  const randomIndex = Math.floor(Math.random() * topics.length);
  const selectedTopic = topics[randomIndex];
  rooms[roomID].topic = selectedTopic;
}

function newConnection(socket) {
  console.log(`[${new Date().toISOString()}] User connected: ${socket.id}`);
  let roomID;
  
  socket.on('disconnect', (reason) => {
    console.log(`[${new Date().toISOString()}] User ${socket.id} disconnected. Reason: ${reason}`);
  });
  
  socket.on('error', (error) => {
    console.log(`[${new Date().toISOString()}] Socket error for ${socket.id}:`, error);
  });

  socket.on('joinRoom', (data) => {
    roomID = data.roomID;
    socket.join(roomID);
    console.log(`User ${socket.id} joined room: ${roomID}`);

    if (!rooms[roomID]) {
      rooms[roomID] = { users: [], topicRotation: null };
    }

    if (rooms[roomID].isFirstTime !== undefined) {
      socket.emit('versionExperienceConfirmed', rooms[roomID].isFirstTime);
    }

    rooms[roomID].users.push(socket.id);

    const numUsers = rooms[roomID].users.length;
    io.to(roomID).emit('roomStatus', numUsers);

    if (numUsers === 1) {
      assignInitialTopic(roomID);
    }

    socket.emit('canvasDimensions', { width: canvasWidth, height: canvasHeight });
  });

  socket.on('startCallFromInitiator', ({ roomID }) => {
    io.to(roomID).emit('startCallNow');
  });

  socket.on('clearCanvasForBoth', ({ roomID }) => {
    io.to(roomID).emit('clearCanvasNow');
  });

  socket.on('mouse', (data) => {
    socket.to(roomID).emit('mouse', data);
    console.log(`Mouse data received in room ${roomID}:`, data);
  });

  socket.on('sendEmotion', (data) => {
    socket.to(roomID).emit('partnerEmotion', data);
    console.log(`Emotion data received in room ${roomID}:`, data);
  });

  socket.on('offer', (offer) => {
    socket.to(roomID).emit('offer', offer);
  });

  socket.on('answer', (answer) => {
    socket.to(roomID).emit('answer', answer);
  });

  socket.on('ice-candidate', (candidate) => {
    socket.to(roomID).emit('ice-candidate', candidate);
  });

  socket.on('callStarted', ({ roomID }) => {
    io.to(roomID).emit('hideToast');
    io.to(roomID).emit('showMuteButton');
  });

  socket.on('disconnect', (reason) => {
    console.log(`[${new Date().toISOString()}] User ${socket.id} disconnected from room: ${roomID}. Reason: ${reason}`);
    if (roomID && rooms[roomID]) {
      rooms[roomID].users = rooms[roomID].users.filter((id) => id !== socket.id);
      const numUsers = rooms[roomID].users.length;
      io.to(roomID).emit('roomStatus', numUsers);

      if (numUsers === 0 && rooms[roomID].topicRotation) {
        clearInterval(rooms[roomID].topicRotation);
        delete rooms[roomID];
      }
    }
  });

  socket.on('requestNewTopic', () => {
    if (rooms[roomID] && rooms[roomID].topic) {
      socket.emit('newTopic', { topic: rooms[roomID].topic });
    }
  });
}

io.on('connection', newConnection);

// Serve static files
app.use(express.static('public'));