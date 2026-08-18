from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import os

app = Flask(__name__)

app.config["SECRET_KEY"] = "DANI-CHAT-CHANGE-THIS-SECRET"

socketio = SocketIO(
    app,
    cors_allowed_origins="*"
)

BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

DB_PATH = os.path.join(
    BASE_DIR,
    "database.db"
)

# user_id -> socket_id
online_users = {}


# =====================================================
# DATABASE
# =====================================================

def get_db():

    db = sqlite3.connect(
        DB_PATH,
        timeout=10
    )

    db.row_factory = sqlite3.Row

    return db


def init_db():

    db = get_db()

    db.execute("""
        CREATE TABLE IF NOT EXISTS users (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            username TEXT UNIQUE NOT NULL,

            password TEXT NOT NULL,

            created_at
                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS messages (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            sender_id INTEGER NOT NULL,

            receiver_id INTEGER NOT NULL,

            message TEXT NOT NULL,

            delivered INTEGER DEFAULT 0,

            read INTEGER DEFAULT 0,

            created_at
                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    db.commit()

    db.close()


# =====================================================
# PAGE
# =====================================================

@app.route("/")
def index():

    return render_template(
        "index.html"
    )


# =====================================================
# REGISTER
# =====================================================

@app.route(
    "/api/register",
    methods=["POST"]
)
def register():

    data = request.get_json() or {}

    username = data.get(
        "username",
        ""
    ).strip()

    password = data.get(
        "password",
        ""
    )

    if len(username) < 3:

        return jsonify({
            "success": False,
            "message":
                "Username must be at least 3 characters."
        })


    if len(password) < 6:

        return jsonify({
            "success": False,
            "message":
                "Password must be at least 6 characters."
        })


    db = get_db()

    try:

        password_hash = (
            generate_password_hash(
                password
            )
        )

        cursor = db.execute(
            """
            INSERT INTO users
            (username, password)
            VALUES (?, ?)
            """,
            (
                username,
                password_hash
            )
        )

        db.commit()

        user_id = cursor.lastrowid

    except sqlite3.IntegrityError:

        db.close()

        return jsonify({
            "success": False,
            "message":
                "Username already exists."
        })


    db.close()

    session["user_id"] = user_id
    session["username"] = username

    return jsonify({
        "success": True
    })


# =====================================================
# LOGIN
# =====================================================

@app.route(
    "/api/login",
    methods=["POST"]
)
def login():

    data = request.get_json() or {}

    username = data.get(
        "username",
        ""
    ).strip()

    password = data.get(
        "password",
        ""
    )

    db = get_db()

    user = db.execute(
        """
        SELECT *
        FROM users
        WHERE username = ?
        """,
        (username,)
    ).fetchone()

    db.close()


    if not user:

        return jsonify({
            "success": False,
            "message":
                "Invalid username or password."
        })


    if not check_password_hash(
        user["password"],
        password
    ):

        return jsonify({
            "success": False,
            "message":
                "Invalid username or password."
        })


    session["user_id"] = user["id"]

    session["username"] = (
        user["username"]
    )

    return jsonify({
        "success": True
    })


# =====================================================
# CURRENT USER
# =====================================================

@app.route("/api/me")
def me():

    if "user_id" not in session:

        return jsonify({
            "logged_in": False
        })


    return jsonify({

        "logged_in": True,

        "id":
            session["user_id"],

        "username":
            session["username"]
    })


# =====================================================
# USERS
# =====================================================

@app.route("/api/users")
def get_users():

    if "user_id" not in session:

        return jsonify([])


    current_id = session[
        "user_id"
    ]

    db = get_db()

    rows = db.execute(
        """
        SELECT id, username
        FROM users
        WHERE id != ?
        ORDER BY username
        """,
        (current_id,)
    ).fetchall()

    db.close()


    users = []

    for row in rows:

        users.append({

            "id":
                row["id"],

            "username":
                row["username"],

            "online":
                row["id"]
                in online_users
        })


    return jsonify(users)


# =====================================================
# MESSAGE HISTORY
# =====================================================

@app.route(
    "/api/messages/<int:user_id>"
)
def messages(user_id):

    if "user_id" not in session:

        return jsonify([])


    current_id = session[
        "user_id"
    ]

    db = get_db()

    rows = db.execute(
        """
        SELECT
            id,
            sender_id,
            receiver_id,
            message,
            delivered,
            read,
            created_at

        FROM messages

        WHERE
            (
                sender_id = ?
                AND
                receiver_id = ?
            )

            OR

            (
                sender_id = ?
                AND
                receiver_id = ?
            )

        ORDER BY id ASC
        """,
        (
            current_id,
            user_id,
            user_id,
            current_id
        )
    ).fetchall()


    # Incoming messages become read
    db.execute(
        """
        UPDATE messages

        SET
            delivered = 1,
            read = 1

        WHERE
            sender_id = ?
            AND
            receiver_id = ?
        """,
        (
            user_id,
            current_id
        )
    )

    db.commit()

    db.close()


    return jsonify([
        dict(row)
        for row in rows
    ])


# =====================================================
# SOCKET CONNECT
# =====================================================

@socketio.on("connect")
def socket_connect():

    if "user_id" not in session:

        return


    user_id = session[
        "user_id"
    ]

    online_users[user_id] = (
        request.sid
    )


    emit(
        "user_status",
        {
            "user_id":
                user_id,

            "online":
                True
        },
        broadcast=True
    )


# =====================================================
# SOCKET DISCONNECT
# =====================================================

@socketio.on("disconnect")
def socket_disconnect():

    if "user_id" not in session:

        return


    user_id = session[
        "user_id"
    ]


    if user_id in online_users:

        del online_users[
            user_id
        ]


    emit(
        "user_status",
        {
            "user_id":
                user_id,

            "online":
                False
        },
        broadcast=True
    )


# =====================================================
# TYPING
# =====================================================

@socketio.on("typing")
def typing(data):

    if "user_id" not in session:

        return


    try:

        receiver_id = int(
            data["receiver_id"]
        )

    except:

        return


    if receiver_id in online_users:

        emit(
            "typing",
            {
                "user_id":
                    session["user_id"]
            },
            to=online_users[
                receiver_id
            ]
        )


# =====================================================
# SEND MESSAGE
# =====================================================

@socketio.on("send_message")
def send_message(data):

    if "user_id" not in session:

        return


    sender_id = session[
        "user_id"
    ]


    try:

        receiver_id = int(
            data["receiver_id"]
        )

    except:

        return


    message = str(
        data.get(
            "message",
            ""
        )
    ).strip()


    if not message:

        return


    delivered = int(
        receiver_id
        in online_users
    )


    db = get_db()

    cursor = db.execute(
        """
        INSERT INTO messages
        (
            sender_id,
            receiver_id,
            message,
            delivered,
            read
        )

        VALUES (?, ?, ?, ?, 0)
        """,
        (
            sender_id,
            receiver_id,
            message,
            delivered
        )
    )

    db.commit()

    message_id = (
        cursor.lastrowid
    )


    row = db.execute(
        """
        SELECT
            id,
            sender_id,
            receiver_id,
            message,
            delivered,
            read,
            created_at

        FROM messages

        WHERE id = ?
        """,
        (message_id,)
    ).fetchone()


    db.close()


    msg = dict(row)


    # Sender
    emit(
        "message_sent",
        msg
    )


    # Receiver
    if receiver_id in online_users:

        emit(
            "new_message",
            msg,
            to=online_users[
                receiver_id
            ]
        )


# =====================================================
# MARK READ
# =====================================================

@socketio.on("mark_read")
def mark_read(data):

    if "user_id" not in session:

        return


    try:

        sender_id = int(
            data["sender_id"]
        )

    except:

        return


    receiver_id = session[
        "user_id"
    ]


    db = get_db()

    db.execute(
        """
        UPDATE messages

        SET
            delivered = 1,
            read = 1

        WHERE
            sender_id = ?
            AND
            receiver_id = ?
        """,
        (
            sender_id,
            receiver_id
        )
    )

    db.commit()

    db.close()


    if sender_id in online_users:

        emit(
            "messages_read",
            {
                "user_id":
                    receiver_id
            },
            to=online_users[
                sender_id
            ]
        )


# =====================================================
# WEBRTC OFFER
# =====================================================

@socketio.on("webrtc_offer")
def webrtc_offer(data):

    if "user_id" not in session:

        return


    try:

        receiver_id = int(
            data["receiver_id"]
        )

    except:

        return


    if receiver_id not in online_users:

        return


    emit(
        "webrtc_offer",
        {

            "user_id":
                session["user_id"],

            "username":
                session["username"],

            "offer":
                data["offer"],

            "call_type":
                data.get(
                    "call_type",
                    "voice"
                )
        },

        to=online_users[
            receiver_id
        ]
    )


# =====================================================
# WEBRTC ANSWER
# =====================================================

@socketio.on("webrtc_answer")
def webrtc_answer(data):

    if "user_id" not in session:

        return


    try:

        receiver_id = int(
            data["receiver_id"]
        )

    except:

        return


    if receiver_id not in online_users:

        return


    emit(
        "webrtc_answer",
        {
            "answer":
                data["answer"]
        },
        to=online_users[
            receiver_id
        ]
    )


# =====================================================
# WEBRTC ICE
# =====================================================

@socketio.on("webrtc_ice")
def webrtc_ice(data):

    if "user_id" not in session:

        return


    try:

        receiver_id = int(
            data["receiver_id"]
        )

    except:

        return


    if receiver_id not in online_users:

        return


    emit(
        "webrtc_ice",
        {
            "candidate":
                data["candidate"]
        },
        to=online_users[
            receiver_id
        ]
    )


# =====================================================
# CALL REJECT
# =====================================================

@socketio.on("webrtc_reject")
def webrtc_reject(data):

    if "user_id" not in session:

        return


    try:

        receiver_id = int(
            data["receiver_id"]
        )

    except:

        return


    if receiver_id in online_users:

        emit(
            "webrtc_rejected",
            {},
            to=online_users[
                receiver_id
            ]
        )


# =====================================================
# CALL END
# =====================================================

@socketio.on("webrtc_end")
def webrtc_end(data):

    if "user_id" not in session:

        return


    try:

        receiver_id = int(
            data["receiver_id"]
        )

    except:

        return


    if receiver_id in online_users:

        emit(
            "webrtc_ended",
            {},
            to=online_users[
                receiver_id
            ]
        )


# =====================================================
# LOGOUT
# =====================================================

@app.route(
    "/api/logout",
    methods=["POST"]
)
def logout():

    session.clear()

    return jsonify({
        "success": True
    })


# =====================================================
# START
# =====================================================

if __name__ == "__main__":

    init_db()

    print()
    print("============================")
    print("       DANI CHAT")
    print("============================")
    print()
    print(
        "http://127.0.0.1:5000"
    )
    print()

    socketio.run(
        app,
        host="0.0.0.0",
        port=5000,
        debug=True,
        allow_unsafe_werkzeug=True
    )