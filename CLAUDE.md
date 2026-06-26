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

### Phase 4.5: 전략 해석 레이어 — "기사처럼 생각하게 만들기"

**배경**: Phase 3의 대사 시스템은 평가치 변동 → 트리거 → 정해진 톤의 대사라는 자극-반응 구조.
결과적으로 "평가치가 떨어졌으니 놀란다" 수준의 GBA 시절 스크립트와 다를 게 없다.
진짜 기사는 **왜 그 수가 좋은지/나쁜지**, **앞으로 어떤 전개가 예상되는지**,
**대국 전체 흐름에서 이 국면이 무슨 의미인지**를 이해하고 말한다.
이 Phase의 목표는 LLM에 보내는 컨텍스트의 깊이를 근본적으로 올려서,
캐릭터가 진짜 쇼기를 이해하고 사고하는 것처럼 느껴지게 만드는 것.

**핵심 원칙**: 엔진 raw 데이터 → **전략 번역기** → 풍부한 컨텍스트 → LLM

#### 4.5.1 — PV(Principal Variation) 파싱

**목표**: 엔진이 생각하는 "이 뒤의 최선 수순"을 추출해서 LLM에 넘긴다.

**작업 항목**:
- [ ] 엔진 Worker에서 `bestmove`만이 아닌 직전 `info` 라인들을 수집
- [ ] 최종 depth의 PV(최선 수순), score(평가치), depth(탐색 깊이) 파싱
- [ ] PV의 USI 좌표를 사람이 읽을 수 있는 KIF 표기로 변환 (shogiops 활용)
- [ ] "최선이었던 수 vs 실제로 둔 수" 비교 로직

**파싱 대상 예시**:
```
info depth 18 score cp -165 pv 2d2c+ 3c2c S*2d 2c3d 4f3e
info depth 18 score cp 120 pv 3f3e 4d4e 2f2e    ← 최선수 라인
bestmove 5e5d                                     ← 실제 착수
```

위에서 추출되는 정보:
```json
{
  "engine_analysis": {
    "depth": 18,
    "best_move": "３六歩(37)",
    "best_pv": ["３六歩", "４四歩", "２五歩"],
    "best_eval": 120,
    "actual_move": "５四歩(55)",
    "actual_eval": -165,
    "eval_loss": 285,
    "best_idea_summary": "은을 활용한 2筋 계속 압박"
  }
}
```

#### 4.5.2 — 국면 분류기 (Position Classifier)

**목표**: 보드 위 말 배치를 읽어서 전법명, 카코이 형태, 게임 페이즈를 자동 판별.

**작업 항목**:
- [ ] shogiops의 보드 상태에서 말 좌표 추출
- [ ] 카코이(囲い) 패턴 매칭: 미노, 야구라, 후나, 아나구마 등 (왕+금은 배치로 판별)
- [ ] 전법(戦法) 분류: 봉은, 사간비차, 나카비차, 무카이비차, 거비차 등 (비차 위치 기준)
- [ ] 게임 페이즈 판별: 서반(~30수) / 중반(~80수) / 종반(80수~) + 왕 위협도 기반 보정
- [ ] 긴장 포인트 감지: 보병 대치 라인, 비각 사선 위협, 말 밀집 구역

**카코이 판별 로직 예시** (미노 감지):
```js
function detectMino(board, color) {
  // 미노: 왕이 2八(또는 8二), 금이 3八(7二), 은이 3九(7一) 근방
  const king = findKing(board, color);
  const golds = findPieces(board, color, 'gold');
  const silvers = findPieces(board, color, 'silver');
  // 왕-금-은의 상대 위치 패턴으로 매칭
  return matchPattern(king, golds, silvers, MINO_PATTERNS);
}
```

**분류 출력 예시**:
```json
{
  "position_classification": {
    "sente_strategy": "봉은 (棒銀)",
    "gote_strategy": "사간비차 (四間飛車)",
    "sente_castle": "후나 (舟囲い) — 불완전",
    "gote_castle": "미노 (美濃囲い) — 완성",
    "game_phase": "중반 진입",
    "tension_points": ["2筋 보병 대치", "5筋 각 라인 개방"]
  }
}
```

**지원할 패턴 목록** (1차 구현):

| 카코이 | 판별 기준 |
|--------|----------|
| 미노 (美濃) | 왕 2八계열 + 금 3八ㆍ은 3九 |
| 고미노 (高美濃) | 미노 + 은이 4七로 이동 |
| 야구라 (矢倉) | 왕 8八계열 + 금 7八ㆍ은 7七ㆍ금 6七ㆍ은 6六 등 |
| 후나 (舟) | 왕 6八ㆍ7八ㆍ7九 + 금은 미완성 배치 |
| 아나구마 (穴熊) | 왕 9九(1一) + 향차 옆, 금은 밀착 |
| 없음 | 위 패턴 미해당 |

| 전법 | 판별 기준 |
|------|----------|
| 거비차 (居飛車) | 비차가 2筋(8筋) 유지 |
| 봉은 (棒銀) | 거비차 + 은이 2六(8四) 이상 진출 |
| 사간비차 (四間飛車) | 비차가 6筋(4筋) 이동 |
| 나카비차 (中飛車) | 비차가 5筋 이동 |
| 무카이비차 (向かい飛車) | 비차가 8筋(2筋) 이동 (진비차 계열) |
| 삼간비차 (三間飛車) | 비차가 7筋(3筋) 이동 |

#### 4.5.3 — 게임 내러티브 누적

