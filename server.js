
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("client"));

const PORT = process.env.PORT || 3000;


// ==================================================
// ゲーム設定
// ==================================================

const BOARD_SIZE = 8;

const COLORS = [
    "black",
    "red",
    "blue",
    "yellow"
];

const COLOR_NAMES = {
    black: "黒",
    red: "赤",
    blue: "青",
    yellow: "黄"
};

// ターン順は絶対固定
const TURN_ORDER = [
    "black",
    "red",
    "blue",
    "yellow"
];


// 8方向
const DIRECTIONS = [
    [-1, -1],
    [0, -1],
    [1, -1],

    [-1, 0],
    [1, 0],

    [-1, 1],
    [0, 1],
    [1, 1]
];


const rooms = {};


// ==================================================
// 共通関数
// ==================================================

function shuffle(array) {

    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {

        const j =
            Math.floor(Math.random() * (i + 1));

        [
            result[i],
            result[j]
        ] = [
            result[j],
            result[i]
        ];
    }

    return result;
}


function clone(value) {

    return JSON.parse(
        JSON.stringify(value)
    );
}


function isInside(x, y) {

    return (
        x >= 0 &&
        x < BOARD_SIZE &&
        y >= 0 &&
        y < BOARD_SIZE
    );
}


// ==================================================
// 盤面作成
// ==================================================

function createBoard() {

    const board = [];

    for (let y = 0; y < BOARD_SIZE; y++) {

        board[y] = [];

        for (let x = 0; x < BOARD_SIZE; x++) {

            board[y][x] = null;
        }
    }

    // 中央4マス
    //
    // 黒 赤
    // 黄 青

    board[3][3] = "black";
    board[3][4] = "red";
    board[4][3] = "yellow";
    board[4][4] = "blue";

    return board;
}


// ==================================================
// 部屋作成
// ==================================================

function createRoom() {

    const roomId =
        Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase();

    const room = {

        id: roomId,

        phase: "lobby",

        players: [],

        board: createBoard(),

        // 黒→赤→青→黄
        turnColor: "black",

        // 王の味方
        // red / blue / yellow
        kingAlly: null,

        result: null
    };

    rooms[roomId] = room;

    return room;
}


// ==================================================
// プレイヤー作成
// ==================================================

function createPlayer(
    socketId,
    name
) {

    return {

        id: socketId,

        name:
            name || "プレイヤー",

        color: null,

        isCPU: false
    };
}


// ==================================================
// 部屋検索
// ==================================================

function findRoomByPlayer(socketId) {

    return Object.values(rooms)
        .find(room =>

            room.players.some(
                player =>
                    player.id === socketId
            )
        );
}


// ==================================================
// 色割り当て
// ==================================================

function assignRandomColors(room) {

    const colors =
        shuffle(COLORS);

    room.players.forEach(
        (player, index) => {

            player.color =
                colors[index];
        }
    );
}


// ==================================================
// 王固定モード
// ==================================================

function assignFixedKing(
    room,
    kingPlayerId
) {

    const otherColors =
        shuffle([
            "red",
            "blue",
            "yellow"
        ]);

    const kingPlayer =
        room.players.find(
            player =>
                player.id === kingPlayerId
        );

    if (kingPlayer) {

        kingPlayer.color = "black";
    }

    const otherPlayers =
        room.players.filter(
            player =>
                player.id !== kingPlayerId
        );

    otherPlayers.forEach(
        (player, index) => {

            player.color =
                otherColors[index];
        }
    );
}


// ==================================================
// CPU補充
// ==================================================

function fillCPU(room) {

    const usedColors =
        room.players.map(
            player =>
                player.color
        );

    const missingColors =
        COLORS.filter(
            color =>
                !usedColors.includes(color)
        );

    missingColors.forEach(color => {

        room.players.push({

            id:
                `CPU_${color}_${Date.now()}_${Math.random()}`,

            name:
                `CPU ${COLOR_NAMES[color]}`,

            color,

            isCPU: true
        });
    });
}


// ==================================================
// 王の味方を決定
// ==================================================

function chooseKingAlly(room) {

    const possibleAllies = [
        "red",
        "blue",
        "yellow"
    ];

    room.kingAlly =
        possibleAllies[
            Math.floor(
                Math.random() *
                possibleAllies.length
            )
        ];

    console.log(
        `[${room.id}] 王の味方: ${room.kingAlly}`
    );
}


// ==================================================
// 次の色
// ==================================================

function getNextColor(currentColor) {

    const index =
        TURN_ORDER.indexOf(
            currentColor
        );

    if (index === -1) {

        return "black";
    }

    return TURN_ORDER[
        (index + 1) %
        TURN_ORDER.length
    ];
}


// ==================================================
// 現在のプレイヤー
// ==================================================

