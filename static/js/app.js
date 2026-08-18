let socket = null;

let currentUser = null;

let selectedUser = null;

let typingTimer = null;

let peerConnection = null;

let localStream = null;

let callType = "voice";


const rtcConfig = {

    iceServers: [

        {
            urls:
                "stun:stun.l.google.com:19302"
        }

    ]

};


/* ==================================================
   AUTH
================================================== */

async function register() {

    const username =
        document
        .getElementById("username")
        .value
        .trim();

    const password =
        document
        .getElementById("password")
        .value;


    if (!username || !password) {

        showAuthMessage(
            "Enter username and password."
        );

        return;
    }


    const response =
        await fetch(
            "/api/register",
            {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        username,
                        password
                    })
            }
        );


    const data =
        await response.json();


    if (!data.success) {

        showAuthMessage(
            data.message
        );

        return;
    }


    startApp();
}


async function login() {

    const username =
        document
        .getElementById("username")
        .value
        .trim();

    const password =
        document
        .getElementById("password")
        .value;


    const response =
        await fetch(
            "/api/login",
            {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        username,
                        password
                    })
            }
        );


    const data =
        await response.json();


    if (!data.success) {

        showAuthMessage(
            data.message
        );

        return;
    }


    startApp();
}


/* ==================================================
   START APP
================================================== */

async function startApp() {

    const response =
        await fetch("/api/me");

    const data =
        await response.json();


    if (!data.logged_in) {

        return;
    }


    currentUser = data;


    document
    .getElementById("auth")
    .classList
    .add("hidden");


    document
    .getElementById("chat-app")
    .classList
    .remove("hidden");


    document
    .getElementById("current-user")
    .textContent =
        "@" + currentUser.username;


    connectSocket();

    loadUsers();
}


/* ==================================================
   SOCKET
================================================== */

function connectSocket() {

    socket = io();


    socket.on(
        "connect",
        () => {

            console.log(
                "Dani Chat connected"
            );

        }
    );


    socket.on(
        "user_status",
        data => {

            updateUserStatus(
                data.user_id,
                data.online
            );

        }
    );


    socket.on(
        "typing",
        data => {

            if (
                selectedUser &&
                data.user_id ===
                selectedUser.id
            ) {

                document
                .getElementById(
                    "typing"
                )
                .textContent =
                    "typing...";


                clearTimeout(
                    typingTimer
                );


                typingTimer =
                    setTimeout(
                        () => {

                            document
                            .getElementById(
                                "typing"
                            )
                            .textContent =
                                "";

                        },
                        1500
                    );
            }

        }
    );


    socket.on(
        "message_sent",
        message => {

            if (
                selectedUser &&
                message.receiver_id ===
                selectedUser.id
            ) {

                renderMessage(
                    message
                );

                scrollMessages();
            }

        }
    );


    socket.on(
        "new_message",
        message => {

            if (
                selectedUser &&
                message.sender_id ===
                selectedUser.id
            ) {

                renderMessage(
                    message
                );

                scrollMessages();


                socket.emit(
                    "mark_read",
                    {
                        sender_id:
                            message.sender_id
                    }
                );

            }

        }
    );


    socket.on(
        "messages_read",
        () => {

            document
            .querySelectorAll(
                ".message.mine .ticks"
            )
            .forEach(
                tick => {

                    tick.textContent =
                        "✓✓";

                    tick.classList
                        .add("read");

                }
            );

        }
    );


    /* ================= WEBRTC ================= */


    socket.on(
        "webrtc_offer",
        receiveOffer
    );


    socket.on(
        "webrtc_answer",
        async data => {

            if (!peerConnection) {

                return;
            }


            await peerConnection
                .setRemoteDescription(
                    data.answer
                );


            document
            .getElementById(
                "call-status"
            )
            .textContent =
                "Connected";

        }
    );


    socket.on(
        "webrtc_ice",
        async data => {

            if (
                !peerConnection
            ) {

                return;
            }


            try {

                await peerConnection
                    .addIceCandidate(
                        data.candidate
                    );

            }

            catch(error) {

                console.log(
                    error
                );

            }

        }
    );


    socket.on(
        "webrtc_rejected",
        () => {

            alert(
                "Call rejected."
            );

            endCall(
                false
            );

        }
    );


    socket.on(
        "webrtc_ended",
        () => {

            endCall(
                false
            );

        }
    );
}


/* ==================================================
   USERS
================================================== */

async function loadUsers() {

    const response =
        await fetch(
            "/api/users"
        );


    const users =
        await response.json();


    const container =
        document.getElementById(
            "users"
        );


    container.innerHTML = "";


    users.forEach(
        user => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "user";


            element.dataset.userId =
                user.id;


            element.innerHTML = `

                <strong>
                    👤
                    ${escapeHTML(
                        user.username
                    )}
                </strong>

                <small
                    class="status ${
                        user.online
                        ? "online"
                        : ""
                    }"
                >
                    ${
                        user.online
                        ? "● Online"
                        : "○ Offline"
                    }
                </small>

            `;


            element.onclick =
                () => {

                    selectUser(
                        user,
                        element
                    );

                };


            container.appendChild(
                element
            );

        }
    );
}


