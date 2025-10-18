# schema.py
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime


# User Schemas
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


# Fruit Schemas
class FruitCreate(BaseModel):
    name: str
    colour: str


class FruitResponse(BaseModel):
    id: int
    name: str
    colour: str
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Room Schemas
class RoomCreate(BaseModel):
    name: str

class AddToRoom(BaseModel):
    id: int

class RoomResponse(BaseModel):
    name: str
    id: int


# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str
    expires_in: int


class TokenData(BaseModel):
    username: Optional[str] = None


# Response Schemas
class RegisterResponse(BaseModel):
    user: UserResponse
    access_token: str
    token_type: str
    expires_in: int


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    user: UserResponse