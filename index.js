const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cors = require('cors');

const app = express();
const httpServer = http.createServer(app);

// Configuración de CORS
app.use(cors({
  origin: ['https://app-friend.netlify.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT'],
  credentials: true
}));

const io = new Server(httpServer, {
  cors: {
    origin: ['https://app-friend.netlify.app', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT'],
    credentials: true
  }
});

// Estado compartido: Invitados seleccionados por grupo
let selectedGuests = {}; // { idGroup: [idGuest1, idGuest2, ...] }

// --- EVENTOS PRINCIPALES ---
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // 1. Manejo de ingreso a una sala
  socket.on('joinRoom', (roomID) => {
    socket.join(roomID);
    console.log(`User ${socket.id} joined room: ${roomID}`);
  });

  // 2. Manejo de actualización de invitado
  socket.on('guestUpdated', (updatedGuest, ids) => {
    const { idGroup, idUser } = ids;

    // Verificar si el invitado ya está seleccionado
    if (selectedGuests[idGroup]?.includes(updatedGuest.idGuest)) {
      socket.emit('selectionConflict', {
        message: 'Este invitado ya ha sido seleccionado por otro usuario.'
      });
      return;
    }

    // Actualizar el estado compartido
    if (!selectedGuests[idGroup]) {
      selectedGuests[idGroup] = [];
    }
    selectedGuests[idGroup].push(updatedGuest.idGuest);

    // Notificar a todos los usuarios de la sala
    io.to(idGroup).emit('guestUpdatedCompleted', updatedGuest, ids);

    // Intentar actualizar la base de datos
    updateGuestInDatabase(updatedGuest)
      .then(response => {
        if (response.status === 200) {
          socket.emit('successGuest', { success: 'ok', user: idUser });
        } else {
          throw new Error('Error al actualizar en la base de datos');
        }
      })
      .catch(error => {
        console.error('Error updating guest in database:', error);
        io.to(idGroup).emit('updateError', {
          message: 'Error al actualizar el invitado en la base de datos.'
        });
      });
  });

  // 3. Manejo de salida explícita de una sala
  socket.on('leaveRoom', (roomID) => {
    socket.leave(roomID);
    console.log(`User ${socket.id} left room: ${roomID}`);
  });

  // 4. Manejo de desconexión
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);

    // Limpia las salas del socket
    const rooms = Array.from(socket.rooms);
    rooms.forEach((roomID) => {
      if (roomID !== socket.id) {
        socket.leave(roomID);
        console.log(`User ${socket.id} removed from room: ${roomID}`);
      }
    });

    // Limpieza de estado compartido si aplica (opcional)
    for (const groupID in selectedGuests) {
      selectedGuests[groupID] = selectedGuests[groupID].filter(
        (guestID) => guestID !== socket.id
      );
    }
  });

  // 5. Manejo de errores de conexión
  socket.on('connect_error', (error) => {
    console.error(`Connection error: ${error.message}`);
  });
});

// --- FUNCIONES AUXILIARES ---

// Actualización del invitado en la base de datos
const updateGuestInDatabase = async (guest) => {
  try {
    const response = await axios.put(
      'https://app-friends.quisqui.com/api/user/group/guests/updateGuest',
      guest
    );
    return response;
  } catch (error) {
    console.error('Error in updateGuestInDatabase:', error.message);
    throw error;
  }
};

// --- CONFIGURACIÓN DEL SERVIDOR ---
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

app.get('/', (req, res) => {
  res.send('Hello from Socket Server!');
});
