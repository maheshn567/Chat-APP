# 💬 chat_app

**A full-stack, real-time chat app: direct messages, group rooms, live presence, reactions and file sharing.**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?logo=socketdotio&logoColor=white)](https://socket.io/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Zod](https://img.shields.io/badge/Zod-validation-3068B7?logo=zod&logoColor=white)](https://zod.dev/)

<!-- TODO: add a demo GIF (10–15s: send message → typing indicator → reaction → file upload) -->
<!-- ![chat_app demo](docs/demo.gif) -->
<!-- 🔗 **Live demo:** https://your-deployment-url -->

---

## ✨ Features at a glance

| | |
| :-- | :-- |
| ⚡ **Real-time messaging** | Socket.io delivery for DMs and group rooms |
| ✅ **Message status** | `sent` → `delivered` → `read`, persisted in PostgreSQL |
| ✍️ **Typing indicators** | Per-conversation, live |
| 😀 **Emoji reactions** | Toggle reactions, synced to everyone in the room |
| 🛠️ **Edit & delete** | Only the author can change their messages; updates broadcast live |
| 📎 **File sharing** | Images, docs, video and audio via Cloudinary (10 MB limit) |
| 👥 **Groups** | Create groups, add/remove members, admin = creator |
| 🟢 **Presence** | Online/offline status and "last seen" saved on disconnect |
| 🔔 **Unread badges** | Per-conversation unread counts |
| 🔐 **Auth** | JWT in an HTTP-only cookie, Zod-validated requests |

---

## 🧠 Engineering highlights

- **Socket ↔ user registry:** the server maps user IDs to socket IDs so DMs are delivered directly, while group messages use Socket.io rooms.
- **Layered backend:** routes → Zod validation → controllers → Prisma, with socket handlers and the Cloudinary service kept separate.
- **Access control:** a `checkChatAccess` guard checks chat membership before message reads and writes.
- **Data integrity:** a unique index on `(messageId, userId, emoji)` prevents duplicate reactions, and reactions cascade-delete with their message.
- **Safer sessions:** the JWT lives in an HTTP-only cookie, so client-side JavaScript never touches the token.

---

## 🏗️ Architecture

```
        React 19 + Vite + Tailwind v4 + Socket.io client
                           │
              REST (Axios, cookies)  +  WebSocket
                           │
              Node.js / Express 5  (Zod validation, JWT middleware)
                  │                        │
            Socket.io server          Prisma 7 ORM
                  │                        │
            Cloudinary (files)        PostgreSQL
```

**Stack:** React 19 · Vite 8 · Tailwind CSS 4 · React Router 7 · Axios · Node.js (ESM) · Express 5 · Socket.io 4 · Prisma 7 · PostgreSQL · Zod · JWT · Multer · Cloudinary

---

## 🚀 Quick start

**Prerequisites:** Node.js 20+, a PostgreSQL database, a Cloudinary account.

```bash
# 1. Backend
cd Backend
npm install
```

Copy `Backend/.env.example` to `Backend/.env` and fill it in (Cloudinary keys come from your dashboard under Settings → API Keys):

```env
PORT=3000
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DB_NAME?schema=public"
JWT_SECRET="a_long_random_string"
CLOUD_NAME="your_cloudinary_cloud_name"
API_KEY="your_cloudinary_api_key"
API_SECRET="your_cloudinary_api_secret"
```

```bash
npx prisma migrate deploy
npm run dev                # http://localhost:3000

# 2. Frontend (new terminal)
cd Frontend
npm install
cp .env.example .env       # points the app at http://localhost:3000/api
npm run dev                # http://localhost:5173
```

Open http://localhost:5173 (the backend only allows that origin). Register two accounts in two browser windows to see real-time features working.

---

## 📚 Technical reference

<details>
<summary><b>📁 Project structure</b></summary>

```text
chat_app/
├── Backend/
│   ├── app.js                  # Express app, CORS, routes, upload endpoint
│   ├── server.js               # HTTP + Socket.io server entry point
│   ├── prisma.config.ts        # Prisma config
│   ├── prisma/                 # schema.prisma + migrations
│   ├── db/index.js             # Prisma client singleton
│   ├── utilities/jwtCreate.js  # JWT + cookie helper
│   └── src/
│       ├── routes/             # login, getMe, message routes
│       ├── controller/         # register, login, getMe, message logic
│       ├── middleware/         # authMiddleware (JWT cookie check)
│       ├── Validation/         # Zod schemas + validate() middleware
│       ├── services/           # Cloudinary + Multer
│       └── sockets/socket.js   # Real-time event handlers
└── Frontend/
    ├── Main.jsx, App.jsx       # Entry point and router
    ├── socket.js               # Socket.io client
    └── src/
        ├── apis/               # Axios instance + API modules
        ├── components/         # Avatar, Button, Input, Modal, SideBar
        ├── context/            # Auth context
        └── pages/              # Login, Register, Chat
```

</details>

<details>
<summary><b>🗄️ Database schema</b></summary>

```
User ──< Chat (creator)        User >──< Chat (members)
Chat ──< Message ──< Reaction  User ──< Message / Reaction
```

- **User:** `username`, `email`, `password`, `lastSeen`
- **Chat:** `isGroup`, `name?`, `userId` (creator), `receiverId?` (for DMs), `members`
- **Message:** `text`, `status` (`sent` | `delivered` | `read`), `chatId`, `userId`
- **Reaction:** `emoji`, `messageId`, `userId`, unique on `(messageId, userId, emoji)`

Full definition: [Backend/prisma/schema.prisma](Backend/prisma/schema.prisma)

</details>

<details>
<summary><b>📡 WebSocket events</b></summary>

| Event | Direction | Purpose |
| :-- | :-- | :-- |
| `join` / `logout` | Client → Server | Register or remove the user's socket |
| `joinRoom` / `leaveRoom` | Client → Server | Enter or leave a chat room |
| `sendMessage` | Client → Server | Send a message |
| `receiveMessage` | Server → Client | Deliver an incoming message |
| `sendFile` / `newFile` | Both | Share an uploaded file |
| `typing` | Both | Typing indicator |
| `messageReaction` / `messageReactionUpdated` | Both | Toggle and sync reactions |
| `messageEdited` | Both | Sync edits |
| `deleteMessage` / `messageDeleted` | Both | Sync deletes |
| `readAllMessages`, `readMessageSingle`, `deliverMessageSingle` | Client → Server | Update message status |
| `messagesRead` / `messageStatusUpdated` | Server → Client | Broadcast status changes |
| `getOnlineUsers` / `onlineUsersList` | Both | Fetch online users |
| `userStatusChanged` | Server → Client | Online/offline and last-seen updates |

</details>

<details>
<summary><b>🔌 REST API</b></summary>

All routes are under `/api`. Everything except register, login and upload requires the auth cookie.

**Auth & users**
- `POST /register` · `POST /login` · `POST /logout`
- `GET /me` — current user
- `GET /allUsers` — user list

**Chats**
- `GET /chats/default` — global public room
- `GET /chats/groups` — my groups
- `GET /chats/unread-counts`
- `POST /chats/group` — create a group
- `POST /chats/private/:receiverId` — get or create a DM
- `GET /chats/:chatId` — chat details
- `DELETE /chats/:chatId`
- `POST /chats/:chatId/members` · `DELETE /chats/:chatId/members/:memberId`

**Messages**
- `GET` / `POST /chats/:chatId/messages`
- `PUT` / `DELETE /messages/:messageId`
- `POST /messages/:messageId/react`

**Files**
- `POST /upload` — multipart upload to Cloudinary

</details>

---

## 🗺️ Roadmap

- [ ] Automated tests (API and socket events)
- [ ] Deployment and live demo
- [ ] Pagination / infinite scroll for message history

---

## 📝 License

ISC
