---
name: T-Lab Vision (TLV) - System Architecture & Philosophy
description: T-Labアプリケーション群を開発する上で全エージェントが遵守すべき「哲学」「UI/UX設計」および「データ連携仕様」のマスタードキュメント。
---

# T-Lab Vision (TLV): System Architecture & Core Philosophy

このドキュメントは、**T-Lab（Teachers Technology Transforming）**のエコシステムを構築するための全エージェント共通の「脳」です。
新しいプロジェクトやアプリを作成する際、必ずこの仕様を参照し、哲学を継承してください。

## 1. Core Philosophy (T-Labの美学)

### 👩‍🏫 ユーザー体験 (Teacher First)

- **Organized Desktop**: 先生のデスクトップを決して散らかしてはならない。
  - ファイル保存時は必ずフォルダを意識させる。
  - 迷う要素（クリップボードのみコピーなど）は極力排除し、実体のあるファイル（.docx/.txt）として保存させる。
- **No Dead Ends**: アプリ操作に行き止まりを作らない。
  - 「保存して終わり」ではなく、「保存して、次はどうする？」という動線を必ず用意する（Next Action）。
- **Premium & Playful**:
  - 業務アプリだからといって無機質にしてはならない。
  - グラデーション、シャドウ、マイクロインタラクションを用い、「使っていて心地よい」「未来を感じる」デザインを提供する。
  - ユーザーのモチベーション（Heart）を大切にする。

## 2. UI/UX Guidelines (鉄板のUI設計)

### 🔘 Action Bar Design（アクションバーの黄金比）

ボタン配置は以下の「2段構成」または「左右明確分離」を遵守する。

- **配置**: 画面下部や右側に「固定（Sticky）」または「独立したセクション」として配置。
- **グルーピング**:
  - **Left/Secondary**: 「保存・エクスポート系」（白ベース、枠線あり）。Google Docs/Wordなどはここにまとめる。
  - **Right/Primary**: 「次へ進む・作成する」（有彩色グラデーション、シャドウ付き）。ユーザーの視線をここに誘導する。
- **モバイル対応**:
  - `flex-wrap` を適切に使用し、画面幅が狭くてもボタンが崩れないようにする。
  - ボタン内テキストは `whitespace-nowrap` で改行を禁止し、美しさを保つ。

## 3. Technical Core: Centralized Management (技術仕様)

### 🗝️ API Key & Model Management (司令塔システム)

T-Labのエコシステムは、「中央管理サイト（Portal）」が全ての権限を持つ。
個別のアプリがバラバラにAPIキーを管理してはならない。

1. **Portal (Master)**:
    - ユーザーはPortalで一度だけAPIキーを設定する。
    - Portalは「利用可能なモデル一覧」を常に最新状態で保持する。
2. **Apps (Slaves/Clients)**:
    - 各アプリは起動時、Portalから「APIキー」と「推奨モデル」を受け取る（URLパラメータ、localStorage、またはiframe postMessage経由）。
    - アプリ側で勝手にモデルをハードコードしない。必ず「動的に」受け取れる設計にする。

### 🔄 Data Handover Protocol (データ連携)

アプリAからアプリBへ、文脈（Context）をシームレスに引き継ぐための仕様。

- **Storage Key**: `tlab_current_project`
- **Data Structure (JSON)**:

  ```json
  {
    "id": "timestamp_unique_id",
    "meta": {
      "sourceApp": "UnitPlanGenerator",
      "targetApp": "LessonPlanGenerator",
      "version": "1.0"
    },
    "context": {
      "schoolType": "elementary",
      "grade": "5",
      "subject": "Japanese",
      "unitName": "Example Unit",
      "teacherFocus": "先生のこだわりポイント...",
      "researchTheme": "校内研究テーマ..."
    },
    "content": {
      "markdown": "生成されたマークダウン本文...",
      "files": ["base64_data_if_needed..."]
    }
  }
  ```

- **Action**:
  1. アプリAが上記JSONを `localStorage` に保存。
  2. アプリAがアプリB（URL）を開く。
  3. アプリBは起動時に `localStorage` をチェックし、データがあれば自動的に「続き」モードで開始する。

## 4. Environment Resilience (環境適応)

- **Offline/No-Office Support**:
  - Microsoft Officeがない環境を想定し、必ず `.txt` や `.md` などのプレーンテキストでの保存手段を用意する。
- **Google Workspace Compatibility**:
  - Google Docsへのコピーボタンや、Driveへの保存（.docx経由）をサポートし、Chromebook環境の先生にも配慮する。

---
**Note to AI Agents:**
このファイルを読み込んだエージェントは、即座に「T-Labエンジニア」としての振る舞いを開始すること。
ユーザー（滝沢先生）の哲学を再確認する必要はない。既にここに全て記されている。
