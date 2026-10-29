# voicevox-mcp

VOICEVOX の音声合成（TTS）・歌声合成（Song）・プロジェクト生成（`.vvproj`）を、AIエージェント（Google Antigravity, Claude Desktop, Cursor, Cline 等）から直感的に操作できる **Model Context Protocol (MCP)** サーバーです。

---

## 🌟 特徴

- **テキスト音声合成 (TTS)**:
  - ずんだもん、四国めたん、春日部つむぎ等の多彩なキャラクターによる日本語音声（WAV）の自動生成
  - 話速、音高、抑揚、音量の自由なコントロール
  - 生成した音声の即時PCスピーカー再生（Windows / macOS / Linux 対応）
- **ソング・歌唱生成 (Song)**:
  - 楽譜データ（音符番号・長さ・歌詞）から歌声合成
  - VOICEVOX GUI で直接開いて微調整できる **`.vvproj`（プロジェクトファイル）の自動出力**
- **依存パッケージゼロ**:
  - Node.js 標準ライブラリのみで実装されており、`npm install` 不要で軽量・即座に稼働
- **ライセンス・クレジット支援**:
  - 各キャラクターの利用規約や必須クレジット表記の確認ツールを標準搭載

---

## 📋 前提条件

ローカル環境で **VOICEVOX Engine**（ポート `50021`）が稼働している必要があります。

1. **VOICEVOX デスクトップアプリ** を起動しておく（推奨・最も簡単）
   - [VOICEVOX 公式サイト](https://voicevox.hiroshiba.jp/) よりダウンロードして起動
2. または、**Docker / コンテナ版** を起動する
   ```sh
   docker run --rm -p 50021:50021 voicevox/voicevox_engine:cpu-ubuntu20.04-latest
   ```

---

## ⚙️ MCP クライアントへの導入設定

### 1. Antigravity の場合

`%USERPROFILE%\.gemini\config\mcp_config.json` に以下を追記します。

```json
{
  "mcpServers": {
    "voicevox": {
      "command": "cmd.exe",
      "args": [
        "/c",
        "E:\\Project\\voicevox-mcp\\run-server.cmd"
      ],
      "env": {
        "VOICEVOX_ENGINE_URL": "http://127.0.0.1:50021"
      }
    }
  }
}
```

### 2. Claude Desktop の場合

`%APPDATA%\Claude\claude_desktop_config.json`（Windows）または `~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）に以下を追記します。

```json
{
  "mcpServers": {
    "voicevox": {
      "command": "node",
      "args": [
        "E:/Project/voicevox-mcp/server.js"
      ],
      "env": {
        "VOICEVOX_ENGINE_URL": "http://127.0.0.1:50021"
      }
    }
  }
}
```

---

## 🛠️ 提供ツール一覧

| ツール名 | 説明 | 主なパラメータ |
| :--- | :--- | :--- |
| `voicevox_status` | エンジンの稼働確認・バージョン取得 | なし |
| `voicevox_get_speakers` | 利用可能な話者（キャラクター）・スタイル一覧取得 | `singersOnly` (boolean) |
| `voicevox_speak` | テキストから音声WAVを生成・保存・再生 | `text`, `speaker` (ID), `outputPath`, `play`, `speedScale` 等 |
| `voicevox_create_song_project` | 楽譜データから `.vvproj` を生成（GUIで調声可能） | `outputPath`, `notes`, `bpm`, `styleId`, `trackName` |
| `voicevox_sing` | 楽譜データから歌声WAVを合成・レンダリング | `notes`, `styleId`, `bpm`, `outputPath`, `play` |
| `voicevox_play_audio` | 既存の音声ファイル（WAV/MP3）をPCで再生 | `filePath` |
| `voicevox_get_character_info` | キャラクター利用規約・クレジット表記例の取得 | `characterName` |

---

## 🎼 歌声プロジェクト（.vvproj）生成の例

AIエージェントに「このメロディと歌詞でソングプロジェクトを作って」と指示すると、以下のような形式で `.vvproj` が生成されます。

```json
{
  "outputPath": "E:/Music/my_song.vvproj",
  "bpm": 150,
  "styleId": 6000,
  "notes": [
    { "position": 0, "duration": 480, "noteNumber": 60, "lyric": "ど" },
    { "position": 480, "duration": 480, "noteNumber": 62, "lyric": "れ" },
    { "position": 960, "duration": 480, "noteNumber": 64, "lyric": "み" }
  ]
}
```

生成されたファイルを VOICEVOX アプリの「ソング」機能で開くだけで、ピアノロール上で発音・音程・ビブラートなどを自由に微調整してWAV書き出しが可能です。

---

## 📜 商標・権利表記・免責事項について

### 免責事項 (Disclaimer)
- 本ツール（`voicevox-mcp`）は、VOICEVOX Engine と各種 AI エージェントを連携させるための**非公式（サードパーティ製）MCPサーバー**です。
- VOICEVOX 開発者（ヒホ氏）および公式 VOICEVOX プロジェクトとは直接の関係はありません。

### 商標・著作権について
- 「VOICEVOX」の名称、ソフトウェア、およびロゴの著作権・権利は **ヒホ（hiroshiba）氏** に帰属します。
- 各キャラクター（ずんだもん、四国めたん、春日部つむぎ等）の音声ライブラリおよびキャラクター画像の著作権・権利は、それぞれの権利者（SSS合同会社等）に帰属します。

### 生成した音声の利用規約・クレジット表記
VOICEVOX で生成した音声を作品・動画・ゲーム・配信等で公開・利用する際は、**キャラクターごとの利用規約を遵守し、クレジット表記を行う必要があります。**

クレジット表記の例:
- `VOICEVOX:ずんだもん`
- `VOICEVOX:四国めたん`
- `VOICEVOX:波音リツ`

各キャラクターの詳細な利用規約については、本サーバーの `voicevox_get_character_info` ツール、または [VOICEVOX 公式サイト](https://voicevox.hiroshiba.jp/) をご確認ください。

---

## 📄 ライセンス

本リポジトリのソースコードは [MIT License](LICENSE) のもとで公開されています。
