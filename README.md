# TechInsight

FastAPI + PostgreSQL + pgvector を用いた  
**セマンティック検索対応の技術記事管理Webアプリケーション**です。

## 概要

TechInsight は、技術記事をCRUD管理し、  
自然文によるセマンティック検索を可能にするWebアプリケーションです。

- 記事の作成 / 編集 / 削除（CRUD）
- ベクトル検索による意味検索
- Docker による簡単な起動
- フロントエンドとバックエンドの分離構成

---

## 使用技術

### フロントエンド
- Next.js (React)
- TypeScript

### バックエンド
- FastAPI
- psycopg + pgvector
- Python 3.13

### データベース
- PostgreSQL
- pgvector

### インフラ
- Docker / Docker Compose

##ディレクトリ構成
- backend/    FastAPI バックエンド
- frontend/   Next.js フロントエンド
- docs/       設計書・説明資料


---

## 起動方法

```bash
docker compose up -d --build

##
