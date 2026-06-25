# 쇼기 캐릭터 대국 웹앱 — 프로젝트 플랜

> 캐릭터와 대사를 주고받으며 쇼기를 두는 브라우저 기반 웹앱.
> "용왕이 하는 일!" 같은 느낌으로, AI 캐릭터가 국면에 맞는 대사를 치며 대국을 진행한다.

---

## 아키텍처 개요

```
┌─────────────────────────────────────────────────┐
│                  브라우저 (클라이언트)               │
│                                                   │
│  ┌─────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ Shogiground │  │  shogiops  │  │  대사 UI    │ │
│  │ (보드 렌더링) │  │ (룰 엔진)  │  │ (캐릭터창)  │ │
│  └──────┬──────┘  └─────┬──────┘  └──────┬─────┘ │
│         │               │                │       │
│         └───────┬───────┘                │       │
│                 │                        │       │
│        ┌────────▼────────┐      ┌────────▼─────┐ │
│        │ Game Controller │      │ LLM Gateway  │ │
│        │ (대국 루프)      │─────▶│ (대사 생성)   │ │
│        └────────┬────────┘      └──────┬───────┘ │
│                 │                      │         │
│                 │               ┌──────▼───────┐ │
│                 │               │ Provider     │ │
│                 │               │ ┌Claude API  │ │
│                 │               │ ┌Ollama Cloud│ │
│                 │               │ ┌Vercel AI GW│ │
│                 │               │ └OpenAI 호환  │ │
│                 │               └──────────────┘ │
│                 │                                 │
│        ┌────────▼────────┐                       │
│        │ Fairy Stockfish │                       │
│        │ WASM Worker     │                       │
│        │ (CPU 착수 계산)  │                       │
│        └─────────────────┘                       │
└─────────────────────────────────────────────────┘
```

## 기술 스택

| 레이어 | 라이브러리 | 역할 | 소스 |
|--------|-----------|------|------|
| 보드 UI | Shogiground | 9×9 보드 렌더링, 드래그앤드롭, 지물(持ち駒) 표시 | `npm i shogiground` / jsdelivr CDN |
| 게임 로직 | shogiops | 합법수 생성, SFEN 파싱, USI 표기 변환, 승패 판정 | `npm i shogiops` |
| 엔진 | Fairy Stockfish WASM | CPU 착수 계산 (USI 프로토콜), 평가치 출력 | `github.com/fairy-stockfish/fairy-stockfish.wasm` |
| 대사 생성 | LLM Gateway (멀티 프로바이더) | 국면 정보 → 캐릭터 대사 | Claude API, Ollama Cloud, Vercel AI Gateway 등 |
| 프론트엔드 | Vanilla HTML/CSS/JS 또는 React | 단일 페이지 앱 | — |

## 개발 단계

### Phase 1: 보드 UI + 수동 대국 (혼자 두기)

**목표**: 브라우저에서 쇼기판이 보이고, 말을 클릭/드래그해서 합법수만 둘 수 있는 상태.

**작업 항목**:
- [ ] HTML 페이지에 Shogiground 초기화 (초기 SFEN 로드)
- [ ] shogiops 연동: 클릭 시 합법수 하이라이트, 불법수 거부
- [ ] 지물(持ち駒) 표시 영역 구현
- [ ] 승격(成り) 선택 다이얼로그
- [ ] 선후수 표시, 수순 카운터

**핵심 데이터 흐름**:
```
유저 클릭 → shogiops.legalMoves() 확인 → 합법이면 보드 갱신 → SFEN 업데이트
```

**참고 코드** (Shogiground 초기화):
```js
import { Shogiground } from 'shogiground';
const config = {
  sfen: { board: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL' },
};
const ground = Shogiground(config, {
  board: document.getElementById('board'),
  hands: { top: document.getElementById('hand-top'), bottom: document.getElementById('hand-bottom') },
});
```

### Phase 2: 엔진 연결 — CPU 대국

**목표**: 유저가 한 수 두면 Fairy Stockfish가 응수를 계산해서 자동으로 착수.

**작업 항목**:
- [ ] Fairy Stockfish WASM을 Web Worker로 로드
- [ ] USI 프로토콜 통신 래퍼 구현 (`isready`, `position sfen ...`, `go movetime ...`)
- [ ] 엔진 레벨 조절 (Skill Level, movetime 제한)
- [ ] 엔진 응수를 shogiops로 검증 후 보드에 반영
- [ ] 평가치(cp) 파싱 및 저장

