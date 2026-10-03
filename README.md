# Chat App

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?logo=socketdotio&logoColor=white)](https://socket.io/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

A real-time chat application with direct messages, group chats, message status tracking, emoji reactions and file sharing. The backend is an Express 5 server with Socket.io on the same HTTP server, and the frontend is a React single-page app.

I built it to work through the parts of a chat system that a plain REST API does not cover: keeping delivery and read state consistent between clients, routing messages to a specific user versus a room, and tracking who is online.

https://github.com/user-attachments/assets/5f6323ba-9525-4bed-a30b-d5346b69687e

## Architecture

```
   React 19 + Vite + Tailwind 4
   (Axios for REST, socket.io-client)
              |
     REST + cookies  |  WebSocket
              |
   Express 5 + Socket.io server
     |                     |
   Prisma 7           Cloudinary
     |                (file storage)
   PostgreSQL
```

## How it works

1. A user registers or logs in over REST. The server hashes the password with bcrypt, and on login it sets a JWT in an HTTP-only cookie that lasts 7 days.
2. After login the client opens a Socket.io connection. The server authenticates it at the handshake from the same HTTP-only cookie, so the user's identity never comes from a client payload. Each user joins a private room named `user:<id>` that reaches all of their tabs, and presence is tracked per user as a set of sockets. A chat room can only be joined with `joinRoom`, which checks chat membership in the database, and every other chat event requires the socket to be in that room.
3. To send a message, the client saves it through `POST /api/chats/:chatId/messages` and then emits `sendMessage`. For a direct message the server works out the recipient from the chat, forwards it to their private room and marks it `delivered` if they are online. For a group message it emits to the Socket.io room named after the chat id.
4. The recipient's client emits `readAllMessages` or `readMessageSingle` when the chat is open. The server updates the message status in PostgreSQL and notifies the sender.
5. Files are uploaded to `POST /api/upload`, which stores them in Cloudinary and returns a URL. The URL is then sent as a message over the socket.
6. When a user's last socket disconnects, the server writes `lastSeen` to the database and broadcasts `userStatusChanged`.

## Features

- Direct and group chats. A group is created by one user, who acts as its admin and can add and remove members.
- Message status of `sent`, `delivered` or `read`, stored in PostgreSQL so it survives a reload, with per-chat unread counts.
- Emoji reactions, edit and delete. Only the message author can edit or delete, and changes are broadcast to everyone in the chat.
- File sharing for images, documents, video and audio, up to 10 MB per file, stored in Cloudinary.
- Online status, last-seen time and typing indicators.

## Quick start

Requirements: Node.js 20 or later, a PostgreSQL database, and a Cloudinary account.

Backend:

```bash
cd Backend
npm install
cp .env.example .env    # then fill in the values below
npx prisma migrate deploy
npm run dev             # http://localhost:3000
```

| Variable | Description |
| :-- | :-- |
| `PORT` | Port the server listens on |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign the auth token |
| `CLOUD_NAME`, `API_KEY`, `API_SECRET` | Cloudinary credentials |

Frontend, in a second terminal:

```bash
cd Frontend
npm install
cp .env.example .env
npm run dev             # http://localhost:5173
```

| Variable | Description |
| :-- | :-- |
| `VITE_BASE_URL` | REST API base URL, `http://localhost:3000/api` by default |
| `VITE_SOCKET_URL` | Socket.io server URL, `http://localhost:3000` by default |

The backend only accepts requests from `http://localhost:5173`. To try the real-time features, register two users and log in to each in a separate browser window.

### Socket check script

With the backend running, `node scripts/socket-auth-check.mjs` (run from `Backend/`) registers three throwaway users and checks that a connection without a cookie is rejected, that a non-member cannot join or affect another pair's DM room, and that presence stays correct with two tabs open. It prints PASS or FAIL for each check and exits non-zero on any failure. Set `BASE_URL` to test a server that is not on `http://localhost:3000`. It creates users in whatever database the backend is using, so point the backend at a development database.

## Project structure

```
Backend/
  app.js                  Express app, CORS, routes, upload endpoint
  server.js               HTTP server entry point
  prisma/                 schema and migrations
  db/index.js             Prisma client
  utilities/              JWT creation and cookie handling
  src/
    routes/               login, getMe, message routes
    controller/           register, login, getMe, chat and message logic
    middleware/           JWT cookie check
    Validation/           Zod schemas and validate() middleware
    services/             Cloudinary and Multer, shared chat access check
    sockets/              socketAuth.js (handshake auth), socket.js (event handlers)
  scripts/                socket-auth-check.mjs
Frontend/
  Main.jsx, App.jsx       entry point and router
  socket.js               Socket.io client
  src/
    apis/                 Axios instance and API modules
    components/           Avatar, Button, Input, Modal, SideBar
    context/              auth context
    pages/                Login, Register, Chat
```

## Data model

- `User`: username, email, hashed password, `lastSeen`.
- `Chat`: `isGroup`, optional `name`, `userId` (the creator), optional `receiverId` (for direct chats), and a many-to-many `members` relation.
- `Message`: text, `status` (`sent`, `delivered` or `read`), the chat it belongs to and its sender.
- `Reaction`: emoji, message and user. A unique index on `(messageId, userId, emoji)` prevents duplicates, and reactions are deleted with their message.

The full definition is in [Backend/prisma/schema.prisma](Backend/prisma/schema.prisma).

## REST API

All routes are under `/api`. Everything except register and login requires the auth cookie.

| Method | Path | Description |
| :-- | :-- | :-- |
| POST | `/register`, `/login`, `/logout` | Account and session |
| GET | `/me`, `/allUsers` | Current user, user list |
| GET | `/chats/default` | Default public chat |
| GET | `/chats/groups` | Groups the user belongs to |
| GET | `/chats/unread-counts` | Unread count per chat |
| POST | `/chats/group` | Create a group |
| POST | `/chats/private/:receiverId` | Get or create a direct chat |
| GET, DELETE | `/chats/:chatId` | Chat details, delete chat |
| GET, POST | `/chats/:chatId/messages` | List and create messages |
| POST | `/chats/:chatId/members` | Add a group member |
| DELETE | `/chats/:chatId/members/:memberId` | Remove a group member |
| PUT, DELETE | `/messages/:messageId` | Edit, delete a message |
| POST | `/messages/:messageId/react` | Toggle a reaction |
| POST | `/upload` | Multipart file upload to Cloudinary |

## Socket events

| Event | Direction | Purpose |
| :-- | :-- | :-- |
| `logout` | client to server | Remove the socket from presence and disconnect it |
| `join` | client to server | No-op that re-sends the online list; kept for older clients |
| `joinRoom`, `leaveRoom` | client to server | Enter a chat room (membership checked, acknowledged with `{ ok }`) or leave it |
| `socket_error` | server to client | An event was rejected, with `{ event, message }` |
| `sendMessage`, `receiveMessage` | both | Send and receive a message |
| `message` | both | Global room chat, sent as `{ chatId, text }` |
| `sendFile`, `newFile` | both | Share an uploaded file |
| `typing` | both | Typing indicator |
| `messageReaction`, `messageReactionUpdated` | both | Reaction changes |
| `messageEdited`, `deleteMessage`, `messageDeleted` | both | Edit and delete sync |
| `readAllMessages`, `readMessageSingle`, `deliverMessageSingle` | client to server | Update message status |
| `messagesRead`, `messageStatusUpdated` | server to client | Status change notifications |
| `getOnlineUsers`, `onlineUsersList` | both | Request and receive online users |
| `userStatusChanged` | server to client | Online, offline and last-seen updates |

## Known limitations

- Edit, delete and reaction events are checked against the database before they are relayed, but the database is still only changed through the REST endpoints. The socket events only tell other clients about a change that already happened.
- Rooms are joined once per page effect and are not restored automatically when a socket reconnects, so after a dropped connection the open chat has to be reopened to receive live events.
- The allowed CORS origin (`http://localhost:5173`) is hardcoded in [Backend/app.js](Backend/app.js), so deploying elsewhere needs a code change.
- The only automated check is the socket script above. There is no unit or integration test suite and no CI.
- Message history is loaded in full for a chat. There is no pagination.
- The `Chat` table has a `userId` creator column that is also set for direct chats, so the meaning of "creator" is only clear for groups.
