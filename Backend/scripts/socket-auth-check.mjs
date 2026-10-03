// End-to-end check of socket authentication and room authorisation.
// Needs the backend running (npm run dev). Usage: node scripts/socket-auth-check.mjs
// Set BASE_URL to test a server that is not on http://localhost:3000.
import { io } from "socket.io-client";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const run = Date.now().toString(36);
let failures = 0;

function check(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` (${detail})`}`);
    if (!ok) failures++;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function register(label) {
    const res = await fetch(`${BASE_URL}/api/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            username: `${label}_${run}`,
            email: `${label}_${run}@example.test`,
            password: "check-password-1"
        })
    });
    if (!res.ok) throw new Error(`register ${label} failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    const cookie = res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    return { id: body.result.id, cookie };
}

function connect(cookie) {
    return new Promise((resolve, reject) => {
        const socket = io(BASE_URL, {
            extraHeaders: cookie ? { cookie } : {},
            transports: ["polling"],
            reconnection: false
        });
        socket.once("connect", () => resolve(socket));
        socket.once("connect_error", reject);
    });
}

const joinRoom = (socket, chatId) =>
    new Promise((resolve) => socket.emit("joinRoom", chatId, resolve));

function collect(socket, event) {
    const seen = [];
    socket.on(event, (data) => seen.push(data));
    return seen;
}

const sockets = [];

try {
    // 1. No cookie: the handshake must be rejected.
    try {
        const anon = await connect(null);
        anon.close();
        check("no cookie is rejected", false, "connected");
    } catch (err) {
        check("no cookie is rejected with 'unauthorized'", err.message === "unauthorized", err.message);
    }

    // 2. Three real users with real cookies.
    const [a, b, c] = [await register("a"), await register("b"), await register("c")];
    const sa = await connect(a.cookie);
    const sb = await connect(b.cookie);
    const sc = await connect(c.cookie);
    sockets.push(sa, sb, sc);
    check("valid cookies connect", sa.connected && sb.connected && sc.connected);

    // 3. A DM between A and B.
    const dmRes = await fetch(`${BASE_URL}/api/chats/private/${b.id}`, {
        method: "POST",
        headers: { cookie: a.cookie }
    });
    const dm = (await dmRes.json()).chat;
    check("A can create a DM with B", dmRes.ok && !!dm?.id, `status ${dmRes.status}`);

    // 4. Room authorisation.
    const ackA = await joinRoom(sa, dm.id);
    const ackB = await joinRoom(sb, dm.id);
    const ackC = await joinRoom(sc, dm.id);
    check("A joins the DM room", ackA.ok === true);
    check("B joins the DM room", ackB.ok === true);
    check("C is refused the DM room", ackC.ok === false, JSON.stringify(ackC));

    // 5. Events from a non-member are ignored and nothing leaks.
    const typingSeenByA = collect(sa, "typing");
    const typingSeenByB = collect(sb, "typing");
    const errorsForC = collect(sc, "socket_error");
    sc.emit("typing", { chatId: dm.id, isTyping: true });
    sc.emit("readMessageSingle", { messageId: "x", chatId: dm.id });
    sc.emit("messageEdited", { messageId: "x", chatId: dm.id, text: "forged" });
    await sleep(500);
    check("C's typing event reaches nobody", typingSeenByA.length === 0 && typingSeenByB.length === 0);
    check(
        "C gets socket_error 'forbidden' for each event",
        errorsForC.length === 3 && errorsForC.every((e) => e.message === "forbidden"),
        JSON.stringify(errorsForC)
    );

    // Positive control: a member's typing event is delivered, with the real identity.
    sa.emit("typing", { chatId: dm.id, isTyping: true });
    await sleep(300);
    check(
        "A's typing event reaches B with A's id",
        typingSeenByB.length === 1 && typingSeenByB[0].userId === a.id,
        JSON.stringify(typingSeenByB)
    );

    // 6. Multi-tab presence.
    const statusSeenByB = collect(sb, "userStatusChanged");
    const sa2 = await connect(a.cookie);
    sockets.push(sa2);
    sa.close();
    await sleep(500);
    check(
        "closing one of A's two tabs does not mark A offline",
        !statusSeenByB.some((s) => s.userId === a.id && s.status === "offline")
    );
    sa2.close();
    await sleep(500);
    const offline = statusSeenByB.find((s) => s.userId === a.id && s.status === "offline");
    check("closing A's last tab marks A offline with lastSeen", !!offline && !!offline.lastSeen);
} catch (err) {
    console.error(err);
    failures++;
} finally {
    sockets.forEach((s) => s.close());
}

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
