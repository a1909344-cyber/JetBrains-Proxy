import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DATA_DIR = Path(os.environ.get("DATA_DIR", str(Path(__file__).parent.parent / "proxy")))
LOG_FILE = Path(os.environ.get("LOG_FILE", str(Path(__file__).parent.parent / "proxy.log")))
PROXY_INTERNAL_URL = os.environ.get("PROXY_INTERNAL_URL", "http://localhost:8000")

app = FastAPI(title="JetBrains AI Admin API", root_path="/admin-api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _read_json(filename: str) -> Any:
    path = DATA_DIR / filename
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read {filename}: {e}")


def _write_json(filename: str, data: Any) -> None:
    path = DATA_DIR / filename
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write {filename}: {e}")


@app.get("/status")
async def get_status():
    online = False
    status_code = None
    error_msg = None

    models_data = _read_json("models.json") or {}
    model_list = models_data.get("models", []) if isinstance(models_data, dict) else []
    model_count = len(model_list)

    accounts_data = _read_json("jetbrainsai.json") or []
    account_count = len(accounts_data)

    keys_data = _read_json("client_api_keys.json") or []
    key_count = len(keys_data)

    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{PROXY_INTERNAL_URL}/v1/models", timeout=5.0)
            status_code = r.status_code
            online = True
    except Exception as e:
        error_msg = str(e)

    return {
        "online": online,
        "proxy_status_code": status_code,
        "proxy_url": PROXY_INTERNAL_URL,
        "error": error_msg,
        "model_count": model_count,
        "account_count": account_count,
        "key_count": key_count,
        "data_dir": str(DATA_DIR),
    }


@app.get("/config/jetbrainsai")
async def get_jetbrainsai():
    data = _read_json("jetbrainsai.json")
    if data is None:
        return []
    return data


@app.put("/config/jetbrainsai")
async def put_jetbrainsai(request: Request):
    body = await request.json()
    if not isinstance(body, list):
        raise HTTPException(status_code=400, detail="Expected a JSON array of accounts")
    _write_json("jetbrainsai.json", body)
    return {"success": True}


@app.get("/config/client-keys")
async def get_client_keys():
    data = _read_json("client_api_keys.json")
    if data is None:
        return []
    return data


@app.put("/config/client-keys")
async def put_client_keys(request: Request):
    body = await request.json()
    if not isinstance(body, list):
        raise HTTPException(status_code=400, detail="Expected a JSON array of keys")
    _write_json("client_api_keys.json", body)
    return {"success": True}


@app.get("/config/models")
async def get_models():
    data = _read_json("models.json")
    if data is None:
        return {"models": [], "anthropic_model_mappings": {}}
    return data


@app.put("/config/models")
async def put_models(request: Request):
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object with 'models' and 'anthropic_model_mappings'")
    if "models" not in body:
        raise HTTPException(status_code=400, detail="Missing 'models' field")
    _write_json("models.json", body)
    return {"success": True}


@app.get("/logs")
async def get_logs(lines: int = 200):
    if LOG_FILE.exists():
        try:
            with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
                all_lines = f.readlines()
            return {"lines": all_lines[-lines:], "total": len(all_lines), "file": str(LOG_FILE)}
        except Exception as e:
            return {"lines": [], "total": 0, "error": str(e), "file": str(LOG_FILE)}
    return {"lines": [], "total": 0, "file": str(LOG_FILE), "note": "Log file not found"}


class TestModelsRequest(BaseModel):
    api_key: str
    base_url: Optional[str] = None


@app.post("/proxy/test-models")
async def test_models(req: TestModelsRequest):
    url = req.base_url or PROXY_INTERNAL_URL
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{url}/v1/models",
                headers={"Authorization": f"Bearer {req.api_key}"},
                timeout=10.0,
            )
            try:
                data = r.json()
            except Exception:
                data = r.text
            return {"status": r.status_code, "data": data, "ok": r.status_code == 200}
    except Exception as e:
        return {"status": 0, "error": str(e), "ok": False}


class TestChatRequest(BaseModel):
    api_key: str
    model: str
    messages: List[Dict[str, Any]]
    stream: bool = False
    base_url: Optional[str] = None


@app.post("/proxy/test-chat")
async def test_chat(req: TestChatRequest):
    url = req.base_url or PROXY_INTERNAL_URL
    payload = {
        "model": req.model,
        "messages": req.messages,
        "stream": req.stream,
    }
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {req.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=60.0,
            )
            try:
                data = r.json()
            except Exception:
                data = r.text
            return {"status": r.status_code, "data": data, "ok": r.status_code == 200}
    except Exception as e:
        return {"status": 0, "error": str(e), "ok": False}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8008))
    print(f"Starting JetBrains AI Admin API on port {port}")
    print(f"Data directory: {DATA_DIR}")
    print(f"Log file: {LOG_FILE}")
    uvicorn.run(app, host="0.0.0.0", port=port)
