const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cors = require('cors');

const app = express();
const httpServer = http.createServer(app);

// Configuración de CORS en Express
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
  },
  pingTimeout: 1200000, // Desconectar si no hay actividad en 120 segundos
  pingInterval: 25000, // Enviar pings cada 25 segundos
});

// Almacenar el estado de selección de invitados por grupo
let selectedGuests = {};

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('joinRoom', (roomID) => {
        socket.join(roomID);
        console.log(`User joined room: ${roomID}`);
    });

    socket.on('guestUpdated', (updatedGuest, ids) => {
        const { idGroup } = ids;

        // Verificar si el invitado ya ha sido seleccionado
        if (selectedGuests[idGroup] && selectedGuests[idGroup].includes(updatedGuest.idGuest)) {
            socket.emit('selectionConflict', { message: 'Este invitado ya ha sido seleccionado por otro usuario.' });
            return;
        }

        // Actualizar el estado local en el servidor
        if (!selectedGuests[idGroup]) {
            selectedGuests[idGroup] = [];
        }
        selectedGuests[idGroup].push(updatedGuest.idGuest);

        // Emitir el evento a todos los usuarios en el grupo
        io.to(idGroup).emit('guestUpdatedCompleted', updatedGuest, ids);

        // Intentar actualizar la base de datos en paralelo
        updateGuestInDatabase(updatedGuest)
            .then(response => {
                if (response.status !== 200) {
                    throw new Error('Error al actualizar en la base de datos');
                } else {
                    socket.emit('successGuest', { success: 'ok' , user: ids.idUser })
                }
            })
            .catch(error => {
                console.error('Error updating guest in database:', error);
                io.to(idGroup).emit('updateError', { message: 'Error al actualizar el invitado en la base de datos.' });
            });
    });

    socket.on('disconnect', (reason) => {
        console.log('A user disconnected', reason);
    });
  
    socket.on('connect_error', (error) => {
        console.error(`Connection error: ${error.message}`);
    });
});

// Función para actualizar el invitado en la base de datos
const updateGuestInDatabase = async (guest) => {
    const options = {
        method: 'PUT',
        url: 'https://app-friends.quisqui.com/api/user/group/guests/updateGuest',
        data: guest
    };
    return axios(options);
};

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

app.get('/', (req, res) => {
  res.send('Hello from Socket Server!');
});
