const socket = io();

let gameState = null;


// ========================================
// DOM
// ========================================

const lobby =
    document.getElementById("lobby");

const game =
    document.getElementById("game");

const result =
    document.getElementById("result");

const nameInput =
    document.getElementById("nameInput");

const roomInput =
    document.getElementById("roomInput");

const createButton =
    document.getElementById("createButton");

const joinButton =
    document.getElementById("joinButton");

const startButton =
    document.getElementById("startButton");

const fixedKingButton =
    document.getElementById(
        "fixedKingButton"
    );

const roomInfo =
    document.getElementById("roomInfo");

const playerList =
    document.getElementById("playerList");

const roleInfo =
    document.getElementById("roleInfo");

const turnInfo =
    document.getElementById("turnInfo");

const players =
    document.getElementById("players");

const board =
    document.getElementById("board");

const message =
    document.getElementById("message");

const resultText =
    document.getElementById("resultText");


// ========================================
// 名前
// ========================================

function getName() {

    return (
        nameInput.value.trim() ||
        "プレイヤー"
    );
}


// ========================================
// 部屋作成
// ========================================

createButton.addEventListener(
    "click",
    () => {

        socket.emit(
            "createRoom",
            {
                name: getName()
            }
        );
    }
);


// ========================================
// 部屋参加
// ========================================

joinButton.addEventListener(
    "click",
    () => {

        const roomId =
            roomInput.value
                .trim()
                .toUpperCase();

        if (!roomId) {
            return;
        }

        socket.emit(
            "joinRoom",
            {
                roomId,

                name: getName()
            }
        );
    }
);


// ========================================
// 通常開始
// ========================================

startButton.addEventListener(
    "click",
    () => {

        socket.emit(
            "startGame"
        );
    }
);


// ========================================
// 王固定開始
// ========================================

fixedKingButton.addEventListener(
    "click",
    () => {

        socket.emit(
            "startFixedKingGame"
        );
    }
);


// ========================================
// 部屋作成通知
// ========================================

socket.on(
    "roomCreated",
    data => {

        roomInput.value =
            data.roomId;

        roomInfo.textContent =
            `部屋ID：${data.roomId}`;

        alert(
            `部屋を作りました。\n部屋ID：${data.roomId}`
        );
    }
);


// ========================================
// エラー
// ========================================

socket.on(
    "errorMessage",
    messageText => {

        alert(messageText);
    }
);


// ========================================
// ゲーム状態
// ========================================

socket.on(
    "gameState",
    state => {

        gameState = state;

        if (state.phase === "lobby") {

            renderLobby();

        }
        else if (state.phase === "playing") {

            lobby.classList.add("hidden");

            game.classList.remove("hidden");

            result.classList.add("hidden");

            renderGame();

        }
        else if (state.phase === "result") {

            lobby.classList.add("hidden");

            game.classList.add("hidden");

            result.classList.remove("hidden");

            renderResult();
        }
    }
);


// ========================================
// ロビー
// ========================================

function renderLobby() {

    lobby.classList.remove("hidden");

    game.classList.add("hidden");

    result.classList.add("hidden");

    if (!gameState) {
        return;
    }

    roomInfo.textContent =
        `部屋ID：${gameState.roomId}`;

    playerList.innerHTML = "";

    gameState.players.forEach(
        player => {

            const div =
                document.createElement("div");

            div.className =
                "player";

            div.textContent =
                player.isCPU
                    ? `${player.name}（CPU）`
                    : player.name;

            playerList.appendChild(div);
        }
    );
}


// ========================================
// ゲーム
// ========================================

function renderGame() {

    renderRole();

    renderTurn();

    renderPlayers();

    renderBoard();
}


// ========================================
// 役割表示
// ========================================

function renderRole() {

    if (gameState.myRole === "king") {

        roleInfo.textContent =
            "あなたは【王】です";

    }
    else if (gameState.myRole === "ally") {

        roleInfo.textContent =
            "あなたは【王の味方】です";

    }
    else {

        roleInfo.textContent =
            "あなたは【王の敵】です";
    }
}


// ========================================
// ターン表示
// ========================================

function renderTurn() {

    const currentColor =
        gameState.turnColor ||
        gameState.currentColor;

    turnInfo.textContent =
        `現在のターン：${getColorName(
            currentColor
        )}`;
}


// ========================================
// プレイヤー表示
// ========================================

function renderPlayers() {

    players.innerHTML = "";

    gameState.players.forEach(
        player => {

            const div =
                document.createElement("div");

            div.className =
                "playerCard";

            let text =
                `${player.name}：${getColorName(player.color)}`;

            if (
                player.id === socket.id
            ) {

                text += " ★";
            }

            div.textContent = text;

            players.appendChild(div);
        }
    );
}


// ========================================
// 盤面
// ========================================

function renderBoard() {

    board.innerHTML = "";

    for (let y = 0; y < 8; y++) {

        for (let x = 0; x < 8; x++) {

            const cell =
                document.createElement("div");

            cell.className =
                "cell";

            const color =
                gameState.board[y][x];

            if (color) {

                const stone =
                    document.createElement("div");

                stone.className =
                    `stone ${color}`;

                cell.appendChild(stone);
            }

            cell.addEventListener(
                "click",
                () => {

                    const currentColor =
    gameState.turnColor ||
    gameState.currentColor;

if (
    currentColor !==
    gameState.myColor
) {
    return;
}

                    socket.emit(
                        "placeStone",
                        {
                            x,
                            y
                        }
                    );
                }
            );

            board.appendChild(cell);
        }
    }
}


// ========================================
// 結果
// ========================================
function getRoleName(role) {

    if (role === "king") {
        return "王";
    }

    if (role === "ally") {
        return "王の味方";
    }

    if (role === "enemy") {
        return "王の敵";
    }

    return "";
}


function getRoleName(role) {

    if (role === "king") {
        return "王";
    }

    if (role === "ally") {
        return "王の味方";
    }

    if (role === "enemy") {
        return "王の敵";
    }

    return "";
}


function renderResult() {

    const myColor =
        gameState.myColor;

    const myRole =
        gameState.myRole;

    const r =
        gameState.result;

    if (!r) {
        return;
    }


    let winnerText;


    if (r.winner === "king") {

        winnerText =
            "👑 王チームの勝利！";

    }
    else if (r.winner === "enemy") {

        winnerText =
            "⚔ 敵チームの勝利！";

    }
    else {

        winnerText =
            "🤝 引き分け！";
    }


    resultText.innerHTML = `

        <div class="winner">
            ${winnerText}
        </div>


        <div class="myResult">

            <div>
                あなたの色：
                <strong>
                    ${getColorName(myColor)}
                </strong>
            </div>

            <div>
                あなたの役割：
                <strong>
                    ${getRoleName(myRole)}
                </strong>
            </div>

        </div>


        <div class="resultCount">
            黒：${r.counts.black}
        </div>

        <div class="resultCount">
            赤：${r.counts.red}
        </div>

        <div class="resultCount">
            青：${r.counts.blue}
        </div>

        <div class="resultCount">
            黄：${r.counts.yellow}
        </div>


        <div class="allyReveal">

            王の味方は

            <strong>
                ${getColorName(r.kingAlly)}
            </strong>

            でした！

        </div>


        <div>
            王チーム：
            ${r.kingTeam}
            枚
        </div>


        <div>
            敵チーム：
            ${r.enemyTeam}
            枚
        </div>
    `;
}

// ========================================
// 色名
// ========================================

function getColorName(color) {

    const names = {

        black: "黒",

        red: "赤",

        blue: "青",

        yellow: "黄"
    };

    return names[color] || "";
}