import socketio
from auth import get_user_from_socket_token
from models import UserRoom, Room, User
from database import SessionLocal, engine
from sqlalchemy.orm import Session
import redis.asyncio as redis
import json


sio_server = socketio.AsyncServer(
    cors_allowed_origins="*",
    async_mode = "asgi"
)

sio_app = socketio.ASGIApp(socketio_server=sio_server,socketio_path='sockets')

redis_client = redis.from_url("redis://localhost:6379", decode_responses=True)

async def get_room_state(room_id):
    content = await redis_client.get(f"room:{room_id}:content") or ""
    version = await redis_client.get(f"room:{room_id}:version") or 0
    return content, int(version)

async def set_room_state(room_id, content, version):
    await redis_client.set(f"room:{room_id}:content", content)
    await redis_client.set(f"room:{room_id}:version", version)

def apply_operation(doc, op):
    """Apply an operation like {'type':'insert','pos':5,'text':'Hi'}"""
    if op["type"] == "insert":
        return doc[:op["pos"]] + op["text"] + doc[op["pos"]:]
    elif op["type"] == "delete":
        start, end = op["pos"], op["pos"] + op["length"]
        return doc[:start] + doc[end:]
    return doc

def transform_operation(incoming_op, base_ops):
    """Simple OT: transform new op against previously applied ones."""
    transformed = incoming_op.copy()
    for prev_op in base_ops:
        if prev_op["type"] == "insert" and prev_op["pos"] <= transformed["pos"]:
            transformed["pos"] += len(prev_op["text"])
        elif prev_op["type"] == "delete" and prev_op["pos"] < transformed["pos"]:
            transformed["pos"] -= min(prev_op["length"], transformed["pos"] - prev_op["pos"])
    return transformed

@sio_server.event
async def connect(sid, environ, auth):

    token = auth.get("token")
    room_id = auth.get("room_id")
    user = get_user_from_socket_token(token)

    print(f"✅ {user.username} connected to room {room_id}")
    await sio_server.enter_room(sid, room_id)
    await sio_server.save_session(sid, {"username": user.username, "room_id": room_id})

    content, version = await get_room_state(room_id)
    await sio_server.emit("load_document", {"content": content, "version": version}, to=sid)


@sio_server.event
async def edit_document(sid, data):
    """
    data = {
      'version': 2,
      'op': {'type': 'insert', 'pos': 5, 'text': 'Hello '}
    }
    """
    session = await sio_server.get_session(sid)
    room_id = session["room_id"]
    incoming_version = data["version"]
    op = data["op"]

    # Get current state
    content, server_version = await get_room_state(room_id)

    if incoming_version < server_version:
        # Need to transform op against missed operations
        ops_json = await redis_client.lrange(f"room:{room_id}:ops", incoming_version, -1)
        base_ops = [json.loads(o) for o in ops_json]
        op = transform_operation(op, base_ops)

    # Apply op to doc
    new_content = apply_operation(content, op)
    new_version = server_version + 1

    # Save
    await set_room_state(room_id, new_content, new_version)
    await redis_client.rpush(f"room:{room_id}:ops", json.dumps(op))

    # Emit to all others
    await sio_server.emit(
        "document_update",
        {"op": op, "version": new_version},
        room=room_id,
        skip_sid=sid
    )

@sio_server.event
async def loadDoc(sid, doc):
    await sio_server.emit('load_document', {'sid': sid, 'documentText': doc})


@sio_server.event
async def disconnect(sid):
    print(f'{sid}: disconnected')