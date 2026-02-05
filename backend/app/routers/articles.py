from fastapi import APIRouter

router = APIRouter(prefix="/articles", tags=["articles"])

@router.get("")
def list_articles():
    return {"items": [], "limit": 20, "offset": 0}