function getPlayerByColor(
    room,
    color
) {

    return room.players.find(
        player =>
            player.color === color
    );
}


// ==================================================
// ひっくり返せる駒を取得
// ==================================================
//
// 今回の仕様では
//
// 「空いていれば置ける」
//
// ただし、置いた結果
// 自分の色で挟めた駒はひっくり返す。
// ==================================================

function getFlips(
    room,
    x,
    y,
    color
) {

    if (!isInside(x, y)) {

        return null;
    }

    const board =
        room.board;

    // すでに駒がある
    if (board[y][x] !== null) {

        return null;
    }

    const flips = [];


    for (
        const [dx, dy]
        of DIRECTIONS
    ) {

        let cx =
            x + dx;

        let cy =
            y + dy;

        const line = [];


        while (
            isInside(cx, cy)
        ) {

            const current =
                board[cy][cx];


            // 空白
            if (current === null) {

                break;
            }


            // 自分の色
            if (current === color) {

                if (line.length > 0) {

                    flips.push(
                        ...line
                    );
                }

                break;
            }


            // 他色
            line.push([
                cx,
                cy
            ]);

            cx += dx;
            cy += dy;
        }
    }


    return flips;
}


// ==================================================
// 空いているマスを全部取得
// ==================================================

function getValidMoves(
    room,
    color
) {

    const moves = [];

    for (
        let y = 0;
        y < BOARD_SIZE;
        y++
    ) {

        for (
            let x = 0;
            x < BOARD_SIZE;
            x++
        ) {

            const flips =
                getFlips(
                    room,
                    x,
                    y,
                    color
                );

            // nullではなければ
            // 空きマスなので置ける
            if (flips !== null) {

                moves.push({

                    x,

                    y,

                    flips
                });
            }
        }
    }

    return moves;
}


// ==================================================
// 駒を置く
// ==================================================

function placeStone(
    room,
    player,
    x,
    y
) {

    const flips =
        getFlips(
            room,
            x,
            y,
            player.color
        );

    // null = 置けない
    if (flips === null) {

        return false;
    }


    // 自分の駒を置く
    room.board[y][x] =
        player.color;


    // 挟んだ駒を自分の色にする
    flips.forEach(
        ([fx, fy]) => {

            room.board[fy][fx] =
                player.color;
        }
    );


    return true;
}


// ==================================================
// 盤面の駒数
// ==================================================

function countStones(room) {

    const counts = {

        black: 0,

        red: 0,

        blue: 0,

        yellow: 0
    };


    for (
        let y = 0;
        y < BOARD_SIZE;
        y++
    ) {

        for (
            let x = 0;
            x < BOARD_SIZE;
            x++
        ) {

            const color =
                room.board[y][x];

            if (color) {

                counts[color]++;
            }
        }
    }


    return counts;
}


// ==================================================
// 盤面が全部埋まったか
// ==================================================

function isBoardFull(room) {

    for (
        let y = 0;
        y < BOARD_SIZE;
        y++
    ) {

        for (
            let x = 0;
            x < BOARD_SIZE;
            x++
        ) {

            if (
                room.board[y][x] === null
            ) {

                return false;
            }
        }
    }

    return true;
}


// ==================================================
// ゲーム終了
// ==================================================

function finishGame(room) {

    if (
        room.phase === "result"
    ) {

        return;
    }


    room.phase = "result";


    const counts =
        countStones(room);


    // 黒＋王の味方
    const kingTeam =
        counts.black +
        counts[room.kingAlly];


    // 残り2色
    const enemyTeam =
        counts.red +
        counts.blue +
        counts.yellow -
        counts[room.kingAlly];


    let winner;


    if (
        kingTeam >
        enemyTeam
    ) {

        winner = "king";

    }
    else if (
        enemyTeam >
        kingTeam
    ) {

        winner = "enemy";

    }
    else {

        winner = "draw";
    }


    room.result = {

        counts,

        kingAlly:
            room.kingAlly,

        kingTeam,

        enemyTeam,

        winner
    };


    console.log(
        `[${room.id}] GAME OVER`
    );

    console.log(
        room.result
    );


    broadcastRoom(room);
}


// ==================================================
// 次のターンへ
// ==================================================

function nextTurn(room) {

    if (
        room.phase !== "playing"
    ) {

        return;
    }


    // 盤面が埋まった
    if (
        isBoardFull(room)
    ) {

        finishGame(room);

        return;
    }


    room.turnColor =
        getNextColor(
            room.turnColor
        );


    broadcastRoom(room);


    // 次のプレイヤーがCPUなら動かす
    setTimeout(
        () => {

            cpuTurn(room);

        },
        400
    );
}


// ==================================================
// CPU
// ==================================================


