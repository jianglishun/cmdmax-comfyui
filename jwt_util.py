
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional

SECRET_KEY = "e+iCvl2NUzd3lBJWwjv9A1MU15G5hPuK7wWQOWTQxYHUQJ0LEa0OZ9DV"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Created by wangminrui2022 on 2024-05-19.
class JWTUtil(object):

    def __init__(self):
        pass

    def getAccessTokenExpireMinutes(self):
        return ACCESS_TOKEN_EXPIRE_MINUTES

    def create_access_token(self,data: dict, expires_delta: Optional[timedelta] = None):
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=15)
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt       

    def authenticate_app(self,app_id: str, app_key: str):
        if (app_id == "com.android.app" and app_key == "acdi6F1otcL4oeb1K"):
            return {"app_id": app_id}
        if (app_id == "com.webui.comfyui" and app_key == "CDSyreQuQHM67hQ5Kv"):
            return {"app_id": app_id}
        return None

    async def verify_token(slef,token: str):
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            app_id: str = payload.get("sub")
            if app_id is None:
                return {"status": 400, "error": "app is none"}
            return {"status": 200, "data": app_id}
        except JWTError as ex:
            return {"status": 500, "error": str(ex)}
