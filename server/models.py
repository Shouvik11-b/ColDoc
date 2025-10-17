from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime


# Association Model
class UserRoom(Base):
    __tablename__ = "userroom"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String, default="member")  # optional extra field
    # Relationships
    room = relationship("Room", back_populates="user_rooms")
    user = relationship("User", back_populates="user_rooms")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Link to association table
    user_rooms = relationship("UserRoom", back_populates="user", cascade="all, delete-orphan")

    # Example: if you still have fruits
    fruits = relationship("Fruit", back_populates="owner", cascade="all, delete-orphan")


class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    content = Column(String, nullable=True)

    # Link to association table
    user_rooms = relationship("UserRoom", back_populates="room", cascade="all, delete-orphan")


class Fruit(Base):
    __tablename__ = "fruitDB"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    colour = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="fruits")