function cpuTurn(room) {

    if (
        room.phase !== "playing"
    ) {
        return;
    }


    const player =
        getPlayerByColor(
            room,
            room.turnColor
        );


    if (!player) {

        console.error(
            "現在の色のプレイヤーが存在しません:",
            room.turnColor
        );

        return;
    }


    // 人間のターンなら何もしない
    if (!player.isCPU) {

        return;
    }


    const moves =
        getValidMoves(
            room,
            player.color
        );


    // 置ける場所がない
    if (
        moves.length === 0
    ) {

        finishGame(room);

        return;
    }


    // ==========================================
    // CPU思考
    // ==========================================
    //
    // 優先順位
    //
    // ① 角
    // ② ひっくり返せる駒が多い
    // ③ ランダム
    //
    // ==========================================


    // まず角を探す
    const cornerMoves =
        moves.filter(move => {

            return (
                (
                    move.x === 0 ||
                    move.x === BOARD_SIZE - 1
                ) &&
                (
                    move.y === 0 ||
                    move.y === BOARD_SIZE - 1
                )
            );
        });


    let selectedMove;


    // ==========================================
    // ① 角に置ける場合
    // ==========================================

    if (
        cornerMoves.length > 0
    ) {

        // 複数の角に置ける場合はランダム
        selectedMove =
            cornerMoves[
                Math.floor(
                    Math.random() *
                    cornerMoves.length
                )
            ];

    }

    // ==========================================
    // ② 角がない場合
    // ==========================================

    else {

        const maxFlips =
            Math.max(
                ...moves.map(
                    move =>
                        move.flips.length
                )
            );


        const bestMoves =
            moves.filter(
                move =>
                    move.flips.length ===
                    maxFlips
            );


        // 同じ評価ならランダム
        selectedMove =
            bestMoves[
                Math.floor(
                    Math.random() *
                    bestMoves.length
                )
            ];
    }


    // ==========================================
    // 実際に配置
    // ==========================================

    console.log(
        `[${room.id}] CPU ${player.color} が`,
        `(${selectedMove.x}, ${selectedMove.y})`,
        `に配置`,
        `flips=${selectedMove.flips.length}`
    );


    placeStone(
        room,
        player,
        selectedMove.x,
        selectedMove.y
    );


    // 次のターン
    nextTurn(room);
}




// ==================================================
// プレイヤーごとの状態
// ==================================================

function getPublicState(
    room,
    socketId
) {

    const me =
        room.players.find(
            player =>
                player.id === socketId
        );

    const publicPlayers =
        room.players.map(
            player => {

                let role = null;

                if (
                    player.id === socketId
                ) {

                    if (
                        player.color === "black"
                    ) {

                        role = "king";

                    }
                    else if (
                        player.color === room.kingAlly
                    ) {

                        role = "ally";

                    }
                    else {

                        role = "enemy";
                    }
                }

                return {

                    id: player.id,

                    name: player.name,

                    color: player.color,

                    isCPU: player.isCPU,

                    role
                };
            }
        );


    const currentColor =
        room.turnColor;


    return {

        roomId:
            room.id,

        phase:
            room.phase,

        board:
            clone(room.board),

        players:
            publicPlayers,

        // 現在のターン
        turnColor:
            currentColor,

        // game.js互換
        currentColor:
            currentColor,

        // 自分の色
        myColor:
            me?.color || null,

        // 自分の役割
        myRole:
            me
                ? (
                    me.color === "black"
                        ? "king"
                        : (
                            me.color === room.kingAlly
                                ? "ally"
                                : "enemy"
                        )
                )
                : null,

        result:
            room.phase === "result"
                ? room.result
                : null
    };
}

// ==================================================
// 全員に状態送信
// ==================================================

function broadcastRoom(room) {

    room.players.forEach(
        player => {

            if (
                player.isCPU
            ) {

                return;
            }


            io.to(player.id).emit(
                "gameState",
                getPublicState(
                    room,
                    player.id
                )
            );
        }
    );
}


// ==================================================
// Socket.IO
// ==================================================