**핵심 데이터 흐름**:
```
유저 착수 → SFEN 생성 → Worker에 "position sfen ... go" 전송
→ Worker가 "bestmove ..." 응답 → shogiops로 적용 → 보드 갱신
→ 평가치 변동 기록
```

**USI 통신 예시**:
```js
// Web Worker 내부
worker.postMessage('usi');
worker.postMessage('setoption name USI_Variant value shogi');
worker.postMessage('isready');
// ... readyok 수신 후
worker.postMessage('position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1');
worker.postMessage('go movetime 1000');
// ... bestmove 7g7f 수신
```

### Phase 3: 캐릭터 대사 시스템

**목표**: 매 턴 Claude API가 국면 상황에 맞는 캐릭터 대사를 생성.

**작업 항목**:
- [ ] 캐릭터 설정 프롬프트 작성 (성격, 말투, 실력 설정)
- [ ] 국면 컨텍스트 구조 설계 (평가치 변동, 잡은 말, 위협, 수순 번호)
- [ ] Claude API 호출 레이어 구현
- [ ] 대사 UI (캐릭터 일러스트 + 말풍선)
- [ ] 대사 트리거 조건 분류

**대사 트리거 분류**:

| 트리거 | 조건 | 대사 톤 예시 |
|--------|------|-------------|
| 대국 시작 | 1수째 | 인사, 각오 |
| 일반 수 | 평가치 변동 ±50 이내 | 담담한 코멘트 |
| 좋은 수 (유저) | 평가치 +200 이상 점프 | 놀람, 칭찬 |
| 실수 (유저) | 평가치 -200 이상 하락 | 기회 포착, 도발 |
| 말 잡힘 | 엔진 말이 잡힘 | 아쉬움, 반격 의지 |
| 말 잡음 | 엔진이 말을 잡음 | 여유, 자신감 |
| 위기 | 엔진 평가치 -500 이하 | 초조, 필사 |
| 우세 | 엔진 평가치 +500 이상 | 여유, 조롱 |
| 쯔메 | 詰み 감지 | 승리/패배 선언 |

**국면 컨텍스트 JSON 예시** (Claude API에 보낼 데이터):
```json
{
  "turn_number": 24,
  "player_move": "２四歩(25)",
  "engine_response": "同歩(23)",
  "eval_before": 120,
  "eval_after": -45,
  "eval_delta": -165,
  "captured_piece": "歩",
  "player_hand": ["歩", "歩"],
  "engine_hand": ["角"],
  "is_check": false,
  "game_phase": "中盤",
  "trigger": "실수"
}
```

**캐릭터 시스템 프롬프트 골격**:
```
あなたは将棋を指すキャラクターです。
名前: [캐릭터명]
性格: [성격 설정]
棋力: [실력 설정]

対局中のあなたの役割:
- 相手（ユーザー）の手を見てリアクションする
- 自分の手を指す時に考えを述べる
- 局面に応じて感情を表現する

以下の局面情報に基づいて、キャラクターとして一言（1~3文）で応答してください。
```

### Phase 3.5: 멀티 LLM 프로바이더 지원

**목표**: Claude API 외에 OpenAI 호환 엔드포인트(Ollama Cloud, Vercel AI Gateway 등)를 자유롭게 선택해서 대사 생성에 사용할 수 있는 상태.

**작업 항목**:
- [ ] LLM Gateway 추상화 레이어 구현 (프로바이더 공통 인터페이스)
- [ ] Claude API 프로바이더 (Phase 3의 기존 코드 리팩터링)
- [ ] OpenAI 호환 프로바이더 구현 (`/v1/chat/completions` 형식)
- [ ] Ollama Cloud 연결 검증
- [ ] Vercel AI Gateway 연결 검증
- [ ] 프로바이더 설정 UI (엔드포인트 URL, API 키, 모델명 입력)
- [ ] 프로바이더별 프롬프트 포맷 변환 (Claude messages 형식 ↔ OpenAI chat 형식)
- [ ] 연결 테스트 기능 (설정한 엔드포인트로 테스트 요청 보내기)
- [ ] 설정 localStorage 저장/로드

**지원 프로바이더**:

| 프로바이더 | API 형식 | 엔드포인트 예시 |
|-----------|---------|----------------|
| Claude API | Anthropic Messages | `api.anthropic.com/v1/messages` |
| Ollama Cloud | OpenAI 호환 | 사용자 지정 URL |
| Vercel AI Gateway | OpenAI 호환 | 사용자 지정 URL |
| 커스텀 | OpenAI 호환 | 사용자 지정 URL |

