import socketio
from auth import get_user_from_socket_token
import redis.asyncio as redis
import json
from typing import Dict, List, Any

sio_server = socketio.AsyncServer(
    cors_allowed_origins="*",
    async_mode="asgi"
)

sio_app = socketio.ASGIApp(socketio_server=sio_server, socketio_path='sockets')

redis_client = redis.from_url("redis://localhost:6379", decode_responses=True)

# Store active user cursors per room
room_cursors: Dict[str, Dict[str, dict]] = {}


async def get_room_state(room_id: str) -> tuple:
    """Get current room content and version from Redis"""
    content = await redis_client.get(f"room:{room_id}:content") or ""
    version = await redis_client.get(f"room:{room_id}:version") or 0
    return content, int(version)


async def set_room_state(room_id: str, content: str, version: int):
    """Save room state to Redis"""
    await redis_client.set(f"room:{room_id}:content", content)
    await redis_client.set(f"room:{room_id}:version", version)


async def get_operations_range(room_id: str, start: int, end: int) -> List[dict]:
    """Retrieve operations from Redis between version range"""
    ops_json = await redis_client.lrange(f"room:{room_id}:ops", start, end)
    return [json.loads(o) for o in ops_json] if ops_json else []


def apply_operation(doc: str, op: dict) -> str:
    """Apply an operation to a document string"""
    if op["type"] == "insert":
        pos = op["pos"]
        text = op["text"]
        return doc[:pos] + text + doc[pos:]
    elif op["type"] == "delete":
        pos = op["pos"]
        length = op["length"]
        return doc[:pos] + doc[pos + length:]
    elif op["type"] == "replace":
        pos = op["pos"]
        length = op.get("length", 0)
        text = op["text"]
        return doc[:pos] + text + doc[pos + length:]
    return doc


def transform_operation(client_op: dict, server_op: dict) -> dict:
    """
    Transform client operation against a server operation (IT - Inclusion Transformation)
    This implements the core OT transformation logic for concurrent operations
    """
    transformed = client_op.copy()

    client_type = client_op["type"]
    server_type = server_op["type"]
    client_pos = client_op["pos"]
    server_pos = server_op["pos"]

    # INSERT vs INSERT
    if client_type == "insert" and server_type == "insert":
        if server_pos < client_pos:
            # Server inserted before client position, shift client position right
            transformed["pos"] = client_pos + len(server_op["text"])
        elif server_pos == client_pos:
            # Concurrent inserts at same position - use tie-breaking
            # Priority based on session ID or arbitrary rule (server wins)
            transformed["pos"] = client_pos + len(server_op["text"])

    # INSERT vs DELETE
    elif client_type == "insert" and server_type == "delete":
        server_end = server_pos + server_op["length"]
        if server_pos < client_pos:
            if client_pos <= server_end:
                # Client position is within deleted range
                transformed["pos"] = server_pos
            else:
                # Client position is after deleted range
                transformed["pos"] = client_pos - server_op["length"]

    # DELETE vs INSERT
    elif client_type == "delete" and server_type == "insert":
        if server_pos <= client_pos:
            # Server inserted before or at client delete position
            transformed["pos"] = client_pos + len(server_op["text"])
        elif server_pos < client_pos + client_op["length"]:
            # Server inserted within client delete range - expand delete range
            transformed["length"] = client_op["length"] + len(server_op["text"])

    # DELETE vs DELETE
    elif client_type == "delete" and server_type == "delete":
        client_end = client_pos + client_op["length"]
        server_end = server_pos + server_op["length"]

        if server_end <= client_pos:
            # Server deleted before client range
            transformed["pos"] = client_pos - server_op["length"]
        elif server_pos >= client_end:
            # Server deleted after client range - no change needed
            pass
        else:
            # Overlapping deletes - complex case
            # Calculate new position and length
            new_pos = min(client_pos, server_pos)
            if server_pos <= client_pos:
                # Server delete starts before or at client delete
                offset = min(server_end - client_pos, client_op["length"])
                transformed["pos"] = server_pos
                transformed["length"] = max(0, client_op["length"] - offset)
            else:
                # Server delete starts within client range
                transformed["length"] = server_pos - client_pos

    # REPLACE operations
    elif client_type == "replace" and server_type == "insert":
        if server_pos <= client_pos:
            transformed["pos"] = client_pos + len(server_op["text"])

    elif client_type == "replace" and server_type == "delete":
        server_end = server_pos + server_op["length"]
        if server_end <= client_pos:
            transformed["pos"] = client_pos - server_op["length"]

    return transformed


def transform_against_multiple(client_op: dict, server_ops: List[dict]) -> dict:
    """Transform an operation against a sequence of operations"""
    transformed = client_op
    for server_op in server_ops:
        transformed = transform_operation(transformed, server_op)
    return transformed


