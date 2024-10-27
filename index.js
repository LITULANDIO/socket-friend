const express = require('express');
const http = require("http");
const socketIo = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const app = express();
const httpServer = http.createServer(app);

const io = socketIo(httpServer, {
  cors: {
    origin: ['https://app-friend.netlify.app', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT'],
    credentials: true
  }
});

app.use(cors());

let selectedGuests = {};

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('joinRoom', (roomID) => {
        socket.join(roomID);
        console.log(`User joined room: ${roomID}`);
    });

    socket.on('guestUpdated', (updatedGuest, ids) => {
        const { idGroup } = ids;
        console.log('socket', )

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

        // Emitir el evento a todos los usuarios en el grupo inmediatamente
        console.log('send', updatedGuest, ids)
        io.to(idGroup).emit('guestUpdatedCompleted', updatedGuest, ids);

        // Intentar actualizar la base de datos en paralelo
        updateGuestInDatabase(updatedGuest)
            .then(response => {
                if (response.status !== 200) {
                    throw new Error('Error al actualizar en la base de datos');
                }
            })
            .catch(error => {
                console.error('Error updating guest in database:', error);
                // Si hay un error, puedes emitir un evento para notificar a los clientes
                io.to(idGroup).emit('updateError', { message: 'Error al actualizar el invitado en la base de datos.' });
            });
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

// Función para actualizar el invitado en la base de datos
const updateGuestInDatabase = async (guest) => {
    const options = {
        method: 'PUT',
        url: 'https://app-friends.quisqui.com/api/user/group/guests/updateGuest', // Cambia esto a tu endpoint real
        data: guest
    };
    return axios(options);
};

// Puerto para el servidor WebSocket
const port = process.env.PORT || 3000;
httpServer.listen(port, () => {
  console.log(`WebSocket server is running on port ${port}`);
});

// Ruta base para probar el servidor
app.get('/', (req, res) => {
  res.send('Hello from Socket Server!');
});
