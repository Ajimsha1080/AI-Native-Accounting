from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginResponse(BaseModel):
    success: bool
    requires2FA: bool = True
    tempToken: str
    message: str = "Please verify your 2FA OTP code."


class Verify2FaRequest(BaseModel):
    tempToken: str
    code: str = Field(min_length=6, max_length=12)


class UserDto(BaseModel):
    id: str
    email: str
    fullName: str
    role: str
    tenantId: str


class Verify2FaResponse(BaseModel):
    success: bool
    user: UserDto
    token: str
