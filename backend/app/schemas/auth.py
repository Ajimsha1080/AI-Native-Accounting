from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)
    tenantSlug: str | None = None
    orgSlug: str | None = None


class LoginResponse(BaseModel):
    success: bool
    requires2FA: bool = True
    tempToken: str | None = None
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