/* ==================================================
   SELECT USER
================================================== */

async function selectUser(
    user,
    element
) {

    selectedUser = user;


    document
    .querySelectorAll(".user")
    .forEach(
        item => {

            item.classList
                .remove("active");

        }
    );


    element.classList
        .add("active");


    document
    .getElementById(
        "selected-name"
    )
    .textContent =
        user.username;


    document
    .getElementById(
        "typing"
    )
    .textContent = "";


    const response =
        await fetch(
            `/api/messages/${user.id}`
        );


    const messages =
        await response.json();


    const container =
        document.getElementById(
            "messages"
        );


    container.innerHTML = "";


    messages.forEach(
        message => {

            renderMessage(
                message
            );

        }
    );


    scrollMessages();


    socket.emit(
        "mark_read",
        {
            sender_id:
                user.id
        }
    );
}


/* ==================================================
   SEND MESSAGE
================================================== */

function sendMessage() {

    if (!selectedUser) {

        alert(
            "Select a contact first."
        );

        return;
    }


    const input =
        document.getElementById(
            "message"
        );


    const text =
        input.value.trim();


    if (!text) {

        return;
    }


    socket.emit(
        "send_message",
        {

            receiver_id:
                selectedUser.id,

            message:
                text
        }
    );


    input.value = "";

    input.focus();
}


/* ==================================================
   TYPING
================================================== */

function sendTyping() {

    if (!selectedUser) {

        return;
    }


    socket.emit(
        "typing",
        {

            receiver_id:
                selectedUser.id

        }
    );
}


/* ==================================================
   RENDER MESSAGE
================================================== */

function renderMessage(message) {

    const container =
        document.getElementById(
            "messages"
        );


    const element =
        document.createElement(
            "div"
        );


    const mine =
        message.sender_id ===
        currentUser.id;


    element.className =
        mine
        ? "message mine"
        : "message";


    let ticks = "";


    if (mine) {

        if (message.read) {

            ticks = "✓✓";

        }

        else if (
            message.delivered
        ) {

            ticks = "✓✓";

        }

        else {

            ticks = "✓";
        }

    }


    element.innerHTML = `

        <div>
            ${escapeHTML(
                message.message
            )}
        </div>

        <span class="message-time">

            ${formatTime(
                message.created_at
            )}

            ${
                mine
                ? `
                <span
                    class="ticks ${
                        message.read
                        ? "read"
                        : ""
                    }"
                >
                    ${ticks}
                </span>
                `
                : ""
            }

        </span>

    `;


    container.appendChild(
        element
    );
}


/* ==================================================
   VOICE CALL
================================================== */

async function startVoiceCall() {

    if (!selectedUser) {

        alert(
            "Select a contact first."
        );

        return;
    }


    callType = "voice";

    await makeCall(
        false
    );
}


/* ==================================================
   VIDEO CALL
================================================== */

async function startVideoCall() {

    if (!selectedUser) {

        alert(
            "Select a contact first."
        );

        return;
    }


    callType = "video";

    await makeCall(
        true
    );
}


/* ==================================================
   MAKE CALL
================================================== */

async function makeCall(
    withVideo
) {

    try {

        showCallScreen(
            selectedUser.username
        );


        localStream =
            await navigator
            .mediaDevices
            .getUserMedia({

                audio: true,

                video:
                    withVideo

            });


        document
        .getElementById(
            "local-video"
        )
        .srcObject =
            localStream;


        peerConnection =
            new RTCPeerConnection(
                rtcConfig
            );


        localStream
        .getTracks()
        .forEach(
            track => {

                peerConnection
                    .addTrack(
                        track,
                        localStream
                    );

            }
        );


        peerConnection.ontrack =
            event => {

                document
                .getElementById(
                    "remote-video"
                )
                .srcObject =
                    event.streams[0];

            };


        peerConnection.onicecandidate =
            event => {

                if (
                    event.candidate
                ) {

                    socket.emit(
                        "webrtc_ice",
                        {

                            receiver_id:
                                selectedUser.id,

                            candidate:
                                event.candidate

                        }
                    );

                }

            };


        const offer =
            await peerConnection
            .createOffer();


        await peerConnection
            .setLocalDescription(
                offer
            );


        socket.emit(
            "webrtc_offer",
            {

                receiver_id:
                    selectedUser.id,

                offer:
                    offer,

                call_type:
                    callType

            }
        );

    }

    catch(error) {

        console.error(
            error
        );

        alert(
            "Camera or microphone permission is required."
        );

        endCall(
            false
        );
    }
}


