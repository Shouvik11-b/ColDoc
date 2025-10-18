import socketio
from auth import get_user_from_socket_token
from models import UserRoom, Room, User
from database import SessionLocal, engine
from sqlalchemy.orm import Session
import redis.asyncio as redis


sio_server = socketio.AsyncServer(
    cors_allowed_origins="*",
    async_mode = "asgi"
)

sio_app = socketio.ASGIApp(socketio_server=sio_server,socketio_path='sockets')
r = redis.Redis(host='localhost', port=6379, db=0)
SAVE_INTERVAL = 5
document_text = ""

@sio_server.event
async def connect(sid, environ, auth):
    global doc_text
    print(f'{sid}: connected')
    token = auth.get("token")
    room_id = auth.get("room_id")
    user = get_user_from_socket_token(token)
    print(f"✅ {user.username} joined")
    await sio_server.enter_room(sid, room_id)

    await sio_server.save_session(sid, {"username": user, "room_id": room_id})

    db: Session = SessionLocal()

    try:
        # Example: Check if user is already in the room
        doc_text = db.query(Room.content).filter(Room.id == room_id).first()

    except Exception as e:
        print("DB error:", e)
        db.rollback()
    finally:
        db.close()
    await sio_server.emit('load_document',          # event name
        doc_text,            # payload (just the text)
        to=sid)

@sio_server.event
async def edit_document(sid, doc):
    print(f'{sid}: doc changed')
    global doc_text
    doc_text = doc

    db: Session = SessionLocal()
    try:
        room = db.query(Room).filter(Room.id == room_id).first()
        if room:
            room.content = doc
            db.commit()
            print(f"✅ Updated DB content for room {room_id}")
        else:
            print(f"⚠️ Room {room_id} not found in DB.")
    except Exception as e:
        print("DB update error:", e)
        db.rollback()
    finally:
        db.close()

    await sio_server.emit("document_update", document_text, skip_sid=sid)


@sio_server.event
async def loadDoc(sid, doc):
    await sio_server.emit('load_document', {'sid': sid, 'documentText': doc})


@sio_server.event
async def disconnect(sid):
    print(f'{sid}: disconnected')