**LLM Gateway 인터페이스 설계**:
```js
// 공통 인터페이스
class LLMProvider {
  async generateDialogue(systemPrompt, contextJSON) → string
  async testConnection() → boolean
}

// 프로바이더 팩토리
function createProvider(config) {
  switch (config.type) {
    case 'claude':    return new ClaudeProvider(config);
    case 'openai':    return new OpenAICompatProvider(config);
  }
}

// config 예시
{
  type: 'openai',           // 'claude' | 'openai'
  endpoint: 'https://...',  // API 엔드포인트 URL
  apiKey: 'sk-...',         // API 키
  model: 'llama3',          // 모델명
  name: 'My Ollama Cloud'   // 표시명
}
```

**핵심 데이터 흐름**:
```
대사 트리거 → 국면 컨텍스트 JSON 생성
→ LLM Gateway가 현재 선택된 프로바이더로 라우팅
→ 프로바이더가 프롬프트 포맷 변환 (Claude/OpenAI)
→ API 호출 → 응답 파싱 → 대사 UI 표시
```

### Phase 4: 다듬기 + 확장

**작업 항목**:
- [ ] 대국 기록 (KIF 형식 내보내기)
- [ ] 캐릭터 선택 기능 (복수 캐릭터 프리셋)
- [ ] 엔진 난이도 UI (레벨 슬라이더)
- [ ] 대국 후 하이라이트 리플레이 (대사 포함)
- [ ] 모바일 반응형 레이아웃
- [ ] 대사 히스토리 스크롤

---

## 파일 구조 (예상)

```
shogi-character-app/
├── index.html
├── style.css
├── src/
│   ├── main.js              # 앱 엔트리포인트
│   ├── board.js             # Shogiground + shogiops 래퍼
│   ├── engine.js            # Fairy Stockfish WASM Worker 관리
│   ├── engine.worker.js     # Web Worker (엔진 USI 통신)
│   ├── dialogue.js          # 대사 트리거 로직
│   ├── llm-gateway.js       # LLM 프로바이더 추상화 + 라우팅
│   ├── providers/
│   │   ├── claude.js         # Claude API 프로바이더
│   │   └── openai-compat.js  # OpenAI 호환 프로바이더 (Ollama Cloud, Vercel AI GW 등)
│   ├── character.js         # 캐릭터 프리셋 (프롬프트, 이름, 설정)
│   └── ui.js                # 대사창, 지물 표시, 게임 상태 UI
├── assets/
│   ├── pieces/              # 말 이미지 (SVG)
│   ├── board/               # 보드 배경
│   └── characters/          # 캐릭터 일러스트
├── lib/
│   ├── fairy-stockfish.wasm # 엔진 바이너리
│   └── fairy-stockfish.js   # 엔진 JS 글루코드
└── CLAUDE.md                # 이 파일
```

## 의존성 설치

```bash
npm init -y
npm install shogiground shogiops
# Fairy Stockfish WASM은 빌드된 바이너리를 lib/에 배치
# 또는 npm install fairy-stockfish-nnue.wasm
```

## 주요 참고 자료

- Shogiground: https://github.com/WandererXII/shogiground
- shogiops: https://github.com/WandererXII/shogiops
- Fairy Stockfish WASM: https://github.com/fairy-stockfish/fairy-stockfish.wasm
- Fairy Stockfish WASM 데모: https://fairy-stockfish-nnue-wasm.vercel.app/
- ffish.js (shogiops 대안): https://www.npmjs.com/package/ffish
- Fairyground (참고 구현): https://github.com/ianfab/fairyground
- lishogi 소스 (실전 참고): https://github.com/WandererXII/lishogi

## 라이선스 참고

Shogiground와 shogiops는 GPL-3.0이므로, 이 프로젝트를 배포할 경우 소스 코드를 공개해야 한다.
Fairy Stockfish도 GPL-3.0. Claude API 호출 부분은 별도 라이선스 영향 없음.

## 메모

- Phase 1~2는 Claude API 비용 없이 개발 가능. 대사 시스템은 보드가 안정된 뒤에 붙이는 게 효율적.
- 엔진 WASM 파일 크기가 수 MB이므로 초기 로딩 시 프로그레스바 필요.
- 대사 생성에 Sonnet을 쓰면 응답 속도와 비용의 균형이 맞음. 매 턴 호출하면 한 대국(~120수)에 약 60회 호출.
- SharedArrayBuffer 사용 시 서버에서 COOP/COEP 헤더 설정 필요.