/* ==================================================
   RECEIVE CALL
================================================== */

async function receiveOffer(
    data
) {

    const accepted =
        confirm(
            `${data.username} is calling you. Accept?`
        );


    if (!accepted) {

        socket.emit(
            "webrtc_reject",
            {

                receiver_id:
                    data.user_id

            }
        );

        return;
    }


    selectedUser = {

        id:
            data.user_id,

        username:
            data.username

    };


    callType =
        data.call_type;


    showCallScreen(
        data.username
    );


    try {

        localStream =
            await navigator
            .mediaDevices
            .getUserMedia({

                audio: true,

                video:
                    callType ===
                    "video"

            });


        document
        .getElementById(
            "local-video"
        )
        .srcObject =
            localStream;


        peerConnection =
            new RTCPeerConnection(
                rtcConfig
            );


        localStream
        .getTracks()
        .forEach(
            track => {

                peerConnection
                    .addTrack(
                        track,
                        localStream
                    );

            }
        );


        peerConnection.ontrack =
            event => {

                document
                .getElementById(
                    "remote-video"
                )
                .srcObject =
                    event.streams[0];

            };


        peerConnection.onicecandidate =
            event => {

                if (
                    event.candidate
                ) {

                    socket.emit(
                        "webrtc_ice",
                        {

                            receiver_id:
                                data.user_id,

                            candidate:
                                event.candidate

                        }
                    );

                }

            };


        await peerConnection
            .setRemoteDescription(
                data.offer
            );


        const answer =
            await peerConnection
            .createAnswer();


        await peerConnection
            .setLocalDescription(
                answer
            );


        socket.emit(
            "webrtc_answer",
            {

                receiver_id:
                    data.user_id,

                answer:
                    answer

            }
        );


        document
        .getElementById(
            "call-status"
        )
        .textContent =
            "Connected";

    }

    catch(error) {

        console.error(
            error
        );

        endCall(
            false
        );
    }
}


/* ==================================================
   CALL SCREEN
================================================== */

function showCallScreen(
    username
) {

    document
    .getElementById(
        "call-screen"
    )
    .classList
    .remove("hidden");


    document
    .getElementById(
        "call-name"
    )
    .textContent =
        username;


    document
    .getElementById(
        "call-status"
    )
    .textContent =
        "Calling...";
}


/* ==================================================
   END CALL
================================================== */

function endCall(
    notify = true
) {

    if (
        notify &&
        selectedUser &&
        socket
    ) {

        socket.emit(
            "webrtc_end",
            {

                receiver_id:
                    selectedUser.id

            }
        );
    }


    if (localStream) {

        localStream
        .getTracks()
        .forEach(
            track => {

                track.stop();

            }
        );

        localStream = null;
    }


    if (peerConnection) {

        peerConnection.close();

        peerConnection = null;
    }


    document
    .getElementById(
        "local-video"
    )
    .srcObject = null;


    document
    .getElementById(
        "remote-video"
    )
    .srcObject = null;


    document
    .getElementById(
        "call-screen"
    )
    .classList
    .add("hidden");
}


/* ==================================================
   ENTER
================================================== */

function handleEnter(
    event
) {

    if (
        event.key ===
        "Enter"
    ) {

        event.preventDefault();

        sendMessage();
    }
}


/* ==================================================
   STATUS
================================================== */

function updateUserStatus(
    userId,
    online
) {

    const user =
        document.querySelector(
            `[data-user-id="${userId}"]`
        );


    if (!user) {

        return;
    }


    const status =
        user.querySelector(
            ".status"
        );


    if (online) {

        status.textContent =
            "● Online";

        status.classList
            .add("online");

    }

    else {

        status.textContent =
            "○ Offline";

        status.classList
            .remove("online");
    }
}


/* ==================================================
   TIME
================================================== */

function formatTime(
    value
) {

    if (!value) {

        return "";
    }


    return value
        .split(" ")[1]
        ?.substring(0, 5)
        || "";
}


/* ==================================================
   SCROLL
================================================== */

function scrollMessages() {

    const box =
        document.getElementById(
            "messages"
        );


    box.scrollTop =
        box.scrollHeight;
}


/* ==================================================
   LOGOUT
================================================== */

async function logout() {

    await fetch(
        "/api/logout",
        {
            method:
                "POST"
        }
    );


    location.reload();
}


/* ==================================================
   AUTH MESSAGE
================================================== */

function showAuthMessage(
    text
) {

    document
    .getElementById(
        "auth-message"
    )
    .textContent =
        text;
}


/* ==================================================
   SECURITY
================================================== */

function escapeHTML(
    text
) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        text;


    return div.innerHTML;
}


/* ==================================================
   AUTO LOGIN
================================================== */

window.addEventListener(
    "load",
    startApp
);