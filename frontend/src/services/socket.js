import { io } from "socket.io-client";

// Single shared socket connection for the whole app.
const socket = io(`http://${window.location.hostname}:5000`, {
  autoConnect: true,
});

export default socket;