def calculate_cursor_transform(cursor_pos: int, op: dict) -> int:
    """Transform cursor position based on an operation"""
    if op["type"] == "insert":
        if op["pos"] <= cursor_pos:
            return cursor_pos + len(op["text"])
    elif op["type"] == "delete":
        if op["pos"] < cursor_pos:
            deleted_before_cursor = min(op["length"], cursor_pos - op["pos"])
            return cursor_pos - deleted_before_cursor
        elif op["pos"] == cursor_pos:
            return cursor_pos
    elif op["type"] == "replace":
        if op["pos"] < cursor_pos:
            old_length = op.get("length", 0)
            new_length = len(op["text"])
            return cursor_pos - old_length + new_length
    return cursor_pos


@sio_server.event
async def connect(sid, environ, auth):
    """Handle client connection"""
    token = auth.get("token")
    room_id = auth.get("room_id")
    user = get_user_from_socket_token(token)

    print(f"✅ {user.username} connected to room {room_id}")

    # Join room
    await sio_server.enter_room(sid, room_id)
    await sio_server.save_session(sid, {
        "username": user.username,
        "room_id": room_id,
        "user_id": user.id
    })

    # Initialize cursor tracking for this room
    if room_id not in room_cursors:
        room_cursors[room_id] = {}

    room_cursors[room_id][sid] = {
        "username": user.username,
        "position": 0
    }

    # Send current document state
    content, version = await get_room_state(room_id)
    await sio_server.emit("load_document", {
        "content": content,
        "version": version,
        "cursors": {k: v for k, v in room_cursors[room_id].items() if k != sid}
    }, to=sid)

    # Notify others of new user
    await sio_server.emit("user_joined", {
        "sid": sid,
        "username": user.username
    }, room=room_id, skip_sid=sid)


@sio_server.event
async def edit_document(sid, data):
    """
    Handle document edit with operational transformation
    data = {
      'version': 2,
      'op': {'type': 'insert', 'pos': 5, 'text': 'Hello '},
      'cursor': 11
    }
    """
    session = await sio_server.get_session(sid)
    room_id = session["room_id"]
    username = session["username"]
    incoming_version = data["version"]
    op = data["op"]
    cursor_pos = data.get("cursor", 0)

    # Get current server state
    content, server_version = await get_room_state(room_id)

    # Client is behind - need to transform operation
    if incoming_version < server_version:
        # Get all operations that happened since client's version
        missed_ops = await get_operations_range(room_id, incoming_version, server_version - 1)

        # Transform client operation against all missed operations
        op = transform_against_multiple(op, missed_ops)

        # Also transform cursor position
        for missed_op in missed_ops:
            cursor_pos = calculate_cursor_transform(cursor_pos, missed_op)

    # Apply transformed operation to document
    try:
        new_content = apply_operation(content, op)
    except Exception as e:
        print(f"❌ Error applying operation: {e}")
        # Send current state back to client to resync
        await sio_server.emit("resync", {
            "content": content,
            "version": server_version
        }, to=sid)
        return

    # Update server state
    new_version = server_version + 1
    await set_room_state(room_id, new_content, new_version)

    # Store operation in history for future transformations
    await redis_client.rpush(f"room:{room_id}:ops", json.dumps(op))

    # Trim operation history to last 1000 operations to prevent memory bloat
    await redis_client.ltrim(f"room:{room_id}:ops", -1000, -1)

    # Update cursor position for this user
    if room_id in room_cursors and sid in room_cursors[room_id]:
        room_cursors[room_id][sid]["position"] = cursor_pos

    # Broadcast to all other clients
    await sio_server.emit("document_update", {
        "op": op,
        "version": new_version,
        "username": username,
        "sid": sid,
        "cursor": cursor_pos
    }, room=room_id, skip_sid=sid)


@sio_server.event
async def cursor_move(sid, data):
    """Handle cursor position updates without content changes"""
    session = await sio_server.get_session(sid)
    room_id = session["room_id"]
    username = session["username"]
    cursor_pos = data.get("position", 0)

    # Update cursor tracking
    if room_id in room_cursors and sid in room_cursors[room_id]:
        room_cursors[room_id][sid]["position"] = cursor_pos

    # Broadcast cursor position to others
    await sio_server.emit("cursor_update", {
        "sid": sid,
        "username": username,
        "position": cursor_pos
    }, room=room_id, skip_sid=sid)


@sio_server.event
async def request_sync(sid):
    """Client requests full document sync (e.g., after network issues)"""
    session = await sio_server.get_session(sid)
    room_id = session["room_id"]

    content, version = await get_room_state(room_id)
    await sio_server.emit("load_document", {
        "content": content,
        "version": version
    }, to=sid)


@sio_server.event
async def disconnect(sid):
    """Handle client disconnection"""
    session = await sio_server.get_session(sid)
    if session:
        room_id = session.get("room_id")
        username = session.get("username")

        # Remove from cursor tracking
        if room_id and room_id in room_cursors:
            room_cursors[room_id].pop(sid, None)

        # Notify others
        await sio_server.emit("user_left", {
            "sid": sid,
            "username": username
        }, room=room_id)

        print(f"❌ {username} disconnected from room {room_id}")
