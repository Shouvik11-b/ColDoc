# main.py
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from datetime import timedelta
from typing import List
from sockets import sio_app

import models
import schema
import auth
from database import engine, get_db

# Create database tables
models.Base.metadata.create_all(bind=engine)

# Initialize FastAPI app
app = FastAPI(title="Fruit Management API", version="1.0.0")
app.mount('/ws', app = sio_app)


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "Fruit Management API"}


@app.post("/register", response_model=schema.RegisterResponse)
def register_user(user: schema.UserCreate, db: Session = Depends(get_db)):
    """Register a new user."""
    # Check if username already exists
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    # Check if email already exists
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user
    hashed_password = auth.get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    # Create access token
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": db_user.username}, expires_delta=access_token_expires
    )

    return {
        "user": db_user,
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": auth.ACCESS_TOKEN_EXPIRE_MINUTES * 60  # in seconds
    }


@app.post("/login", response_model=schema.LoginResponse)
def login_user(user_credentials: schema.UserLogin, db: Session = Depends(get_db)):
    """Login user and return JWT token."""
    user = auth.authenticate_user(db, user_credentials.username, user_credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create access token
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": auth.ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # in seconds
        "user": user
    }


# @app.get("/fruit", response_model=List[schema.FruitResponse])
# def get_fruits(
#         current_user: models.User = Depends(auth.get_current_user),
#         db: Session = Depends(get_db)
# ):
#     """Get all fruits for the current user."""
#     fruits = db.query(models.Fruit).filter(models.Fruit.user_id == current_user.id).all()
#     return fruits


# @app.post("/fruit", response_model=schema.FruitResponse)
# def create_fruit(
#         fruit: schema.FruitCreate,
#         current_user: models.User = Depends(auth.get_current_user),
#         db: Session = Depends(get_db)
# ):
#     """Create a new fruit for the current user."""
#     db_fruit = models.Fruit(
#         name=fruit.name,
#         colour=fruit.colour,
#         user_id=current_user.id
#     )
#
#     db.add(db_fruit)
#     db.commit()
#     db.refresh(db_fruit)
#
#     return db_fruit

@app.post("/room")
def create_room(room: schema.RoomCreate,
                current_user: models.User = Depends(auth.get_current_user),
                db: Session = Depends(get_db)):
    """Create a new room."""
    print("Received room:", room)
    db_room = models.Room(name=room.name)
    db.add(db_room)
    db.commit()
    db.refresh(db_room)
    db_userroom = models.UserRoom(user_id=current_user.id, room_id=db_room.id, role="owner")
    db.add(db_userroom)
    db.commit()
    db.refresh(db_userroom)
    return {"room_id": db_room.id, "name": db_room.name}


@app.get("/room", response_model=List[schema.RoomResponse])
def get_room(
        current_user: models.User = Depends(auth.get_current_user),
        db: Session = Depends(get_db)
):
    """Get all rooms for the current user."""
    rooms = db.query(models.Room).join(models.UserRoom).filter(models.UserRoom.user_id == current_user.id).all()
    return rooms

@app.post("/addToRoom", response_model=schema.RoomResponse)
def add_to_room(room: schema.AddToRoom, current_user: models.User = Depends(auth.get_current_user),
        db: Session = Depends(get_db)):
    db_userroom = models.UserRoom(user_id=current_user.id, room_id=room.id)
    db.add(db_userroom)
    db.commit()
    db.refresh(db_userroom)
    room = db.query(models.Room).filter(models.Room.id == room.id).first()

    return room


@app.get("/me", response_model=schema.UserResponse)
def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    """Get current user information."""
    return current_user


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)