io.on(
    "connection",
    socket => {

        console.log(
            "プレイヤー接続:",
            socket.id
        );


        // ==========================================
        // 部屋作成
        // ==========================================

        socket.on(
            "createRoom",
            data => {

                const room =
                    createRoom();


                const player =
                    createPlayer(
                        socket.id,
                        data?.name
                    );


                room.players.push(
                    player
                );


                socket.join(
                    room.id
                );


                socket.emit(
                    "roomCreated",
                    {
                        roomId:
                            room.id
                    }
                );


                broadcastRoom(room);
            }
        );


        // ==========================================
        // 部屋参加
        // ==========================================

        socket.on(
            "joinRoom",
            data => {

                const roomId =
                    String(
                        data?.roomId || ""
                    )
                    .trim()
                    .toUpperCase();


                const room =
                    rooms[roomId];


                if (!room) {

                    socket.emit(
                        "errorMessage",
                        "部屋が存在しません"
                    );

                    return;
                }


                if (
                    room.phase !==
                    "lobby"
                ) {

                    socket.emit(
                        "errorMessage",
                        "ゲームはすでに開始しています"
                    );

                    return;
                }


                if (
                    room.players.length >= 4
                ) {

                    socket.emit(
                        "errorMessage",
                        "この部屋は満員です"
                    );

                    return;
                }


                const player =
                    createPlayer(
                        socket.id,
                        data?.name
                    );


                room.players.push(
                    player
                );


                socket.join(
                    room.id
                );


                broadcastRoom(room);
            }
        );


        // ==========================================
        // 通常ゲーム開始
        // ==========================================

        socket.on(
            "startGame",
            () => {

                const room =
                    findRoomByPlayer(
                        socket.id
                    );


                if (!room) {

                    return;
                }


                // ホスト判定
                if (
                    room.players[0].id !==
                    socket.id
                ) {

                    socket.emit(
                        "errorMessage",
                        "部屋の作成者だけがゲームを開始できます"
                    );

                    return;
                }


                // 参加人数チェック
                if (
                    room.players.length < 1
                ) {

                    return;
                }


                assignRandomColors(
                    room
                );


                fillCPU(room);


                chooseKingAlly(
                    room
                );


                room.phase =
                    "playing";


                room.turnColor =
                    "black";


                broadcastRoom(room);


                // 黒がCPUならCPU開始
                setTimeout(
                    () => {

                        cpuTurn(room);

                    },
                    500
                );
            }
        );


        // ==========================================
        // 王固定ゲーム開始
        // ==========================================

        socket.on(
            "startFixedKingGame",
            () => {

                const room =
                    findRoomByPlayer(
                        socket.id
                    );


                if (!room) {

                    return;
                }


                // ホストのみ
                if (
                    room.players[0].id !==
                    socket.id
                ) {

                    socket.emit(
                        "errorMessage",
                        "部屋の作成者だけがゲームを開始できます"
                    );

                    return;
                }


                assignFixedKing(
                    room,
                    socket.id
                );


                fillCPU(room);


                chooseKingAlly(
                    room
                );


                room.phase =
                    "playing";


                room.turnColor =
                    "black";


                broadcastRoom(room);


                setTimeout(
                    () => {

                        cpuTurn(room);

                    },
                    500
                );
            }
        );


        // ==========================================
        // 駒を置く
        // ==========================================

        socket.on(
            "placeStone",
            data => {

                const room =
                    findRoomByPlayer(
                        socket.id
                    );


                if (!room) {

                    return;
                }


                if (
                    room.phase !==
                    "playing"
                ) {

                    return;
                }


                const player =
                    room.players.find(
                        p =>
                            p.id ===
                            socket.id
                    );


                if (!player) {

                    return;
                }


                // 自分の色のターンか
                if (
                    room.turnColor !==
                    player.color
                ) {

                    socket.emit(
                        "errorMessage",
                        "あなたのターンではありません"
                    );

                    return;
                }


                const x =
                    Number(data?.x);

                const y =
                    Number(data?.y);


                // 範囲チェック
                if (
                    !isInside(x, y)
                ) {

                    socket.emit(
                        "errorMessage",
                        "その場所には置けません"
                    );

                    return;
                }


                const success =
                    placeStone(
                        room,
                        player,
                        x,
                        y
                    );


                if (!success) {

                    socket.emit(
                        "errorMessage",
                        "そのマスにはすでに駒があります"
                    );

                    return;
                }


                console.log(
                    `[${room.id}] ${player.color} が (${x}, ${y}) に配置`
                );


                nextTurn(room);
            }
        );


        // ==========================================
        // 切断
        // ==========================================

        socket.on(
            "disconnect",
            () => {

                console.log(
                    "プレイヤー切断:",
                    socket.id
                );


                const room =
                    findRoomByPlayer(
                        socket.id
                    );


                if (!room) {

                    return;
                }


                // ゲーム開始前なら
                // プレイヤーを削除
                if (
                    room.phase ===
                    "lobby"
                ) {

                    room.players =
                        room.players.filter(
                            player =>
                                player.id !==
                                socket.id
                        );


                    if (
                        room.players.length === 0
                    ) {

                        delete rooms[
                            room.id
                        ];

                    }
                    else {

                        broadcastRoom(
                            room
                        );
                    }
                }
            }
        );
    }
);


// ==================================================
// サーバー起動
// ==================================================

server.listen(
    PORT,
    () => {
        console.log(
            `KING LEAR 起動: port ${PORT}`
        );
    }
);