**목표**: 매 턴의 전략 상황 요약을 배열로 쌓아서, LLM이 "흐름"을 파악할 수 있게 한다.

**작업 항목**:
- [ ] 턴별 요약 자동 생성 (국면 분류 + 평가치 변동 + 주요 이벤트)
- [ ] 최근 N턴(4~6턴) 내러티브를 LLM 컨텍스트에 포함
- [ ] 대국 전체 흐름 태그 누적 (예: "봉은 조립 → 2筋 돌파 시도 → 각교환 → 역습")
- [ ] 이전 대사 히스토리 포함 (캐릭터 발언 일관성 유지)

**내러티브 배열 예시**:
```json
{
  "game_narrative": {
    "opening_type": "봉은 vs 사간비차",
    "flow_tags": ["봉은 조립", "미노 완성", "2筋 압박 개시", "각교환 발생"],
    "sente_plan": "2筋 돌파 후 용(龍) 제작 노림",
    "gote_plan": "미노 방어 후 6筋 역습 준비 중",
    "recent_turns": [
      { "turn": 20, "summary": "후수 미노 완성, 선수 은 전진 계속" },
      { "turn": 22, "summary": "2筋 보병 대치, 긴장 고조" },
      { "turn": 24, "summary": "선수 각교환 발생 — 지물에 각 추가" },
      { "turn": 26, "summary": "선수 ５五角打 — 양당잡이 노림이었으나 실패" }
    ],
    "previous_dialogue": [
      "「봉은으로 오는구나, 정면으로 받아줄게」",
      "「2筋이 무겁군... 미노만 믿고 버텨보자」"
    ]
  }
}
```

#### 4.5.4 — 풍부한 컨텍스트 JSON (Phase 3 대체)

Phase 3의 단순 컨텍스트를 다음 구조로 교체한다:

```json
{
  "game_narrative": {
    "opening_type": "봉은 vs 사간비차",
    "phase": "중반 진입",
    "flow_tags": ["봉은 조립", "미노 완성", "각교환"],
    "sente_plan": "2筋 돌파 후 용(龍) 제작 노림",
    "gote_plan": "미노 방어 후 6筋 역습 준비 중"
  },
  "this_move": {
    "turn": 26,
    "move": "５五角打",
    "classification": "공격 (양당잡이 위협)",
    "eval_before": 120,
    "eval_after": -165,
    "captured_piece": null,
    "is_check": false
  },
  "engine_analysis": {
    "depth": 18,
    "best_move": "３六歩",
    "best_pv_kif": ["３六歩", "４四歩", "２五歩"],
    "best_idea": "은을 활용한 2筋 계속 압박이 최선이었음",
    "eval_loss": 285
  },
  "positional_factors": {
    "sente_castle": "후나 (불완전) — 금 1개만 인접",
    "gote_castle": "미노 (완성) — 견고",
    "material_balance": "선수 은 1개 이득",
    "king_safety_sente": "불안정",
    "king_safety_gote": "안정",
    "tension_points": ["2筋 보병 대치", "5筋 각 라인"]
  },
  "recent_turns": [
    { "turn": 22, "summary": "2筋 보병 대치, 긴장 고조" },
    { "turn": 24, "summary": "각교환 발생 — 지물에 각 추가" }
  ],
  "previous_dialogue": [
    "「2筋이 무겁군... 미노만 믿고 버텨보자」"
  ]
}
```

#### 4.5.5 — 2단계 LLM 호출 (선택적)

**목표**: 사고(분석)와 발화(대사)를 분리해서 대사 품질을 올린다.

**흐름**:
```
[1단계: 분석 호출]
시스템: "당신은 프로 기사입니다. 아래 국면을 전략적으로 분석해주세요."
입력: 풍부한 컨텍스트 JSON
출력: 전략 분석 텍스트 (2~4문장)

[2단계: 대사 호출]
시스템: "당신은 [캐릭터명]입니다. 아래 분석을 바탕으로 캐릭터로서 한마디 해주세요."
입력: 1단계 분석 결과 + 캐릭터 설정
출력: 캐릭터 대사 (1~3문장)
```

**작업 항목**:
- [ ] 분석용 시스템 프롬프트 작성 (캐릭터 무관, 순수 전략 분석)
- [ ] 대사용 시스템 프롬프트에 분석 결과 주입 슬롯 추가
- [ ] 2단계 호출 on/off 토글 (비용 절감 옵션)
- [ ] 1단계 분석 결과 캐싱 (같은 국면 재분석 방지)

**비용 참고**: 2단계 호출은 1단계 대비 토큰 비용 약 2배.
한 대국(~120수, 60회 호출) 기준 Sonnet 사용 시:
- 1단계만: ~60회 × ~1K 토큰 ≈ 약 $0.18
- 2단계 포함: ~60회 × ~2K 토큰 ≈ 약 $0.36

#### Phase 4.5 추가 파일

```
src/
├── strategy/
│   ├── pv-parser.js          # 엔진 info 라인 → PV/score 파싱
│   ├── position-classifier.js # 카코이/전법/페이즈 판별
│   ├── narrative.js           # 게임 내러티브 누적 관리
│   └── context-builder.js     # 풍부한 컨텍스트 JSON 조립
```

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
│   ├── strategy/
│   │   ├── pv-parser.js          # 엔진 info 라인 → PV/score 파싱
│   │   ├── position-classifier.js # 카코이/전법/페이즈 판별
│   │   ├── narrative.js           # 게임 내러티브 누적 관리
│   │   └── context-builder.js     # 풍부한 컨텍스트 JSON 조립 (Phase 3 컨텍스트 대체)
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
