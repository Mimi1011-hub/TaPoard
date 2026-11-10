(function () {
  'use strict';
  var $ = function (id) {
    return document.getElementById(id);
  };
  var admin = location.pathname === '/settings';
  // 3.0: the deck inside TaPoard's own PC window (WebView2). The query survives the key cleanup below.
  var pcWindow = !admin && (/(^|&)view=pc(&|$)/.test(location.search.slice(1)) || sessionStorage.getItem('tapoard-pc-window') === '1');
  if (pcWindow) sessionStorage.setItem('tapoard-pc-window', '1');
  var scannedKey = '';
  if (!admin && location.hash.indexOf('#connect=') === 0)
    try {
      scannedKey = decodeURIComponent(location.hash.slice(9));
    } catch (e) {
      scannedKey = '';
    }
  var key = admin
    ? location.hash.slice(1) ||
      sessionStorage.getItem('tapoard-admin') ||
      sessionStorage.getItem('streamdeck-admin') ||
      ''
    : scannedKey || localStorage.getItem('tapoard-key') || localStorage.getItem('streamdeck-key') || '';
  var viewId = sessionStorage.getItem('tapoard-view-id');
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(viewId || '')) {
    viewId =
      window.crypto && window.crypto.getRandomValues
        ? Array.prototype.map.call(window.crypto.getRandomValues(new Uint8Array(12)), function (value) { return ('0' + value.toString(16)).slice(-2); }).join('')
        : String(Date.now()) + Math.random().toString(36).slice(2);
    sessionStorage.setItem('tapoard-view-id', viewId);
  }
  var timer,
    lock = null,
    noSleep = null,
    connected = false,
    rows = [],
    deckApps = [],
    inputSessionByWidget = {},
    deckVersion = '',
    deckRevision = 0,
    page = 0,
    pageCount = 1,
    pagesByOrientation = { landscape: 1, portrait: 1 },
    pageByOrientation = { landscape: 0, portrait: 0 },
    lastPhoneOrientation = '',
    watchStarted = false,
    saveQueue = Promise.resolve(),
    previewOrientation =
      (localStorage.getItem('tapoard-preview-orientation') ||
        localStorage.getItem('streamdeck-preview-orientation')) === 'portrait'
        ? 'portrait'
        : 'landscape',
    layout = {
      grids: { landscape: { columns: 5, rows: 3 }, portrait: { columns: 3, rows: 5 } },
      keepAwake: true,
      controls: {
        landscape: { speakerSlot: 0, micSlot: 1, speakerSize: 1, micSize: 1, speakerRow: 0, speakerColumn: 0, speakerWidth: 1, speakerHeight: 1, micRow: 0, micColumn: 1, micWidth: 1, micHeight: 1 },
        portrait: { speakerSlot: 0, micSlot: 1, speakerSize: 1, micSize: 1, speakerRow: 0, speakerColumn: 0, speakerWidth: 1, speakerHeight: 1, micRow: 0, micColumn: 1, micWidth: 1, micHeight: 1 },
      },
      // Page number -> that page's own faders; other pages use the shared controls above.
      controlPages: { landscape: {}, portrait: {} },
    },
    appsPerPage = 13,
    audioState = {
      speakerVolume: 50,
      speakerMuted: false,
      speakerAvailable: true,
      micVolume: 50,
      micMuted: false,
      micAvailable: true,
    },
    metricsState = {
      active: false,
      cpuSupported: true,
      cpuAvailable: false,
      memoryAvailable: false,
      cpuPercent: null,
      memoryPercent: null,
      memoryUsedBytes: 0,
      memoryTotalBytes: 0,
      history: [],
      gpus: [],
    },
    weatherState = { active: false, configured: false, available: false, stale: false, location: '', days: [], attribution: 'Weather data by Open-Meteo.com' },
    weatherLocation = { configured: false, name: '', latitude: 0, longitude: 0, timezone: '' },
    audioInteraction = false,
    messageTimer = null,
    clockTimer = null,
    pcStats = { action: null, ping: null };
  if (admin) {
    document.body.classList.add('admin-view');
    sessionStorage.setItem('tapoard-admin', key);
    history.replaceState(null, '', '/settings');
  } else if (key) {
    localStorage.setItem('tapoard-key', key);
    if (scannedKey) history.replaceState(null, '', pcWindow ? '/?view=pc' : '/');
  }

  var catalog = [
    {
      category: 'audio',
      title: 'スピーカー・マイク',
      note: 'Windowsの既定の入出力音量',
      items: [
        ['control-speaker-fader', 'スピーカーフェーダー', '枠内を上下スワイプ'],
        ['control-mic-fader', 'マイクフェーダー', '枠内を上下スワイプ'],
        ['custom-audio-output', '出力先を切替', '指定したスピーカー・ヘッドセットへ'],
        ['custom-audio-input', '入力先を切替', '指定したマイクへ'],
        ['audio-speaker-mute', 'スピーカー ミュート', 'オン／オフ'],
        ['audio-speaker-up', 'スピーカー音量 ＋', '5%上げる'],
        ['audio-speaker-down', 'スピーカー音量 −', '5%下げる'],
        ['audio-mic-mute', 'マイク ミュート', 'オン／オフ'],
        ['audio-mic-up', 'マイク音量 ＋', '5%上げる'],
        ['audio-mic-down', 'マイク音量 −', '5%下げる'],
      ],
    },
    {
      category: 'widget',
      title: '時計・情報表示',
      glyph: 'clock',
      note: 'スマートフォン内で動く低負荷な表示部品',
      items: [
        ['widget-clock-digital-wide', 'デジタル時計（横長）', '2×1・端末時刻'],
        ['widget-clock-digital', 'デジタル時計', '2×2・端末時刻'],
        ['widget-clock-analog', 'アナログ時計', '2×2固定・端末時刻'],
        ['widget-weather-now', '現在の天気', '1×1・気温と降水確率'],
        ['widget-weather-days', '3日間の天気', '2×2・最高／最低気温'],
        ['widget-metrics-cpu', 'CPU使用率', '1×1・2秒更新'],
        ['widget-metrics-memory', 'メモリ使用率', '1×1・2秒更新'],
        ['widget-metrics-gpu', 'GPU使用率', '1×1・GPUを選択'],
        ['widget-metrics-gpu-memory', 'GPUメモリ', '1×1・GPUを選択'],
        ['widget-metrics-overview', 'PC情報', '2×2・60秒グラフ'],
      ],
    },
    {
      category: 'widget',
      title: 'マウス操作',
      glyph: 'mouse',
      note: 'スマートフォンをPCのマウスとして使う部品',
      items: [
        ['widget-wheel-vertical', '縦型ホイール', '1×1・上下スワイプでスクロール'],
        ['widget-wheel-vertical-tall', '縦型ホイール（縦2マス）', '1×2・長いストロークでスクロール'],
        ['widget-wheel-rotary', '円形ホイール', '2×2・円をなぞってスクロール'],
        ['widget-touchpad-wide', 'タッチパッド（横長）', '3×2・移動／クリック／スクロール'],
        ['widget-touchpad-tall', 'タッチパッド（縦長）', '2×3・移動／クリック／スクロール'],
      ],
    },
    {
      category: 'widget',
      title: 'キーボード操作',
      glyph: 'keyboard',
      note: 'スマートフォンをWindowsのテンキーとして使う部品',
      items: [
        ['widget-keypad', 'テンキー', '4×4・フェーダーと重ならない4×4の空きが必要'],
        ['widget-keypad-tall', 'テンキー（縦長）', '4×5・PCキーボードの配置・フェーダーと重ならない4×5の空きが必要'],
      ],
    },
    {
      category: 'common',
      title: 'よく使う操作',
      note: '多くのアプリで共通のショートカット',
      items: [
        ['common-copy', 'コピー', 'Ctrl + C'],
        ['common-paste', '貼り付け', 'Ctrl + V'],
        ['common-cut', '切り取り', 'Ctrl + X'],
        ['common-undo', '取り消し', 'Ctrl + Z'],
        ['common-redo', 'やり直し', 'Ctrl + Y'],
        ['common-save', '保存', 'Ctrl + S'],
        ['common-selectall', 'すべて選択', 'Ctrl + A'],
        ['common-find', '検索', 'Ctrl + F'],
        ['common-open', 'ファイルを開く', 'Ctrl + O'],
        ['common-new', '新規作成', 'Ctrl + N'],
      ],
    },
    {
      category: 'discord',
      title: 'Discord',
      note: 'Discordデスクトップ版のキー割り当て',
      items: [
        ['discord-soundboard-overlay', 'サウンドボードを開く', 'ゲームオーバーレイ / Ctrl + `'],
        ['discord-mute', 'マイク ミュート切替', 'Ctrl + Shift + M'],
        ['discord-deafen', 'スピーカー ミュート切替', 'Ctrl + Shift + D'],
        ['discord-voice', '通話チャンネルへ移動', 'Ctrl + Alt + A'],
        ['discord-search', 'DM・チャンネル検索', 'Ctrl + K'],
        ['discord-emoji', '絵文字を開く', 'Ctrl + E'],
        ['discord-members', 'メンバー一覧', 'Ctrl + U'],
        ['discord-pins', 'ピン留め一覧', 'Ctrl + P'],
        ['discord-mentions', 'メンション一覧', 'Ctrl + I'],
      ],
    },
    {
      category: 'windows',
      title: 'Windows',
      note: 'Windows 10・11のシステム操作',
      items: [
        ['windows-desktop', 'デスクトップ表示', 'Win + D'],
        ['windows-explorer', 'エクスプローラー', 'Win + E'],
        ['windows-settings', 'Windows設定', 'Win + I'],
        ['windows-search', '検索', 'Win + S'],
        ['windows-clipboard', 'クリップボード履歴', 'Win + V'],
        ['windows-screenshot', '画面切り取り', 'Win + Shift + S'],
        ['windows-printscreen', 'Print Screen', 'PrtSc'],
        ['windows-taskview', 'タスクビュー', 'Win + Tab'],
        ['windows-alttab', 'アプリを切り替える', 'Alt + Tab'],
        ['windows-maximize', 'ウィンドウ最大化', 'Win + ↑'],
        ['windows-minimize', 'ウィンドウ最小化', 'Win + ↓'],
        ['windows-snapleft', '左半分に配置', 'Win + ←'],
        ['windows-snapright', '右半分に配置', 'Win + →'],
        ['windows-quicklink', 'クイックリンク', 'Win + X'],
        ['windows-lock', '画面をロック', 'Win + L'],
        ['windows-run', 'ファイル名を指定して実行', 'Win + R'],
        ['windows-taskmanager', 'タスクマネージャー', 'Ctrl + Shift + Esc'],
        ['windows-close', 'ウィンドウを閉じる', 'Alt + F4'],
        ['windows-emoji', '絵文字・記号', 'Win + .'],
        ['windows-quicksettings', 'クイック設定', 'Win + A'],
        ['windows-project', '画面出力を切替', 'Win + P'],
      ],
    },
    {
      category: 'music',
      title: '音楽・メディア',
      note: 'Spotify・YouTube・音楽プレイヤー共通',
      items: [
        ['media-playpause', '再生／一時停止', 'メディアキー'],
        ['media-previous', '前の曲', 'メディアキー'],
        ['media-next', '次の曲', 'メディアキー'],
        ['media-stop', '停止', 'メディアキー'],
      ],
    },
    {
      category: 'browser',
      title: 'ブラウザ',
      note: '現在操作中のブラウザに送信',
      items: [
        ['browser-newtab', '新しいタブ', 'Ctrl + T'],
        ['browser-closetab', 'タブを閉じる', 'Ctrl + W'],
        ['browser-refresh', '再読み込み', 'Ctrl + R'],
        ['browser-back', '戻る', 'Alt + ←'],
        ['browser-forward', '進む', 'Alt + →'],
        ['browser-reopen', '閉じたタブを開く', 'Ctrl + Shift + T'],
        ['browser-address', 'アドレス欄', 'Ctrl + L'],
        ['browser-fullscreen', '全画面', 'F11'],
      ],
    },
    {
      category: 'custom',
      title: 'URL・テキスト',
      note: '自分で内容を設定するボタン',
      items: [
        ['custom-url', 'URLを開く', '既定のブラウザで開く'],
        ['custom-clipboard', 'テキストをコピー', 'Windowsへワンタップコピー'],
      ],
    },
    {
      category: 'clipstudio',
      title: 'CLIP STUDIO',
      note: 'CLIP STUDIO PAINTの定番操作',
      items: [
        ['clip-new', '新規キャンバス', 'Ctrl + N'],
        ['clip-open', 'ファイルを開く', 'Ctrl + O'],
        ['clip-close', 'キャンバスを閉じる', 'Ctrl + W'],
        ['clip-save', '上書き保存', 'Ctrl + S'],
        ['clip-saveas', '別名で保存', 'Ctrl + Shift + S'],
        ['clip-undo', '取り消し', 'Ctrl + Z'],
        ['clip-redo', 'やり直し', 'Ctrl + Y'],
        ['clip-cut', '切り取り', 'Ctrl + X'],
        ['clip-copy', 'コピー', 'Ctrl + C'],
        ['clip-paste', '貼り付け', 'Ctrl + V'],
        ['clip-erase', '消去', 'Delete'],
        ['clip-transform', '拡大・縮小・回転', 'Ctrl + T'],
        ['clip-free-transform', '自由変形', 'Ctrl + Shift + T'],
        ['clip-selectall', 'すべて選択', 'Ctrl + A'],
        ['clip-deselect', '選択解除', 'Ctrl + D'],
        ['clip-reselect', '再選択', 'Ctrl + Shift + D'],
        ['clip-invert-selection', '選択範囲を反転', 'Ctrl + Shift + I'],
        ['clip-new-raster', '新規ラスターレイヤー', 'Ctrl + Shift + N'],
        ['clip-layer-folder', 'レイヤーフォルダー化', 'Ctrl + G'],
        ['clip-ungroup', 'レイヤーフォルダー解除', 'Ctrl + Shift + G'],
        ['clip-clip-below', '下のレイヤーでクリッピング', 'Ctrl + Alt + G'],
        ['clip-merge-below', '下のレイヤーと結合', 'Ctrl + E'],
        ['clip-merge-visible', '表示レイヤーを結合', 'Ctrl + Shift + E'],
        ['clip-layer-above', '上のレイヤーを選択', 'Alt + ]'],
        ['clip-layer-below', '下のレイヤーを選択', 'Alt + ['],
        ['clip-fit', 'キャンバス全体表示', 'Ctrl + 0'],
        ['clip-ruler', 'ルーラー表示切替', 'Ctrl + R'],
        ['clip-snap-ruler', 'ルーラーにスナップ', 'Ctrl + 1'],
        ['clip-snap-special', '特殊定規にスナップ', 'Ctrl + 2'],
        ['clip-snap-grid', 'グリッドにスナップ', 'Ctrl + 3'],
        ['clip-next-canvas', '次のキャンバス', 'Ctrl + Tab'],
        ['clip-prev-canvas', '前のキャンバス', 'Ctrl + Shift + Tab'],
        ['clip-palettes', 'パレット表示切替', 'Tab'],
        ['clip-hide-ui', 'タイトル・メニュー切替', 'Shift + Tab'],
        ['clip-zoom-tool', 'ズーム', '/'],
        ['clip-hand', '手のひら', 'H'],
        ['clip-rotate', '回転', 'R'],
        ['clip-object', 'オブジェクト', 'O'],
        ['clip-select-layer', 'レイヤー選択', 'D'],
        ['clip-move-layer', 'レイヤー移動', 'K'],
        ['clip-selection', '選択範囲', 'M'],
        ['clip-auto-select', '自動選択', 'W'],
        ['clip-eyedropper', 'スポイト', 'I'],
        ['clip-pen', 'ペン・鉛筆', 'P'],
        ['clip-brush', 'ブラシ・エアブラシ', 'B'],
        ['clip-eraser', '消しゴム', 'E'],
        ['clip-blend', '色混ぜ・ゆがみ', 'J'],
        ['clip-fill', '塗りつぶし・グラデーション', 'G'],
        ['clip-figure', '図形・定規', 'U'],
        ['clip-text', 'テキスト・フキダシ', 'T'],
        ['clip-correct-line', '線修正・ゴミ取り', 'Y'],
      ],
    },
  ];

  var presetGroups = [
    {
      title: '音声機器・周辺機器',
      className: 'media',
      items: [
        ['headphones', '∩', 'ヘッドホン'],
        ['headset', '∩', 'ヘッドセット'],
        ['earbuds', '♬', 'イヤホン'],
        ['soundbar', '▰', 'サウンドバー'],
        ['usb-mic', '♩', 'USBマイク'],
        ['studio-mic', '♩', 'スタジオマイク'],
        ['audio-output', '↗', '音声出力'],
        ['audio-input', '↙', '音声入力'],
        ['equalizer', '☷', 'イコライザー'],
        ['gamepad', '✚', 'ゲームパッド'],
        ['laptop', '▱', 'ノートPC'],
        ['timer', '◷', 'タイマー'],
        ['calendar', '▦', 'カレンダー'],
        ['monitor', '▣', 'モニター'],
        ['recording', '●', '録音'],
        ['radio', '▤', 'ラジオ'],
      ],
    },
    {
      title: '基本',
      className: 'basic',
      items: [
        ['star', '★', 'スター'],
        ['heart', '♥', 'ハート'],
        ['bolt', 'ϟ', '稲妻'],
        ['check', '✓', 'チェック'],
        ['close', '×', '閉じる'],
        ['plus', '＋', '追加'],
        ['minus', '−', '削減'],
        ['home', '⌂', 'ホーム'],
        ['settings', '⚙', '設定'],
        ['power', '⏻', '電源'],
        ['lock', '▣', 'ロック'],
        ['unlock', '□', 'ロック解除'],
        ['search', '⌕', '検索'],
        ['bell', '♢', '通知'],
        ['info', 'i', '情報'],
        ['help', '?', 'ヘルプ'],
      ],
    },
    {
      title: '音楽・音声',
      className: 'media',
      items: [
        ['play', '▶', '再生'],
        ['pause', 'Ⅱ', '一時停止'],
        ['stop', '■', '停止'],
        ['previous', '◀|', '前へ'],
        ['next', '|▶', '次へ'],
        ['record', '●', '録音'],
        ['music', '♪', '音楽'],
        ['speaker', '◖', 'スピーカー'],
        ['mute', '⊘', 'ミュート'],
        ['microphone', '♩', 'マイク'],
        ['camera', '▣', 'カメラ'],
        ['video', '▷', '動画'],
      ],
    },
    {
      title: '通信・ネットワーク',
      className: 'communication',
      items: [
        ['chat', '●●', 'チャット'],
        ['mail', '✉', 'メール'],
        ['phone', '☎', '電話'],
        ['users', '♟♟', '複数ユーザー'],
        ['person', '♟', 'ユーザー'],
        ['share', '↗', '共有'],
        ['link', '∞', 'リンク'],
        ['upload', '⇧', 'アップロード'],
        ['download', '⇩', 'ダウンロード'],
        ['wifi', '⌁', 'Wi-Fi'],
        ['bluetooth', 'ᛒ', 'Bluetooth'],
        ['globe', '◎', 'ブラウザ'],
      ],
    },
    {
      title: 'PC・ファイル',
      className: 'computer',
      items: [
        ['windows', '⊞', 'Windows'],
        ['desktop', '▰', 'デスクトップ'],
        ['folder', '▱', 'フォルダー'],
        ['file', '▤', 'ファイル'],
        ['save', '▣', '保存'],
        ['keyboard', '⌨', 'キーボード'],
        ['mouse', '◉', 'マウス'],
        ['print', '▥', '印刷'],
        ['screenshot', '▧', 'スクリーンショット'],
        ['trash', '⌫', 'ごみ箱'],
        ['copy', '▣▣', 'コピー'],
        ['paste', '▥', '貼り付け'],
      ],
    },
    {
      title: '制作・編集',
      className: 'creative',
      items: [
        ['brush', '╱', 'ブラシ'],
        ['pen', '✒', 'ペン'],
        ['pencil', '✎', '鉛筆'],
        ['eraser', '▰', '消しゴム'],
        ['palette', '◒', 'パレット'],
        ['image', '▧', '画像'],
        ['layers', '▱', 'レイヤー'],
        ['eye', '◉', '表示'],
        ['eyedropper', '◇', 'スポイト'],
        ['zoom-in', '⊕', '拡大'],
        ['zoom-out', '⊖', '縮小'],
        ['rotate', '↻', '回転'],
      ],
    },
    {
      title: '方向・表示',
      className: 'navigation',
      items: [
        ['arrow-up', '↑', '上'],
        ['arrow-down', '↓', '下'],
        ['arrow-left', '←', '左'],
        ['arrow-right', '→', '右'],
        ['back', '↶', '戻る'],
        ['forward', '↷', '進む'],
        ['refresh', '⟳', '更新'],
        ['menu', '☰', 'メニュー'],
        ['grid', '▦', 'グリッド'],
        ['list', '☷', '一覧'],
        ['fullscreen', '⛶', '全画面'],
        ['target', '◎', 'ターゲット'],
      ],
    },
  ];
  var presetMap = {};
  presetGroups.forEach(function (group) {
    group.items.forEach(function (item) {
      presetMap[item[0]] = { glyph: item[1], name: item[2], className: group.className };
    });
  });
  var presetPaths = {
    'headphones':
      '<path d="M8 28v-7a16 16 0 0 1 32 0v7"/><rect x="6" y="24" width="9" height="16" rx="4"/><rect x="33" y="24" width="9" height="16" rx="4"/>',
    'headset':
      '<path d="M8 28v-7a16 16 0 0 1 32 0v11q0 10-14 10"/><rect x="6" y="24" width="9" height="12" rx="3"/><rect x="33" y="24" width="9" height="12" rx="3"/><path d="M21 42h7"/>',
    'earbuds':
      '<path d="M16 21v17m16-17v17M16 12h-3m19 0h3"/><rect x="6" y="6" width="14" height="18" rx="7"/><rect x="28" y="6" width="14" height="18" rx="7"/>',
    'soundbar':
      '<rect x="4" y="16" width="40" height="17" rx="5"/><circle cx="13" cy="24.5" r="4"/><circle cx="35" cy="24.5" r="4"/><path d="M22 24h4"/>',
    'usb-mic':
      '<rect x="17" y="4" width="14" height="25" rx="7"/><path d="M11 22a13 13 0 0 0 26 0M24 35v7h12m-7-26H19m0-5h10"/>',
    'studio-mic':
      '<rect x="15" y="4" width="18" height="24" rx="5"/><path d="M10 18v8a14 14 0 0 0 28 0v-8M24 40v4m-9 0h18M20 11h8m-8 6h8"/>',
    'audio-output': '<path d="M6 20h8l10-9v26l-10-9H6zM30 24h13m-5-5 5 5-5 5"/>',
    'audio-input':
      '<rect x="9" y="6" width="12" height="24" rx="6"/><path d="M4 25a11 11 0 0 0 22 0M15 36v7m-6 0h12M44 17H29m5-5-5 5 5 5"/>',
    'equalizer':
      '<path d="M10 6v36M24 6v36M38 6v36"/><rect x="6" y="14" width="8" height="8" rx="2"/><rect x="20" y="28" width="8" height="8" rx="2"/><rect x="34" y="10" width="8" height="8" rx="2"/>',
    'gamepad':
      '<path d="M15 14h18q7 0 9 9l2 12q0 8-7 3l-7-6H18l-7 6q-7 5-7-3l2-12q2-9 9-9zM14 20v10m-5-5h10M33 21h1m3 7h1"/>',
    'laptop': '<rect x="9" y="7" width="30" height="25" rx="2"/><path d="m9 32-6 8h42l-6-8M20 36h8"/>',
    'timer': '<circle cx="24" cy="27" r="16"/><path d="M19 4h10M24 4v7m0 6v11l7 4M36 13l4-4"/>',
    'calendar':
      '<rect x="6" y="10" width="36" height="32" rx="3"/><path d="M15 5v10m18-10v10M6 20h36m-27 8h3m9 0h3m-15 7h3m9 0h3"/>',
    'monitor': '<rect x="5" y="7" width="38" height="27" rx="3"/><path d="M24 34v8m-10 0h20"/>',
    'recording': '<circle cx="24" cy="24" r="18"/><circle cx="24" cy="24" r="8" fill="currentColor"/>',
    'radio':
      '<rect x="5" y="15" width="38" height="27" rx="3"/><path d="m12 15 24-10M29 23h7m-7 7h7"/><circle cx="16" cy="29" r="7"/>',
  };
  var iconColors = [
    ['', '標準'],
    ['#3569c8', '青'],
    ['#00827d', '青緑'],
    ['#287d43', '緑'],
    ['#a65b00', 'オレンジ'],
    ['#b53846', '赤'],
    ['#a63783', 'ピンク'],
    ['#714bc4', '紫'],
    ['#4d5665', 'グレー'],
    ['#15181e', '黒'],
  ];
  function renderIconColors() {
    var root = $('icon-colors');
    root.textContent = '';
    iconColors.forEach(function (color) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'icon-color';
      b.title = color[1];
      b.setAttribute('aria-label', color[1]);
      b.setAttribute('aria-pressed', String(iconPickerColor === color[0]));
      b.style.background = color[0] || 'linear-gradient(135deg,#3569c8,#a63783)';
      b.textContent = color[0] === iconPickerColor ? '✓' : '';
      b.onclick = function () {
        iconPickerColor = color[0];
        renderIconColors();
        Array.prototype.forEach.call(
          $('icon-preset-groups').querySelectorAll('.icon-choice[data-icon-key]'),
          function (choice) {
            if (choice.dataset.iconKey)
              choice.replaceChild(presetIconNode(choice.dataset.iconKey, color[0]), choice.firstChild);
          },
        );
      };
      root.appendChild(b);
    });
  }

  function addAudioEditor(target, index) {
    if (
      rows.filter(function (r) {
        return r.orientation === previewOrientation;
      }).length >= 40
    ) {
      message('ボタンはこの向きで40個以内です。');
      return;
    }
    var fields = editor(
      {
        name: target === 'mic' ? '入力先を切替' : '出力先を切替',
        type: 'audioDevice',
        category: 'audio',
        deviceTarget: target,
        iconKey: target === 'mic' ? 'audio-input' : 'audio-output',
      },
      typeof index === 'number' ? Math.min(index, rows.length) : Math.min(rows.length, (page + 1) * appsPerPage),
    );
    fields.box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    loadAudioDevices();
    message('機器を選び、表示名を確認して「設定を保存」を押してください。');
    return fields;
  }
  function buildDeviceSelector(fields, box) {
    var label = document.createElement('label');
    label.textContent = fields.deviceTarget === 'mic' ? '切り替える入力機器' : '切り替える出力機器';
    var select = document.createElement('select');
    select.className = 'audio-device-select';
    var option = document.createElement('option');
    option.value = fields.deviceId.value;
    option.textContent = fields.deviceName || '機器を選んでください';
    select.appendChild(option);
    select.value = fields.deviceId.value;
    fields.deviceId = select;
    label.appendChild(select);
    box.appendChild(label);
    var reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'subtle';
    reload.textContent = '機器一覧を更新';
    reload.onclick = loadAudioDevices;
    box.appendChild(reload);
    var note = document.createElement('p');
    note.textContent = 'Windowsの既定の機器（通話用を含む）を切り替えます。アプリ内で個別指定した機器は変わりません。';
    box.appendChild(note);
    select.onchange = function () {
      var device = (audioState.devices || []).filter(function (d) {
        return d.id === select.value && d.target === fields.deviceTarget;
      })[0];
      if (device) {
        fields.deviceName = device.name;
        if (fields.name.value === '出力先を切替' || fields.name.value === '入力先を切替') {
          fields.name.value = device.name.slice(0, 80);
          fields.name.oninput();
        }
      }
    };
    fillDeviceSelector(fields);
  }
  function fillDeviceSelector(fields) {
    var select = fields.deviceId,
      selected = select.value;
    if (!Array.isArray(audioState.devices)) return;
    select.textContent = '';
    var blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '機器を選んでください';
    select.appendChild(blank);
    var devices = audioState.devices.filter(function (d) {
      return d.target === fields.deviceTarget;
    });
    devices.forEach(function (device) {
      var option = document.createElement('option');
      option.value = device.id;
      option.textContent =
        device.name + (device.available ? '' : '（未接続・無効）') + (device.selected ? '［使用中］' : '');
      select.appendChild(option);
    });
    if (
      selected &&
      !devices.some(function (d) {
        return d.id === selected;
      })
    ) {
      var missing = document.createElement('option');
      missing.value = selected;
      missing.textContent = (fields.deviceName || '登録済み機器') + '（見つかりません）';
      select.appendChild(missing);
    }
    select.value = selected;
  }
  function refreshDeviceSelectors() {
    rows.forEach(function (r) {
      if (r.type === 'audioDevice') fillDeviceSelector(r);
    });
  }
  function loadAudioDevices() {
    return api('devices')
      .then(function (s) {
        audioState.devices = s.devices;
        refreshDeviceSelectors();
        renderPreview();
        message('機器一覧を更新しました。');
      })
      .catch(function (e) {
        message('機器一覧を取得できませんでした。 ' + e.message);
      });
  }

  function presetIconNode(key, color) {
    var preset = presetMap[key],
      s = document.createElement('span');
    s.className = 'preset-icon ' + (preset ? 'preset-' + preset.className : 'preset-basic');
    s.textContent = preset ? preset.glyph : '?';
    s.title = preset ? preset.name : 'アイコン';
    if (presetPaths[key])
      s.innerHTML =
        '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        presetPaths[key] +
        '</svg>';
    if (/^#[0-9a-f]{6}$/i.test(color || '')) s.style.background = color;
    return s;
  }
  function defaultIconForAction(action, category) {
    if (action.indexOf('media-play') === 0) return 'play';
    if (action.indexOf('media-previous') === 0) return 'previous';
    if (action.indexOf('media-next') === 0) return 'next';
    if (action.indexOf('media-stop') === 0) return 'stop';
    if (action.indexOf('mic') >= 0) return 'microphone';
    if (action.indexOf('speaker') >= 0) return action.indexOf('mute') >= 0 ? 'mute' : 'speaker';
    if (action.indexOf('screenshot') >= 0 || action.indexOf('printscreen') >= 0) return 'screenshot';
    if (action.indexOf('copy') >= 0) return 'copy';
    if (action.indexOf('paste') >= 0) return 'paste';
    if (action.indexOf('save') >= 0) return 'save';
    if (action.indexOf('undo') >= 0 || action.indexOf('back') >= 0) return 'back';
    if (action.indexOf('redo') >= 0 || action.indexOf('forward') >= 0) return 'forward';
    if (action.indexOf('search') >= 0 || action.indexOf('find') >= 0) return 'search';
    if (action.indexOf('brush') >= 0) return 'brush';
    if (action.indexOf('pen') >= 0) return 'pen';
    if (action.indexOf('pencil') >= 0) return 'pencil';
    if (action.indexOf('eraser') >= 0) return 'eraser';
    if (action.indexOf('layer') >= 0) return 'layers';
    if (action.indexOf('zoom') >= 0) return action.indexOf('out') >= 0 ? 'zoom-out' : 'zoom-in';
    if (action.indexOf('rotate') >= 0) return 'rotate';
    if (category === 'discord') return 'chat';
    if (category === 'windows') return 'windows';
    if (category === 'browser') return 'globe';
    if (category === 'clipstudio') return 'palette';
    if (category === 'common') return 'star';
    return '';
  }

  function message(t, persistent) {
    var node = $('message');
    clearTimeout(messageTimer);
    node.classList.remove('message-hiding');
    node.textContent = t || '';
    if (!t || persistent) return;
    var isError = /失敗|できません|エラー|正しく|範囲外|見つかりません|空き枠|確認してください/.test(t),
      delay = isError ? 5000 : 2000;
    messageTimer = setTimeout(function () {
      node.classList.add('message-hiding');
      messageTimer = setTimeout(function () {
        node.textContent = '';
        node.classList.remove('message-hiding');
      }, 220);
    }, delay);
  }
  function api(path, data, limit) {
    var controller = new AbortController(),
      timeout = setTimeout(function () {
        controller.abort();
      }, limit || 4000),
      hasBody = data !== undefined,
      started = Date.now();
    return fetch('/api/' + path, {
      method: hasBody ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: hasBody ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    })
      .then(function (r) {
        return r.json().then(function (x) {
          if (!r.ok) {
            if (r.status === 401 && !admin) {
              localStorage.removeItem('tapoard-key');
              localStorage.removeItem('streamdeck-key');
              key = '';
              $('controls').hidden = true;
              $('pair').hidden = false;
              $('offline').hidden = true;
            }
            throw new Error(x.error || '操作に失敗しました');
          }
          if (pcWindow && (path === 'action' || path === 'input')) pcStats.action = Date.now() - started;
          return x;
        });
      })
      .finally(function () {
        clearTimeout(timeout);
      });
  }
  function release() {
    if (lock) {
      lock.release().catch(function () {});
      lock = null;
    }
    if (noSleep) {
      try {
        noSleep.disable();
      } catch (e) {}
      noSleep = null;
    }
  }
  function fallbackWake() {
    if (
      pcWindow ||
      !$('awake').checked ||
      !key ||
      document.hidden ||
      (navigator.wakeLock && window.isSecureContext) ||
      !window.NoSleep
    )
      return;
    if (!noSleep) noSleep = new NoSleep();
    var result = noSleep.enable();
    if (result && result.catch) result.catch(function () {});
  }
  function wake() {
    if (pcWindow) return;
    if (!$('awake').checked || !connected || document.hidden) return;
    if (navigator.wakeLock && window.isSecureContext)
      navigator.wakeLock
        .request('screen')
        .then(function (x) {
          lock = x;
        })
        .catch(function () {
          fallbackWake();
        });
    else fallbackWake();
  }

  var widgetGlyphs = {
    // Line drawings in currentColor, so each widget group gets its own recognizable mark.
    mouse: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v6M6 10h12"/></svg>',
    keyboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M6 13.5h1M17 13.5h1M9 14.5h6"/></svg>',
  };
  function shortcutGlyph(category, glyph) {
    var s = document.createElement('span');
    s.className = 'shortcut-icon ' + (category || 'app') + (glyph ? ' glyph-' + glyph : '');
    if (widgetGlyphs[glyph]) {
      s.innerHTML = widgetGlyphs[glyph];
      return s;
    }
    s.textContent =
      category === 'audio'
        ? '◖'
        : category === 'common'
          ? '★'
          : category === 'discord'
            ? 'D'
            : category === 'windows'
              ? '⊞'
              : category === 'music'
                ? '♪'
                : category === 'browser'
                  ? '◎'
                  : category === 'widget'
                    ? '◷'
                  : category === 'custom'
                    ? '✦'
                    : category === 'clipstudio'
                      ? 'C'
                      : '•';
    return s;
  }
  function iconNode(a) {
    if (a.customIcon) {
      var custom = document.createElement('img');
      custom.src = a.customIcon;
      custom.alt = '';
      custom.className = 'app-icon custom-app-icon';
      return custom;
    }
    if (a.iconKey && presetMap[a.iconKey]) return presetIconNode(a.iconKey, a.iconColor);
    if (a.icon) {
      var img = document.createElement('img');
      img.src = a.icon;
      img.alt = '';
      img.className = 'app-icon';
      return img;
    }
    if (a.type === 'hotkey') return shortcutGlyph(a.category);
    var fallback = document.createElement('span');
    fallback.className = 'icon-fallback';
    fallback.textContent = (a.name || '?').slice(0, 1).toUpperCase();
    return fallback;
  }
  var speakerIcon =
    '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 19h8l10-8v26l-10-8H8z"/><path d="M33 18c3 3 3 9 0 12m5-17c6 6 6 16 0 22"/></svg>';
  var micIcon =
    '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="17" y="6" width="14" height="25" rx="7"/><path d="M11 24a13 13 0 0 0 26 0M24 37v6m-7 0h14"/></svg>';
  function setFaderVisual(track, value) {
    value = Math.max(0, Math.min(100, value));
    if (track.classList.contains('horizontal-track')) {
      track.querySelector('.fader-level').style.width = value + '%';
      track.querySelector('.fader-thumb').style.left = 'calc(' + value + '% - 5px)';
    } else {
      track.querySelector('.fader-level').style.height = value + '%';
      track.querySelector('.fader-thumb').style.bottom = 'calc(' + value + '% - 5px)';
    }
    track.setAttribute('aria-valuenow', value);
  }
  function mergeAudioTarget(target, next) {
    if (!next) return;
    var prefix = target === 'mic' ? 'mic' : 'speaker';
    ['Volume', 'Muted', 'Available'].forEach(function (suffix) {
      var name = prefix + suffix;
      if (Object.prototype.hasOwnProperty.call(next, name)) audioState[name] = next[name];
    });
    if (next.devices) audioState.devices = next.devices;
  }
  function sendAudio(target, payload) {
    payload.target = target;
    return api('audio', payload)
      .then(function (s) {
        mergeAudioTarget(target, s.audio);
        deckRevision = s.revision || deckRevision;
        if (!audioInteraction) {
          if (admin) renderPreview();
          else renderDeck();
        }
        message((target === 'mic' ? 'マイク' : 'スピーカー') + 'を変更しました。');
      })
      .catch(function (e) {
        message(e.message);
        refresh();
      });
  }
  function audioFader(target, preview, slotIndex) {
    var isMic = target === 'mic',
      prefix = isMic ? 'mic' : 'speaker',
      value = audioState[prefix + 'Volume'],
      muted = audioState[prefix + 'Muted'],
      available = audioState[prefix + 'Available'] !== false;
    var tile = document.createElement('div');
    tile.className = 'deck-key audio-fader' + (muted ? ' muted' : '') + (!available ? ' unavailable' : '');
    var mute = document.createElement(preview ? 'div' : 'button');
    mute.className = 'audio-mute';
    mute.innerHTML = isMic ? micIcon : speakerIcon;
    mute.title = (isMic ? 'マイク' : 'スピーカー') + 'のミュート切替';
    mute.setAttribute('aria-label', mute.title);
    if (!preview) {
      mute.type = 'button';
      mute.disabled = !available;
      mute.onclick = function () {
        sendAudio(target, { toggleMute: true });
      };
    }
    tile.appendChild(mute);
    var track = document.createElement('div');
    track.className = 'fader-track';
    track.setAttribute('role', 'slider');
    track.setAttribute('aria-label', (isMic ? 'マイク' : 'スピーカー') + '音量');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    var level = document.createElement('span');
    level.className = 'fader-level';
    var thumb = document.createElement('span');
    thumb.className = 'fader-thumb';
    track.appendChild(level);
    track.appendChild(thumb);
    setFaderVisual(track, value);
    tile.appendChild(track);
    var label = document.createElement('span');
    label.className = 'fader-value';
    label.textContent = value + '%';
    tile.appendChild(label);
    if (preview) {
      tile.title = (isMic ? 'マイク' : 'スピーカー') + 'の位置を変更';
      tile.oncontextmenu = function (e) {
        openAudioContextMenu(e, target, slotIndex);
      };
    } else if (available) {
      var tracking = false,
        moved = false,
        startY = 0,
        startValue = value,
        current = value,
        pending = null,
        inFlight = false,
        sendTimer = null,
        lastSent = 0,
        finishing = false;
      function finish() {
        if (!finishing || inFlight || pending !== null) return;
        finishing = false;
        audioInteraction = false;
        message((isMic ? 'マイク' : 'スピーカー') + '音量を変更しました。');
        refresh();
      }
      function pump(force) {
        if (inFlight || pending === null) return;
        var wait = force ? 0 : Math.max(0, 80 - (Date.now() - lastSent));
        if (wait) {
          clearTimeout(sendTimer);
          sendTimer = setTimeout(function () {
            pump(false);
          }, wait);
          return;
        }
        var sent = pending;
        pending = null;
        inFlight = true;
        lastSent = Date.now();
        api('audio', { target: target, volume: sent })
          .then(function (s) {
            audioState = s.audio || audioState;
            deckRevision = s.revision || deckRevision;
          })
          .catch(function (e) {
            message(e.message);
          })
          .finally(function () {
            inFlight = false;
            if (pending !== null) pump(finishing);
            else finish();
          });
      }
      function queue(finalValue) {
        pending = current;
        if (finalValue) {
          finishing = true;
          clearTimeout(sendTimer);
        }
        pump(finalValue);
      }
      function update(e) {
        var distance = (startY - e.clientY) / Math.max(40, tile.getBoundingClientRect().height);
        current = Math.round(Math.max(0, Math.min(100, startValue + distance * 100)));
        if (Math.abs(e.clientY - startY) > 3) moved = true;
        setFaderVisual(track, current);
        label.textContent = current + '%';
        tile.classList.toggle('adjusting', moved);
        if (moved) queue(false);
        e.preventDefault();
      }
      function end(e) {
        if (!tracking) return;
        if (e) update(e);
        tracking = false;
        tile.classList.remove('adjusting');
        if (moved) queue(true);
        else {
          audioInteraction = false;
          finishing = false;
        }
      }
      tile.addEventListener('pointerdown', function (e) {
        if (e.target.closest && e.target.closest('.audio-mute')) return;
        tracking = true;
        moved = false;
        audioInteraction = true;
        startY = e.clientY;
        startValue = current;
        tile.setPointerCapture(e.pointerId);
      });
      tile.addEventListener('pointermove', function (e) {
        if (tracking) update(e);
      });
      tile.addEventListener('pointerup', end);
      tile.addEventListener('pointercancel', function (e) {
        end(e);
      });
    }
    return tile;
  }
  function audioFaderV104(target, preview, slotIndex) {
    var isMic = target === 'mic',
      prefix = isMic ? 'mic' : 'speaker',
      value = audioState[prefix + 'Volume'],
      muted = audioState[prefix + 'Muted'],
      available = audioState[prefix + 'Available'] !== false,
      control = controlRect(target, currentOrientation(preview)),
      horizontal = control.width > control.height;
    var tile = document.createElement('div');
    tile.className =
      'deck-key audio-fader' + (horizontal ? ' horizontal' : '') + (horizontal && control.height > 1 ? ' tall' : '') + (muted ? ' muted' : '') + (!available ? ' unavailable' : '');
    var mute = document.createElement(preview ? 'div' : 'button');
    mute.className = 'audio-mute';
    mute.innerHTML = isMic ? micIcon : speakerIcon;
    mute.title = (isMic ? 'マイク' : 'スピーカー') + 'のミュート切替';
    mute.setAttribute('aria-label', mute.title);
    if (!preview) {
      mute.type = 'button';
      mute.disabled = !available;
      mute.onclick = function () {
        sendAudio(target, { toggleMute: true });
      };
    }
    tile.appendChild(mute);
    function stepButton(delta, text) {
      var button = document.createElement(preview ? 'span' : 'button');
      button.className = 'fader-step';
      button.textContent = text;
      button.setAttribute('aria-label', (isMic ? 'マイク' : 'スピーカー') + '音量を' + (delta > 0 ? '上げる' : '下げる'));
      if (!preview) {
        button.type = 'button';
        button.disabled = !available;
        button.onclick = function (e) {
          e.stopPropagation();
          sendAudio(target, { delta: delta });
        };
      }
      return button;
    }
    if (horizontal) tile.appendChild(stepButton(-5, '−'));
    var track = document.createElement('div');
    track.className = 'fader-track' + (horizontal ? ' horizontal-track' : '');
    track.setAttribute('role', 'slider');
    track.setAttribute('aria-label', (isMic ? 'マイク' : 'スピーカー') + '音量');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    var level = document.createElement('span');
    level.className = 'fader-level';
    var thumb = document.createElement('span');
    thumb.className = 'fader-thumb';
    track.appendChild(level);
    track.appendChild(thumb);
    setFaderVisual(track, value);
    tile.appendChild(track);
    if (horizontal) tile.appendChild(stepButton(5, '＋'));
    var label = document.createElement('span');
    label.className = 'fader-value';
    label.textContent = value + '%';
    tile.appendChild(label);
    if (preview) {
      tile.title = (isMic ? 'マイク' : 'スピーカー') + 'の位置を変更';
      tile.oncontextmenu = function (e) {
        openAudioContextMenu(e, target, slotIndex);
      };
      return tile;
    }
    if (!available) return tile;
    var tracking = false,
      moved = false,
      startPoint = 0,
      current = value,
      pending = null,
      inFlight = false,
      sendTimer = null,
      lastSent = 0,
      finishing = false;
    function point(e) {
      var list =
        e && e.touches && e.touches.length
          ? e.touches
          : e && e.changedTouches && e.changedTouches.length
            ? e.changedTouches
            : null;
      var source = list ? list[0] : e;
      if (!source) return null;
      return horizontal
        ? typeof source.clientX === 'number' ? source.clientX : null
        : typeof source.clientY === 'number' ? source.clientY : null;
    }
    function finish() {
      if (!finishing || inFlight || pending !== null) return;
      finishing = false;
      audioInteraction = false;
      message((isMic ? 'マイク' : 'スピーカー') + '音量を変更しました。');
      renderDeck();
    }
    function completeRequest() {
      inFlight = false;
      if (pending !== null) pump(finishing);
      else finish();
    }
    function pump(force) {
      if (inFlight || pending === null) return;
      var wait = force ? 0 : Math.max(0, 80 - (Date.now() - lastSent));
      if (wait) {
        clearTimeout(sendTimer);
        sendTimer = setTimeout(function () {
          pump(false);
        }, wait);
        return;
      }
      var sent = pending;
      pending = null;
      inFlight = true;
      lastSent = Date.now();
      api('audio', { target: target, volume: sent, final: !!force })
        .then(
          function (s) {
            mergeAudioTarget(target, s.audio);
            deckRevision = s.revision || deckRevision;
          },
          function (e) {
            message(e.message);
          },
        )
        .then(completeRequest, completeRequest);
    }
    function queue(finalValue) {
      pending = current;
      if (finalValue) {
        finishing = true;
        clearTimeout(sendTimer);
      }
      pump(finalValue);
    }
    function updateAt(position, e) {
      if (typeof position !== 'number' || !isFinite(position)) return;
      var rect = track.getBoundingClientRect();
      if (horizontal ? !rect.width : !rect.height) return;
      current = Math.round(
        Math.max(0, Math.min(100, horizontal ? ((position - rect.left) * 100) / rect.width : ((rect.bottom - position) * 100) / rect.height)),
      );
      setFaderVisual(track, current);
      label.textContent = current + '%';
      tile.classList.toggle('adjusting', moved);
      if (moved) queue(false);
      if (e && e.cancelable) e.preventDefault();
    }
    function begin(e) {
      if (e.target && e.target.closest && e.target.closest('.audio-mute,.fader-step')) return;
      tracking = true;
      moved = false;
      audioInteraction = true;
      startPoint = point(e);
      if (e.pointerId !== undefined && tile.setPointerCapture)
        try {
          tile.setPointerCapture(e.pointerId);
        } catch (ignore) {}
      if (e.cancelable) e.preventDefault();
    }
    function move(e) {
      if (!tracking) return;
      var position = point(e);
      if (typeof position !== 'number') return;
      if (Math.abs(position - startPoint) > 3) moved = true;
      if (moved) updateAt(position, e);
    }
    function end(e) {
      if (!tracking) return;
      var position = point(e);
      if (moved && typeof position === 'number') updateAt(position, e);
      tracking = false;
      tile.classList.remove('adjusting');
      if (moved) queue(true);
      else {
        audioInteraction = false;
        finishing = false;
      }
      if (e && e.cancelable) e.preventDefault();
    }
    if (window.PointerEvent) {
      tile.addEventListener('pointerdown', begin);
      tile.addEventListener('pointermove', move);
      tile.addEventListener('pointerup', end);
      tile.addEventListener('pointercancel', end);
    } else {
      tile.addEventListener('touchstart', begin, { passive: false });
      tile.addEventListener('touchmove', move, { passive: false });
      tile.addEventListener('touchend', end, { passive: false });
      tile.addEventListener('touchcancel', end, { passive: false });
    }
    return tile;
  }
  audioFader = audioFaderV104;

  function clockOptions(a) {
    var source = (a && a.options) || {};
    return {
      style: source.style === 'analog' ? 'analog' : 'digital',
      showSeconds: source.showSeconds !== false,
      showDate: source.showDate !== false,
      showWeekday: source.showWeekday !== false,
      hour12: source.hour12 === true,
    };
  }
  function twoDigits(value) {
    return value < 10 ? '0' + value : String(value);
  }
  function updateClockTile(tile, now) {
    var options = tile._clockOptions || clockOptions(null),
      hours = now.getHours(),
      minutes = now.getMinutes(),
      seconds = now.getSeconds();
    if (options.style === 'analog') {
      tile.querySelector('.clock-hour').style.transform = 'translateX(-50%) rotate(' + ((hours % 12) * 30 + minutes / 2) + 'deg)';
      tile.querySelector('.clock-minute').style.transform = 'translateX(-50%) rotate(' + (minutes * 6 + seconds / 10) + 'deg)';
      var secondHand = tile.querySelector('.clock-second');
      if (secondHand) secondHand.style.transform = 'translateX(-50%) rotate(' + seconds * 6 + 'deg)';
    } else {
      var suffix = '';
      if (options.hour12) {
        suffix = hours < 12 ? ' AM' : ' PM';
        hours %= 12;
        if (!hours) hours = 12;
      }
      tile.querySelector('.clock-time').textContent =
        twoDigits(hours) + ':' + twoDigits(minutes) + (options.showSeconds ? ':' + twoDigits(seconds) : '') + suffix;
      var date = tile.querySelector('.clock-date');
      if (date) {
        var parts = [];
        if (options.showDate) parts.push(now.getFullYear() + '/' + twoDigits(now.getMonth() + 1) + '/' + twoDigits(now.getDate()));
        if (options.showWeekday) parts.push(['日', '月', '火', '水', '木', '金', '土'][now.getDay()] + '曜日');
        date.textContent = parts.join(' ');
      }
    }
    tile.setAttribute('aria-label', tile.title + ' ' + twoDigits(hours) + ':' + twoDigits(minutes));
  }
  function stopClockUpdates() {
    if (clockTimer !== null) clearTimeout(clockTimer);
    clockTimer = null;
  }
  function scheduleClockUpdates() {
    stopClockUpdates();
    if (document.hidden) return;
    var clocks = Array.prototype.slice.call(document.querySelectorAll('.clock-widget'));
    if (!clocks.length) return;
    var now = new Date(),
      showSeconds = false;
    clocks.forEach(function (tile) {
      updateClockTile(tile, now);
      if (tile._clockOptions && tile._clockOptions.showSeconds) showSeconds = true;
    });
    var delay = showSeconds ? 1000 - now.getMilliseconds() + 10 : (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 10;
    clockTimer = setTimeout(scheduleClockUpdates, Math.max(50, delay));
  }
  function clockTile(a, preview, index, slotIndex) {
    var options = clockOptions(a),
      tile = document.createElement('div');
    tile.className = 'deck-key clock-widget clock-' + options.style;
    if (options.hour12) tile.classList.add('clock-12h');
    if (!options.showSeconds) tile.classList.add('clock-no-seconds');
    if ((a.height || a.size || 2) === 1) tile.classList.add('clock-wide');
    tile.title = a.name || (options.style === 'analog' ? 'アナログ時計' : 'デジタル時計');
    tile._clockOptions = options;
    tile.dataset.appIndex = index;
    tile.dataset.size = a.size || 2;
    tile.dataset.width = a.width || a.size || 2;
    tile.dataset.height = a.height || a.size || 2;
    if (options.style === 'analog') {
      var face = document.createElement('div');
      face.className = 'clock-face';
      [12, 3, 6, 9].forEach(function (number) {
        var marker = document.createElement('span');
        marker.className = 'clock-marker clock-marker-' + number;
        marker.textContent = number;
        face.appendChild(marker);
      });
      ['hour', 'minute'].concat(options.showSeconds ? ['second'] : []).forEach(function (hand) {
        var node = document.createElement('span');
        node.className = 'clock-hand clock-' + hand;
        face.appendChild(node);
      });
      var pin = document.createElement('span');
      pin.className = 'clock-pin';
      face.appendChild(pin);
      tile.appendChild(face);
    } else {
      var time = document.createElement('span');
      time.className = 'clock-time';
      tile.appendChild(time);
      if (options.showDate || options.showWeekday) {
        var date = document.createElement('span');
        date.className = 'clock-date';
        tile.appendChild(date);
      }
    }
    updateClockTile(tile, new Date());
    if (preview) {
      tile.draggable = true;
      tile.ondragstart = function (e) {
        e.dataTransfer.setData('text/plain', 'tile:' + index);
        e.dataTransfer.effectAllowed = 'move';
      };
      addDropTarget(tile, index, slotIndex);
      tile.oncontextmenu = function (e) {
        openDeckContextMenu(e, index, a);
      };
    }
    return tile;
  }

  function metricOptions(a) {
    var source = (a && a.options) || {};
    return {
      primary: ['cpu', 'memory', 'gpu', 'gpuMemory'].indexOf(source.primary) >= 0 ? source.primary : 'cpu',
      cycle: source.cycle === true,
      gpuId: typeof source.gpuId === 'string' ? source.gpuId : '',
      gpuName: typeof source.gpuName === 'string' ? source.gpuName : '',
    };
  }
  // Windows gives a GPU a new LUID (our id) after a restart or driver update, so a saved id
  // can go stale; fall back to the saved GPU name, then to the first GPU.
  function selectedGpu(gpuId, gpuName) {
    var gpus = (Array.isArray(metricsState.gpus) ? metricsState.gpus : []).filter(Boolean);
    function first(test) { return gpus.filter(test)[0] || null; }
    return (
      (gpuId && first(function (gpu) { return gpu.id === gpuId; })) ||
      (gpuName && first(function (gpu) { return gpu.name === gpuName; })) ||
      gpus[0] ||
      null
    );
  }
  function gpuMemoryPercent(gpu) {
    return gpu && gpu.memoryAvailable && gpu.memoryTotalBytes > 0
      ? (100 * gpu.memoryUsedBytes) / gpu.memoryTotalBytes
      : null;
  }
  function metricDescriptor(primary, gpuId, gpuName) {
    if (primary === 'memory') return { label: 'メモリ', value: metricsState.memoryPercent, available: metricsState.memoryAvailable, supported: true };
    var gpu = selectedGpu(gpuId, gpuName);
    if (primary === 'gpu') return { label: 'GPU', value: gpu && gpu.utilizationPercent, available: !!(gpu && gpu.utilizationAvailable), supported: !!gpu };
    if (primary === 'gpuMemory') return { label: 'GPUメモリ', value: gpuMemoryPercent(gpu), available: !!(gpu && gpu.memoryAvailable), supported: !!gpu };
    return { label: 'CPU', value: metricsState.cpuPercent, available: metricsState.cpuAvailable, supported: metricsState.cpuSupported !== false };
  }
  function metricPercent(value, available, supported) {
    if (supported === false) return '未対応';
    return available && typeof value === 'number' && isFinite(value)
      ? Math.max(0, Math.min(100, value)).toFixed(1) + '%'
      : '更新待ち';
  }
  function bytesText(value) {
    return typeof value === 'number' && value > 0 ? (value / 1073741824).toFixed(1) + ' GB' : '—';
  }
  function metricPath(history, name) {
    var path = '',
      count = Math.max(2, history.length);
    history.forEach(function (point, index) {
      var value = point && point[name];
      if (typeof value !== 'number' || !isFinite(value)) return;
      var x = history.length < 2 ? 100 : (index * 100) / (count - 1),
        y = 100 - Math.max(0, Math.min(100, value));
      path += (path ? ' L ' : 'M ') + x.toFixed(1) + ' ' + y.toFixed(1);
    });
    return path;
  }
  function gpuMetricPath(history, gpuId, name) {
    return metricPath((history || []).map(function (point) {
      var values = point && Array.isArray(point.gpus) ? point.gpus : [],
        gpu = values.filter(function (entry) { return entry && entry.id === gpuId; })[0],
        mapped = {};
      mapped.value = gpu ? gpu[name] : null;
      return mapped;
    }), 'value');
  }
  function appendMetricRow(root, labelText, value, available, className, supported) {
    var row = document.createElement('div');
    row.className = 'metric-row ' + className;
    var label = document.createElement('span');
    label.textContent = labelText;
    var output = document.createElement('strong');
    output.textContent = metricPercent(value, available, supported);
    row.appendChild(label);
    row.appendChild(output);
    root.appendChild(row);
  }
  function renderMetricsTile(tile, a) {
    tile.textContent = '';
    var options = metricOptions(a),
      large = (a.width || a.size || 1) === 2 && (a.height || a.size || 1) === 2;
    tile.className = 'deck-key metrics-widget ' + (large ? 'metrics-large' : 'metrics-small');
    tile.classList.toggle('metrics-inactive', !metricsState.active);
    if (large) {
      var heading = document.createElement('strong');
      heading.className = 'metrics-heading';
      heading.textContent = 'PC情報';
      tile.appendChild(heading);
      appendMetricRow(tile, 'CPU', metricsState.cpuPercent, metricsState.cpuAvailable, 'metric-cpu', metricsState.cpuSupported !== false);
      appendMetricRow(tile, 'メモリ', metricsState.memoryPercent, metricsState.memoryAvailable, 'metric-memory');
      var gpu = selectedGpu(options.gpuId, options.gpuName),
        gpuLabel = gpu && gpu.name ? gpu.name : 'GPU';
      appendMetricRow(tile, 'GPU', gpu && gpu.utilizationPercent, !!(gpu && gpu.utilizationAvailable), 'metric-gpu', !!gpu);
      appendMetricRow(tile, 'GPUメモリ', gpuMemoryPercent(gpu), !!(gpu && gpu.memoryAvailable), 'metric-gpu-memory', !!gpu);
      var detail = document.createElement('span');
      detail.className = 'metrics-memory-detail';
      detail.textContent = gpu ? gpuLabel : bytesText(metricsState.memoryUsedBytes) + ' / ' + bytesText(metricsState.memoryTotalBytes);
      detail.title = gpuLabel;
      tile.appendChild(detail);
      var graph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      graph.setAttribute('class', 'metrics-graph');
      graph.setAttribute('viewBox', '0 0 100 100');
      graph.setAttribute('preserveAspectRatio', 'none');
      [['memoryPercent', 'memory-line'], ['cpuPercent', 'cpu-line']].forEach(function (definition) {
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', definition[1]);
        path.setAttribute('d', metricPath(metricsState.history || [], definition[0]));
        graph.appendChild(path);
      });
      if (gpu) [['memoryPercent', 'gpu-memory-line'], ['utilizationPercent', 'gpu-line']].forEach(function (definition) {
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', definition[1]);
        path.setAttribute('d', gpuMetricPath(metricsState.history || [], gpu.id, definition[0]));
        graph.appendChild(path);
      });
      tile.appendChild(graph);
      tile.setAttribute(
        'aria-label',
        'PC情報 CPU ' + metricPercent(metricsState.cpuPercent, metricsState.cpuAvailable, metricsState.cpuSupported !== false) + ' メモリ ' + metricPercent(metricsState.memoryPercent, metricsState.memoryAvailable) + ' GPU ' + metricPercent(gpu && gpu.utilizationPercent, !!(gpu && gpu.utilizationAvailable), !!gpu),
      );
    } else {
      var primary = options.primary;
      if (options.cycle) primary = Math.floor(Date.now() / 4000) % 2 ? 'memory' : 'cpu';
      var descriptor = metricDescriptor(primary, options.gpuId, options.gpuName),
        name = document.createElement('span'),
        value = document.createElement('strong');
      name.className = 'metric-name';
      name.textContent = descriptor.label;
      value.textContent = metricPercent(descriptor.value, descriptor.available, descriptor.supported);
      value.className = /%$/.test(value.textContent) ? 'metric-value' : 'metric-value metric-status';
      tile.appendChild(name);
      tile.appendChild(value);
      tile.setAttribute('aria-label', descriptor.label + ' ' + value.textContent);
    }
  }
  function metricsTile(a, preview, index, slotIndex) {
    var tile = document.createElement('div');
    tile.title = a.name || 'PC情報';
    tile.dataset.widgetId = a.id || '';
    tile.dataset.appIndex = index;
    tile.dataset.size = a.size || 1;
    tile.dataset.width = a.width || a.size || 1;
    tile.dataset.height = a.height || a.size || 1;
    renderMetricsTile(tile, a);
    if (preview) {
      tile.draggable = true;
      tile.ondragstart = function (e) {
        e.dataTransfer.setData('text/plain', 'tile:' + index);
        e.dataTransfer.effectAllowed = 'move';
      };
      addDropTarget(tile, index, slotIndex);
      tile.oncontextmenu = function (e) {
        openDeckContextMenu(e, index, a);
      };
    }
    return tile;
  }
  function weatherSymbol(code) {
    if (code <= 1) return '☀';
    if (code <= 3) return '☁';
    if (code === 45 || code === 48) return '≋';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '❄';
    if (code >= 95) return 'ϟ';
    return '☂';
  }
  function weatherTemperature(value) {
    return typeof value === 'number' && isFinite(value) ? Math.round(value) + '°' : '—';
  }
  function renderWeatherTile(tile, a) {
    tile.textContent = '';
    var large = (a.width || a.size || 1) === 2 && (a.height || a.size || 1) === 2;
    tile.className = 'deck-key weather-widget ' + (large ? 'weather-large' : 'weather-small');
    if (!weatherState.configured) {
      // The location is chosen on the PC settings page, so the phone says where to go.
      tile.innerHTML = admin
        ? '<strong class="weather-message">地域が未設定<small>クリックして設定</small></strong>'
        : '<strong class="weather-message">地域が未設定<small>PCの設定画面で選択</small></strong>';
      return;
    }
    if (!weatherState.available) {
      tile.innerHTML = '<strong class="weather-message">天気を取得中</strong>';
      return;
    }
    if (!large) {
      var icon = document.createElement('span'), temperature = document.createElement('strong'), rain = document.createElement('span');
      icon.className = 'weather-icon'; icon.textContent = weatherSymbol(weatherState.code);
      temperature.className = 'weather-temperature'; temperature.textContent = weatherTemperature(weatherState.temperature);
      rain.className = 'weather-rain'; rain.textContent = '降水 ' + Math.round(weatherState.precipitation || 0) + '%';
      tile.appendChild(icon); tile.appendChild(temperature); tile.appendChild(rain);
    } else {
      var heading = document.createElement('strong');
      heading.className = 'weather-heading'; heading.textContent = weatherState.location;
      tile.appendChild(heading);
      var days = document.createElement('div'); days.className = 'weather-days';
      (weatherState.days || []).slice(0, 3).forEach(function (day, index) {
        var column = document.createElement('div'), date = new Date(day.date + 'T00:00:00');
        column.innerHTML = '<small>' + (index === 0 ? '今日' : (date.getMonth() + 1) + '/' + date.getDate()) + '</small><b>' + weatherSymbol(day.code) + '</b><span><i>' + weatherTemperature(day.maximum) + '</i>/' + weatherTemperature(day.minimum) + '</span><em>☂ ' + Math.round(day.precipitation || 0) + '%</em>';
        days.appendChild(column);
      });
      tile.appendChild(days);
      var updated = document.createElement('small'); updated.className = 'weather-updated';
      updated.textContent = (weatherState.stale ? '古い予報・' : '') + '更新 ' + new Date(weatherState.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      tile.appendChild(updated);
    }
    tile.title = weatherState.attribution || 'Weather data by Open-Meteo.com';
  }
  function weatherTile(a, preview, index, slotIndex) {
    var tile = document.createElement('div');
    tile.dataset.widgetId = a.id || ''; tile.dataset.appIndex = index;
    tile.dataset.size = a.size || 1; tile.dataset.width = a.width || a.size || 1; tile.dataset.height = a.height || a.size || 1;
    renderWeatherTile(tile, a);
    if (preview) {
      tile.draggable = true;
      tile.ondragstart = function (e) { e.dataTransfer.setData('text/plain', 'tile:' + index); e.dataTransfer.effectAllowed = 'move'; };
      addDropTarget(tile, index, slotIndex);
      tile.oncontextmenu = function (e) { openDeckContextMenu(e, index, a); };
      tile.onclick = function () { if (!weatherState.configured) focusWeatherLocation(); };
    }
    return tile;
  }
  function focusWeatherLocation() {
    var fieldset = document.querySelector('.weather-location-settings');
    if (!fieldset) return;
    fieldset.scrollIntoView({ behavior: 'smooth', block: 'center' });
    fieldset.classList.remove('weather-location-attention');
    void fieldset.offsetWidth;
    fieldset.classList.add('weather-location-attention');
    $('weather-query').focus({ preventScroll: true });
  }
  function updateWeatherTiles() {
    Array.prototype.forEach.call(document.querySelectorAll('.weather-widget[data-widget-id]'), function (tile) {
      var app = deckApps.filter(function (entry) { return entry.id === tile.dataset.widgetId; })[0];
      if (app) renderWeatherTile(tile, app);
    });
  }
  function updateMetricTiles() {
    Array.prototype.forEach.call(document.querySelectorAll('.metrics-widget[data-widget-id]'), function (tile) {
      var app = deckApps.filter(function (entry) {
        return entry.id === tile.dataset.widgetId;
      })[0];
      if (app) renderMetricsTile(tile, app);
    });
  }

  // Ordered input for wheel and touchpad widgets. One request per widget is in flight;
  // later wheel steps and pointer movement are merged while it waits, clicks keep their order.
  var inputSenders = {},
    inputInteraction = 0,
    inputRenderDeferred = false;
  // A re-render during a gesture would drop the captured pointers, so it waits for the finger.
  function beginInputInteraction() {
    inputInteraction++;
  }
  function endInputInteraction() {
    inputInteraction = Math.max(0, inputInteraction - 1);
    if (!inputInteraction && inputRenderDeferred) {
      inputRenderDeferred = false;
      renderDeck();
    }
  }
  var BUSY_MESSAGE = '他の端末が操作中です。';
  function inputSender(widgetId) {
    if (inputSenders[widgetId]) return inputSenders[widgetId];
    var queue = [],
      inFlight = false,
      lastSent = 0,
      timer = null,
      releaseWanted = false,
      listener = null;
    function notify(state) {
      if (listener) listener(state);
    }
    function session() {
      return inputSessionByWidget[widgetId] || null;
    }
    function renewSessions() {
      announcedViewSignature = '';
      announceView();
    }
    function push(event) {
      var last = queue[queue.length - 1];
      if (last && last.type === event.type && (event.type === 'steps' || event.type === 'wheel')) {
        last.delta += event.delta;
        if (!last.delta) queue.pop();
      } else if (last && last.type === 'move' && event.type === 'move') {
        last.dx += event.dx;
        last.dy += event.dy;
      } else queue.push(event);
      pump();
    }
    function take() {
      var batch = [];
      while (queue.length && batch.length < 16) {
        var event = queue[0];
        if (event.type === 'steps' && Math.abs(event.delta) > 20) {
          var part = event.delta > 0 ? 20 : -20;
          event.delta -= part;
          batch.push({ type: 'steps', delta: part });
          break;
        }
        if (event.type === 'move' && (Math.abs(event.dx) > 4096 || Math.abs(event.dy) > 4096)) {
          var mx = Math.max(-4096, Math.min(4096, event.dx)), my = Math.max(-4096, Math.min(4096, event.dy));
          event.dx -= mx; event.dy -= my;
          batch.push({ type: 'move', dx: mx, dy: my });
          break;
        }
        queue.shift();
        if (event.type === 'move' && !event.dx && !event.dy) continue;
        batch.push(event);
      }
      return batch;
    }
    function post(path, body, retry) {
      return api(path, body).catch(function (e) {
        if (retry && e && e.name === 'AbortError') return post(path, body, false);
        throw e;
      });
    }
    function pump() {
      if (inFlight || timer) return;
      if (!queue.length) {
        if (releaseWanted) {
          releaseWanted = false;
          var current = session();
          if (current) api('input/release', { viewId: viewId, sessionId: current.sessionId }).catch(function () {});
        }
        return;
      }
      var wait = Math.max(0, 50 - (Date.now() - lastSent));
      if (wait) {
        timer = setTimeout(function () { timer = null; pump(); }, wait);
        return;
      }
      var current = session();
      if (!current) {
        queue = [];
        renewSessions();
        return;
      }
      var batch = take();
      if (!batch.length) return pump();
      var sequence = current.nextSequence;
      inFlight = true;
      lastSent = Date.now();
      post('input', { viewId: viewId, sessionId: current.sessionId, sequence: sequence, events: batch }, true)
        .then(
          function (ack) {
            var latest = inputSessionByWidget[widgetId];
            if (latest && latest.sessionId === current.sessionId)
              latest.nextSequence = Math.max(latest.nextSequence, ack.acknowledged + 1);
            notify(ack.foregroundBlocked ? 'blocked' : 'ok');
          },
          function (e) {
            queue = [];
            if (e && e.message === BUSY_MESSAGE) notify('busy');
            else {
              var stale = inputSessionByWidget[widgetId];
              if (stale && stale.sessionId === current.sessionId) delete inputSessionByWidget[widgetId];
              renewSessions();
              notify('error');
            }
          },
        )
        .then(function () {
          inFlight = false;
          pump();
        });
    }
    var sender = {
      steps: function (count) { if (count) push({ type: 'steps', delta: count }); },
      move: function (dx, dy) { if (dx || dy) push({ type: 'move', dx: dx, dy: dy }); },
      wheel: function (delta) { if (delta) push({ type: 'wheel', delta: delta }); },
      button: function (type, control) { push({ type: type, control: control }); },
      keyTap: function (control) { if (control) push({ type: 'keyTap', control: control }); },
      keepalive: function () {
        var current = session();
        if (current && !inFlight && !queue.length)
          api('input/keepalive', { viewId: viewId, sessionId: current.sessionId }).catch(function () {});
      },
      release: function () { releaseWanted = true; pump(); },
      // A re-rendered tile replaces the previous tile's listener.
      listen: function (next) { listener = next; },
    };
    inputSenders[widgetId] = sender;
    return sender;
  }
  // 'busy': another device owns input. 'blocked': Windows ignores input to an elevated window.
  function showInputNotice(tile, state) {
    if (state !== 'busy' && state !== 'blocked') return;
    var label = tile.querySelector('.input-busy-label');
    if (label) label.textContent = state === 'busy' ? '他端末が操作中' : '管理者権限の画面には\n操作できません';
    tile.classList.add('input-busy');
    clearTimeout(tile._busyTimer);
    tile._busyTimer = setTimeout(function () { tile.classList.remove('input-busy'); }, state === 'busy' ? 2000 : 3000);
  }
  function wheelOptions(a) {
    var source = (a && a.options) || {},
      rotary = source.style === 'rotary';
    function number(name, fallback, min, max) {
      var value = Number(source[name]);
      return isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
    }
    return {
      style: rotary ? 'rotary' : 'vertical',
      sensitivity: number('sensitivity', rotary ? 18 : 24, 1, 200),
      multiplier: number('multiplier', 1, 1, 10),
      reverse: source.reverse === true,
      ctrl: source.ctrl === true,
      shift: source.shift === true,
      alt: source.alt === true,
      middleClick: source.middleClick === true,
    };
  }
  function wheelCaption(options) {
    var keys = ['ctrl', 'shift', 'alt'].filter(function (name) { return options[name]; }).map(function (name) {
      return name === 'ctrl' ? 'Ctrl' : name === 'shift' ? 'Shift' : 'Alt';
    });
    return (keys.length ? keys.join('+') + ' + ' : '') + 'ホイール' + (options.multiplier > 1 ? ' ×' + options.multiplier : '');
  }
  function bindWheelGesture(tile, a, options) {
    var sender = inputSender(a.id),
      tracking = false,
      pointerId = null,
      startY = 0,
      lastY = 0,
      travel = 0,
      moved = false,
      startTime = 0,
      offset = 0,
      ridges = tile.querySelector('.wheel-ridges');
    sender.listen(function (state) { showInputNotice(tile, state); });
    function begin(e) {
      if (tracking) return;
      tracking = true;
      pointerId = e.pointerId;
      startY = lastY = e.clientY;
      travel = 0;
      moved = false;
      startTime = Date.now();
      beginInputInteraction();
      tile.classList.add('adjusting');
      if (tile.setPointerCapture) try { tile.setPointerCapture(e.pointerId); } catch (ignore) {}
      if (e.cancelable) e.preventDefault();
    }
    function move(e) {
      if (!tracking || e.pointerId !== pointerId) return;
      var delta = lastY - e.clientY;
      lastY = e.clientY;
      if (Math.abs(e.clientY - startY) > 4) moved = true;
      travel += delta;
      offset = (offset - delta) % 24;
      if (ridges) ridges.style.backgroundPositionY = offset + 'px';
      var steps = travel > 0 ? Math.floor(travel / options.sensitivity) : Math.ceil(travel / options.sensitivity);
      if (steps) {
        travel -= steps * options.sensitivity;
        sender.steps(steps);
        wheelFeedback(Math.abs(steps));
      }
      if (e.cancelable) e.preventDefault();
    }
    function end(e) {
      if (!tracking || e.pointerId !== pointerId) return;
      tracking = false;
      tile.classList.remove('adjusting');
      if (!moved && e.type === 'pointerup' && options.middleClick && Date.now() - startTime < 400) {
        sender.button('buttonDown', 'middle');
        sender.button('buttonUp', 'middle');
        inputFeedback(true);
      }
      sender.release();
      endInputInteraction();
      if (e.cancelable) e.preventDefault();
    }
    tile.addEventListener('pointerdown', begin);
    tile.addEventListener('pointermove', move);
    tile.addEventListener('pointerup', end);
    tile.addEventListener('pointercancel', end);
    bindPcWheelSteps(tile, sender);
  }
  // Rotary wheel: the angle swept around the tile centre becomes steps, so the feel does not
  // depend on tile size. The centre is a dead zone (and the middle-click tap target).
  function bindRotaryGesture(tile, a, options) {
    var sender = inputSender(a.id),
      tracking = false,
      pointerId = null,
      lastAngle = null,
      sweep = 0,
      rotation = 0,
      moved = false,
      startedInCenter = false,
      startTime = 0,
      dial = tile.querySelector('.wheel-dial');
    sender.listen(function (state) { showInputNotice(tile, state); });
    function polar(e) {
      var rect = tile.getBoundingClientRect(),
        dx = e.clientX - (rect.left + rect.width / 2),
        dy = e.clientY - (rect.top + rect.height / 2);
      return {
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
        inside: Math.sqrt(dx * dx + dy * dy) < Math.min(rect.width, rect.height) * 0.18,
      };
    }
    function begin(e) {
      if (tracking) return;
      var p = polar(e);
      tracking = true;
      pointerId = e.pointerId;
      moved = false;
      sweep = 0;
      startedInCenter = p.inside;
      lastAngle = p.inside ? null : p.angle;
      startTime = Date.now();
      beginInputInteraction();
      tile.classList.add('adjusting');
      if (tile.setPointerCapture) try { tile.setPointerCapture(e.pointerId); } catch (ignore) {}
      if (e.cancelable) e.preventDefault();
    }
    function move(e) {
      if (!tracking || e.pointerId !== pointerId) return;
      var p = polar(e);
      if (e.cancelable) e.preventDefault();
      if (p.inside) {
        lastAngle = null;
        return;
      }
      if (lastAngle === null) {
        lastAngle = p.angle;
        moved = true;
        return;
      }
      var delta = p.angle - lastAngle;
      // Crossing the 180/-180 boundary must not look like a full turn.
      if (delta > 180) delta -= 360;
      else if (delta < -180) delta += 360;
      lastAngle = p.angle;
      if (Math.abs(delta) > 0.5) moved = true;
      sweep += delta;
      rotation += delta;
      if (dial) dial.style.transform = 'rotate(' + rotation.toFixed(1) + 'deg)';
      var steps = sweep > 0 ? Math.floor(sweep / options.sensitivity) : Math.ceil(sweep / options.sensitivity);
      if (steps) {
        sweep -= steps * options.sensitivity;
        // Clockwise scrolls down, like a physical wheel turned towards the user.
        sender.steps(-steps);
        wheelFeedback(Math.abs(steps));
      }
    }
    function end(e) {
      if (!tracking || e.pointerId !== pointerId) return;
      tracking = false;
      tile.classList.remove('adjusting');
      if (!moved && startedInCenter && e.type === 'pointerup' && options.middleClick && Date.now() - startTime < 400) {
        sender.button('buttonDown', 'middle');
        sender.button('buttonUp', 'middle');
        inputFeedback(true);
      }
      sender.release();
      endInputInteraction();
      if (e.cancelable) e.preventDefault();
    }
    tile.addEventListener('pointerdown', begin);
    tile.addEventListener('pointermove', move);
    tile.addEventListener('pointerup', end);
    tile.addEventListener('pointercancel', end);
    bindPcWheelSteps(tile, sender);
  }
  // PC window: the mouse wheel over a wheel widget turns it one step per notch (wheel up = up).
  function bindPcWheelSteps(tile, sender) {
    if (!pcWindow) return;
    var rest = 0;
    tile.addEventListener('wheel', function (e) {
      e.preventDefault();
      e.stopPropagation();
      rest += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      var notches = rest > 0 ? Math.floor(rest / 100) : Math.ceil(rest / 100);
      if (!notches && Math.abs(e.deltaY) >= 1 && e.deltaMode !== 0) notches = e.deltaY > 0 ? 1 : -1;
      if (!notches) return;
      rest -= notches * 100;
      sender.steps(-notches);
      sender.release();
    }, { passive: false });
  }
  // Optional touch feedback, stored per device. Android vibrates; iPhone has no Vibration API,
  // so a short Web Audio click is used instead (muted by the iPhone silent switch).
  var feedbackEnabled = true,
    feedbackAudio = null,
    lastFeedback = 0;
  try {
    feedbackEnabled = localStorage.getItem('tapoard-feedback') !== 'off';
  } catch (ignore) {}
  function canVibrate() {
    return typeof navigator.vibrate === 'function';
  }
  function prepareFeedbackAudio() {
    if (!feedbackEnabled || canVibrate()) return;
    var Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      if (!feedbackAudio) feedbackAudio = new Context();
      if (feedbackAudio.state === 'suspended') feedbackAudio.resume();
    } catch (ignore) {
      feedbackAudio = null;
    }
  }
  function playClick() {
    if (!feedbackAudio || feedbackAudio.state !== 'running') return;
    var now = feedbackAudio.currentTime,
      oscillator = feedbackAudio.createOscillator(),
      gain = feedbackAudio.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(1800, now);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
    oscillator.connect(gain);
    gain.connect(feedbackAudio.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.015);
  }
  // One feedback per finger gesture step (not per step sent to the PC), at most every 35ms.
  function inputFeedback(strong) {
    if (!feedbackEnabled) return;
    var now = Date.now();
    if (now - lastFeedback < 35) return;
    lastFeedback = now;
    if (canVibrate()) navigator.vibrate(strong ? 18 : 8);
    else playClick();
  }
  function wheelFeedback() {
    inputFeedback(false);
  }
  document.addEventListener('pointerdown', prepareFeedbackAudio, { passive: true });
  if ($('feedback')) {
    $('feedback').checked = feedbackEnabled;
    $('feedback-note').textContent = canVibrate()
      ? 'ホイール・タッチパッド操作時に短く振動します（この端末だけの設定）'
      : 'ホイール・タッチパッド操作時にクリック音を鳴らします。iPhoneの消音モード中は鳴りません（この端末だけの設定）';
    $('feedback').onchange = function () {
      feedbackEnabled = this.checked;
      try {
        localStorage.setItem('tapoard-feedback', feedbackEnabled ? 'on' : 'off');
      } catch (ignore) {}
      if (feedbackEnabled) {
        prepareFeedbackAudio();
        inputFeedback(true);
      }
    };
  }
  function appendWidgetName(tile, a) {
    if (a.hideLabel || !a.name) return;
    var name = document.createElement('span');
    name.className = 'input-widget-name';
    name.textContent = a.name;
    tile.appendChild(name);
  }
  function touchpadOptions(a) {
    var source = (a && a.options) || {},
      speed = Number(source.speed);
    return {
      speed: isFinite(speed) ? Math.max(1, Math.min(10, Math.round(speed))) : 5,
      acceleration: source.acceleration !== false,
      tapToClick: source.tapToClick !== false,
      twoFingerScroll: source.twoFingerScroll !== false,
      reverseScroll: source.reverseScroll === true,
      longPress: source.longPress === 'rightClick' || source.longPress === 'drag' ? source.longPress : 'none',
    };
  }
  // Touchpad gestures: one finger moves, tap = left click, two-finger tap = right click,
  // tap then touch-and-move = drag, two fingers moving vertically = scroll.
  function bindTouchpadGesture(tile, a, options) {
    var sender = inputSender(a.id),
      pointers = {},
      count = 0,
      maxPointers = 0,
      downTime = 0,
      travel = 0,
      lastTapEnd = 0,
      tapThenTouch = false,
      dragging = false,
      longFired = false,
      longTimer = null,
      keepTimer = null,
      restX = 0,
      restY = 0,
      restScroll = 0;
    sender.listen(function (state) {
      showInputNotice(tile, state);
    });
    function click(control) {
      sender.button('buttonDown', control);
      sender.button('buttonUp', control);
      inputFeedback(true);
    }
    function startDrag() {
      if (dragging) return;
      dragging = true;
      tile.classList.add('dragging');
      sender.button('buttonDown', 'left');
      inputFeedback(true);
      clearInterval(keepTimer);
      keepTimer = setInterval(sender.keepalive, 500);
    }
    function stopDrag() {
      clearInterval(keepTimer);
      keepTimer = null;
      if (!dragging) return;
      dragging = false;
      tile.classList.remove('dragging');
      sender.button('buttonUp', 'left');
    }
    function moveBy(dx, dy, elapsed) {
      var factor = options.speed * 0.3;
      if (options.acceleration && elapsed > 0) {
        var velocity = Math.sqrt(dx * dx + dy * dy) / elapsed;
        factor *= 1 + Math.min(2, Math.max(0, velocity - 0.25) * 1.5);
      }
      restX += dx * factor;
      restY += dy * factor;
      var x = Math.trunc(restX),
        y = Math.trunc(restY);
      restX -= x;
      restY -= y;
      sender.move(x, y);
    }
    function begin(e) {
      // PC window: the right mouse button is the right click (the two-finger tap on a phone).
      if (pcWindow && e.pointerType === 'mouse' && e.button === 2) {
        click('right');
        sender.release();
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (pointers[e.pointerId]) return;
      if (tile.setPointerCapture) try { tile.setPointerCapture(e.pointerId); } catch (ignore) {}
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY, time: e.timeStamp || Date.now() };
      count++;
      maxPointers = Math.max(maxPointers, count);
      if (count === 1) {
        beginInputInteraction();
        downTime = Date.now();
        travel = 0;
        longFired = false;
        restX = restY = restScroll = 0;
        tapThenTouch = options.tapToClick && downTime - lastTapEnd < 300;
        clearTimeout(longTimer);
        if (options.longPress !== 'none')
          longTimer = setTimeout(function () {
            if (count !== 1 || travel > 8) return;
            longFired = true;
            if (options.longPress === 'rightClick') click('right');
            else startDrag();
          }, 500);
      } else clearTimeout(longTimer);
      tile.classList.add('adjusting');
      if (e.cancelable) e.preventDefault();
    }
    function move(e) {
      var pointer = pointers[e.pointerId];
      if (!pointer) return;
      var now = e.timeStamp || Date.now(),
        dx = e.clientX - pointer.x,
        dy = e.clientY - pointer.y,
        elapsed = now - pointer.time;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.time = now;
      travel += Math.abs(dx) + Math.abs(dy);
      if (travel > 8) clearTimeout(longTimer);
      if (e.cancelable) e.preventDefault();
      if (count === 1 && maxPointers === 1) {
        if (tapThenTouch && travel > 8) {
          tapThenTouch = false;
          startDrag();
        }
        moveBy(dx, dy, elapsed);
      } else if (count >= 2 && options.twoFingerScroll) {
        // Fingers moving down scroll up, like the page following the fingers.
        restScroll += (dy / count) * 4;
        var delta = Math.trunc(restScroll);
        if (delta) {
          restScroll -= delta;
          sender.wheel(delta);
        }
      }
    }
    function end(e) {
      if (!pointers[e.pointerId]) return;
      delete pointers[e.pointerId];
      count--;
      if (e.cancelable) e.preventDefault();
      if (count > 0) return;
      clearTimeout(longTimer);
      tile.classList.remove('adjusting');
      var tap = e.type === 'pointerup' && !longFired && Date.now() - downTime < 250 && travel < 10 * maxPointers;
      if (dragging) stopDrag();
      else if (tap && options.tapToClick) {
        click(maxPointers >= 2 ? 'right' : 'left');
        if (maxPointers === 1) lastTapEnd = Date.now();
      }
      maxPointers = 0;
      tapThenTouch = false;
      sender.release();
      endInputInteraction();
    }
    tile.addEventListener('pointerdown', begin);
    tile.addEventListener('pointermove', move);
    tile.addEventListener('pointerup', end);
    tile.addEventListener('pointercancel', end);
    if (pcWindow)
      tile.addEventListener('wheel', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var delta = -Math.round((e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY) * 1.2);
        if (!delta) return;
        sender.wheel(Math.max(-1200, Math.min(1200, delta)));
        sender.release();
      }, { passive: false });
  }
  function touchpadTile(a, preview, index, slotIndex) {
    var options = touchpadOptions(a),
      tile = document.createElement('div');
    tile.className = 'deck-key touchpad-widget';
    tile.title = a.name || 'タッチパッド';
    tile.dataset.widgetId = a.id || '';
    tile.dataset.appIndex = index;
    tile.dataset.size = a.size || 1;
    tile.dataset.width = a.width || 3;
    tile.dataset.height = a.height || 2;
    var hint = document.createElement('span');
    hint.className = 'touchpad-hint';
    hint.textContent =
      (options.tapToClick ? 'タップ：クリック　2本指タップ：右クリック' : '') +
      (options.twoFingerScroll ? (options.tapToClick ? '\n' : '') + '2本指で上下：スクロール' : '');
    tile.appendChild(hint);
    appendWidgetName(tile, a);
    var busy = document.createElement('span');
    busy.className = 'input-busy-label';
    busy.textContent = '他端末が操作中';
    tile.appendChild(busy);
    tile.setAttribute('aria-label', a.name || 'タッチパッド');
    if (preview) {
      tile.draggable = true;
      tile.ondragstart = function (e) {
        e.dataTransfer.setData('text/plain', 'tile:' + index);
        e.dataTransfer.effectAllowed = 'move';
      };
      addDropTarget(tile, index, slotIndex);
      tile.oncontextmenu = function (e) {
        openDeckContextMenu(e, index, a);
      };
    } else if (a.id) bindTouchpadGesture(tile, a, options);
    return tile;
  }
  function keypadTile(a, preview, index, slotIndex) {
    var tile = document.createElement('div'),
      sender = !preview && a.id ? inputSender(a.id) : null;
    tile.className = 'deck-key keypad-widget';
    tile.title = a.name || 'テンキー';
    tile.dataset.widgetId = a.id || '';
    tile.dataset.appIndex = index;
    tile.dataset.size = a.size || 1;
    tile.dataset.width = a.width || 4;
    tile.dataset.height = a.height || 4;
    var tall = (a.height || 4) === 5;
    if (tall) tile.classList.add('keypad-tall');
    // [label, key, column, row, column span, row span]; the 4x5 layout follows a PC numpad.
    (tall
      ? [
          ['Num', 'numpad-numlock', 1, 1, 1, 1, 'NumLock'], ['÷', 'numpad-divide', 2, 1], ['×', 'numpad-multiply', 3, 1], ['−', 'numpad-subtract', 4, 1],
          ['7', 'numpad-7', 1, 2], ['8', 'numpad-8', 2, 2], ['9', 'numpad-9', 3, 2], ['＋', 'numpad-add', 4, 2, 1, 2],
          ['4', 'numpad-4', 1, 3], ['5', 'numpad-5', 2, 3], ['6', 'numpad-6', 3, 3],
          ['1', 'numpad-1', 1, 4], ['2', 'numpad-2', 2, 4], ['3', 'numpad-3', 3, 4], ['Enter', 'numpad-enter', 4, 4, 1, 2],
          ['0', 'numpad-0', 1, 5, 2, 1], ['.', 'numpad-decimal', 3, 5],
        ]
      : [
          ['7', 'numpad-7'], ['8', 'numpad-8'], ['9', 'numpad-9'], ['÷', 'numpad-divide'],
          ['4', 'numpad-4'], ['5', 'numpad-5'], ['6', 'numpad-6'], ['×', 'numpad-multiply'],
          ['1', 'numpad-1'], ['2', 'numpad-2'], ['3', 'numpad-3'], ['−', 'numpad-subtract'],
          ['0', 'numpad-0'], ['.', 'numpad-decimal'], ['Enter', 'numpad-enter'], ['＋', 'numpad-add'],
        ]
    ).forEach(function (item) {
      var key = document.createElement(preview ? 'span' : 'button');
      key.className = 'keypad-key';
      key.textContent = item[0];
      key.setAttribute('aria-label', item[6] || item[0]);
      if (item[2]) {
        key.style.gridColumn = item[2] + ' / span ' + (item[4] || 1);
        key.style.gridRow = item[3] + ' / span ' + (item[5] || 1);
      }
      if (sender) key.onclick = function (e) {
        e.preventDefault();
        sender.keyTap(item[1]);
        sender.release();
      };
      tile.appendChild(key);
    });
    var busy = document.createElement('span');
    busy.className = 'input-busy-label';
    busy.textContent = '他端末が操作中';
    tile.appendChild(busy);
    tile.setAttribute('aria-label', a.name || 'テンキー');
    if (sender) sender.listen(function (state) { showInputNotice(tile, state); });
    if (preview) {
      tile.draggable = true;
      tile.ondragstart = function (e) {
        e.dataTransfer.setData('text/plain', 'tile:' + index);
        e.dataTransfer.effectAllowed = 'move';
      };
      addDropTarget(tile, index, slotIndex);
      tile.oncontextmenu = function (e) { openDeckContextMenu(e, index, a); };
    }
    return tile;
  }
  function wheelTile(a, preview, index, slotIndex) {
    var options = wheelOptions(a),
      tile = document.createElement('div');
    tile.className = 'deck-key wheel-widget wheel-' + options.style;
    tile.title = a.name || 'マウスホイール';
    tile.dataset.widgetId = a.id || '';
    tile.dataset.appIndex = index;
    tile.dataset.size = a.size || 1;
    tile.dataset.width = a.width || a.size || 1;
    tile.dataset.height = a.height || a.size || 1;
    if (options.style === 'rotary') {
      var dial = document.createElement('span'),
        notch = document.createElement('span'),
        center = document.createElement('span');
      dial.className = 'wheel-dial';
      notch.className = 'wheel-notch';
      center.className = 'wheel-center';
      center.textContent = options.middleClick ? '中' : '';
      dial.appendChild(notch);
      tile.appendChild(dial);
      tile.appendChild(center);
    } else {
      var ridges = document.createElement('span');
      ridges.className = 'wheel-ridges';
      tile.appendChild(ridges);
    }
    var caption = document.createElement('span');
    caption.className = 'wheel-caption';
    caption.textContent = wheelCaption(options);
    tile.appendChild(caption);
    appendWidgetName(tile, a);
    var busy = document.createElement('span');
    busy.className = 'input-busy-label';
    busy.textContent = '他端末が操作中';
    tile.appendChild(busy);
    tile.setAttribute('aria-label', (a.name || 'マウスホイール') + '：' + caption.textContent);
    if (preview) {
      tile.draggable = true;
      tile.ondragstart = function (e) {
        e.dataTransfer.setData('text/plain', 'tile:' + index);
        e.dataTransfer.effectAllowed = 'move';
      };
      addDropTarget(tile, index, slotIndex);
      tile.oncontextmenu = function (e) {
        openDeckContextMenu(e, index, a);
      };
    } else if (a.id) (options.style === 'rotary' ? bindRotaryGesture : bindWheelGesture)(tile, a, options);
    return tile;
  }

  function catalogItem(action) {
    for (var g = 0; g < catalog.length; g++)
      for (var i = 0; i < catalog[g].items.length; i++)
        if (catalog[g].items[i][0] === action) return { item: catalog[g].items[i], category: catalog[g].category };
    return null;
  }
  function controlFromAction(action) {
    return action === 'control-speaker-fader' ? 'speaker' : action === 'control-mic-fader' ? 'mic' : null;
  }
  function customTypeFromAction(action) {
    if (action === 'custom-audio-output') return 'audio-output';
    if (action === 'custom-audio-input') return 'audio-input';
    return action === 'custom-url' ? 'url' : action === 'custom-clipboard' ? 'clipboard' : '';
  }
  function widgetFromAction(action) {
    if (action === 'widget-clock-digital' || action === 'widget-clock-digital-wide' || action === 'widget-clock-analog') {
      var analog = action === 'widget-clock-analog',
        wide = action === 'widget-clock-digital-wide';
      return {
        name: analog ? 'アナログ時計' : 'デジタル時計',
        type: 'clock',
        category: 'widget',
        size: wide ? 1 : 2,
        width: 2,
        height: wide ? 1 : 2,
        hideLabel: true,
        options: { style: analog ? 'analog' : 'digital', showSeconds: true, showDate: true, showWeekday: true, hour12: false },
      };
    }
    if (action === 'widget-keypad' || action === 'widget-keypad-tall') {
      return {
        name: 'テンキー',
        type: 'keypad',
        category: 'widget',
        size: 1,
        width: 4,
        height: action === 'widget-keypad-tall' ? 5 : 4,
        hideLabel: true,
        options: {},
      };
    }
    if (action === 'widget-weather-now' || action === 'widget-weather-days') {
      var days = action === 'widget-weather-days';
      return {
        name: days ? '3日間の天気' : '現在の天気',
        type: 'weather',
        category: 'widget',
        size: days ? 2 : 1,
        width: days ? 2 : 1,
        height: days ? 2 : 1,
        hideLabel: true,
        options: { forecastMode: days ? 'days' : 'hours' },
      };
    }
    if (action === 'widget-metrics-cpu' || action === 'widget-metrics-memory' || action === 'widget-metrics-gpu' || action === 'widget-metrics-gpu-memory' || action === 'widget-metrics-overview') {
      var overview = action === 'widget-metrics-overview',
        memory = action === 'widget-metrics-memory',
        gpu = action === 'widget-metrics-gpu',
        gpuMemory = action === 'widget-metrics-gpu-memory';
      return {
        name: overview ? 'PC情報' : memory ? 'メモリ使用率' : gpu ? 'GPU使用率' : gpuMemory ? 'GPUメモリ' : 'CPU使用率',
        type: 'metrics',
        category: 'widget',
        size: overview ? 2 : 1,
        width: overview ? 2 : 1,
        height: overview ? 2 : 1,
        hideLabel: true,
        options: { primary: memory ? 'memory' : gpu ? 'gpu' : gpuMemory ? 'gpuMemory' : 'cpu', cycle: false, gpuId: '', gpuName: '' },
      };
    }
    if (action === 'widget-wheel-vertical' || action === 'widget-wheel-vertical-tall' || action === 'widget-wheel-rotary') {
      var rotary = action === 'widget-wheel-rotary',
        tall = action === 'widget-wheel-vertical-tall';
      return {
        name: rotary ? '円形ホイール' : '縦型ホイール',
        type: 'wheel',
        category: 'widget',
        size: rotary ? 2 : 1,
        width: rotary ? 2 : 1,
        height: rotary || tall ? 2 : 1,
        hideLabel: true,
        options: {
          style: rotary ? 'rotary' : 'vertical',
          sensitivity: rotary ? 18 : 24,
          multiplier: 1,
          reverse: false,
          ctrl: false,
          shift: false,
          alt: false,
          middleClick: false,
        },
      };
    }
    if (action === 'widget-touchpad-wide' || action === 'widget-touchpad-tall') {
      var tall = action === 'widget-touchpad-tall';
      return {
        name: 'タッチパッド',
        type: 'touchpad',
        category: 'widget',
        size: 1,
        width: tall ? 2 : 3,
        height: tall ? 3 : 2,
        hideLabel: true,
        options: { speed: 5, acceleration: true, tapToClick: true, twoFingerScroll: true, reverseScroll: false, longPress: 'none' },
      };
    }
    return null;
  }
  function addWidgetEditor(action, index) {
    var item = widgetFromAction(action);
    if (!item) return null;
    if (
      rows.filter(function (r) {
        return r.orientation === previewOrientation;
      }).length >= 40
    ) {
      desiredPlacement = null;
      message('ボタンはこの向きで40個以内です。');
      return null;
    }
    try {
      var fields = editor(
        item,
        typeof index === 'number' ? Math.min(index, rows.length) : Math.min(rows.length, (page + 1) * appsPerPage),
      );
      if (item.type === 'weather' && !weatherLocation.configured) focusWeatherLocation();
      else fields.box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return fields;
    } catch (e) {
      desiredPlacement = null;
      message(
        item.type === 'keypad' && /空き枠/.test(e.message)
          ? 'テンキーには音量フェーダーと重ならない' + item.width + '×' + item.height + 'の空き枠が必要です。画面の枠数を増やすか、そのページのフェーダーを非表示にしてください。'
          : e.message,
      );
      return null;
    }
  }
  function addCustomEditor(type, index) {
    if (type === 'audio-output' || type === 'audio-input')
      return addAudioEditor(type === 'audio-input' ? 'mic' : 'speaker', index);
    if (
      rows.filter(function (r) {
        return r.orientation === previewOrientation;
      }).length >= 40
    ) {
      message('ボタンはこの向きで40個以内です。');
      return null;
    }
    var isUrl = type === 'url',
      fields = editor(
        {
          name: isUrl ? 'URLを開く' : 'テキストをコピー',
          type: type,
          category: 'custom',
          iconKey: isUrl ? 'globe' : 'copy',
        },
        typeof index === 'number' ? Math.min(index, rows.length) : Math.min(rows.length, (page + 1) * appsPerPage),
      );
    fields.box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () {
      (isUrl ? fields.url : fields.text).focus();
    }, 250);
    message((isUrl ? 'URL' : 'コピーするテキスト') + 'を入力して「設定を保存」を押してください。');
    return fields;
  }
  function addControlDropTarget(node, slotIndex) {
    node.addEventListener('dragover', function (e) {
      if (e.dataTransfer.types.indexOf('text/plain') < 0) return;
      e.preventDefault();
      node.classList.add('drop-target');
      e.dataTransfer.dropEffect = 'move';
    });
    node.addEventListener('dragleave', function () {
      node.classList.remove('drop-target');
    });
    node.addEventListener('drop', function (e) {
      var target = controlFromAction(e.dataTransfer.getData('text/plain'));
      node.classList.remove('drop-target');
      if (!target) return;
      e.preventDefault();
      moveAudioControl(target, slotIndex);
    });
  }
  function addDropTarget(node, index, slotIndex) {
    node.addEventListener('dragover', function (e) {
      if (e.dataTransfer.types.indexOf('text/plain') < 0) return;
      e.preventDefault();
      node.classList.add('drop-target');
      e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy';
    });
    node.addEventListener('dragleave', function () {
      node.classList.remove('drop-target');
    });
    node.addEventListener('drop', function (e) {
      e.preventDefault();
      node.classList.remove('drop-target');
      var value = e.dataTransfer.getData('text/plain');
      if (value.indexOf('tile:') === 0) {
        moveApp(Number(value.slice(5)), slotIndex);
        return;
      }
      var found = catalogItem(value);
      if (!found) return;
      var control = controlFromAction(value),
        custom = customTypeFromAction(value),
        widget = widgetFromAction(value),
        width = widget ? widget.width : 1,
        height = widget ? widget.height : 1;
      if (control) {
        moveAudioControl(control, slotIndex);
        return;
      }
      if (
        !canPlace(rows.map(rowData), -1, positionAt(page, slotIndex, displayGrid(true).columns), width, height, previewOrientation)
      ) {
        message(widget ? widget.name + 'を置ける' + width + '×' + height + 'の空き枠へドロップしてください。' : '空き枠へドロップしてください。');
        return;
      }
      desiredPlacement = {
        orientation: previewOrientation,
        position: positionAt(page, slotIndex, displayGrid(true).columns),
      };
      if (custom) {
        addCustomEditor(custom, rows.length);
        return;
      }
      if (widget) {
        if (addWidgetEditor(value, rows.length)) persistRows(widget.name + 'を追加して自動保存しました。');
        return;
      }
      if (
        rows.filter(function (r) {
          return r.orientation === previewOrientation;
        }).length >= 40
      ) {
        desiredPlacement = null;
        message('ボタンはこの向きで40個以内です。');
        return;
      }
      editor(
        {
          name: found.item[1],
          type: 'hotkey',
          action: value,
          category: found.category,
          iconKey: defaultIconForAction(value, found.category),
        },
        rows.length,
      );
      persistRows(found.item[1] + 'を追加して自動保存しました。');
    });
  }
  function appTile(a, preview, index, slotIndex) {
    if (a.type === 'clock') return clockTile(a, preview, index, slotIndex);
    if (a.type === 'metrics') return metricsTile(a, preview, index, slotIndex);
    if (a.type === 'weather') return weatherTile(a, preview, index, slotIndex);
    if (a.type === 'wheel') return wheelTile(a, preview, index, slotIndex);
    if (a.type === 'touchpad') return touchpadTile(a, preview, index, slotIndex);
    if (a.type === 'keypad') return keypadTile(a, preview, index, slotIndex);
    var b = document.createElement(preview ? 'div' : 'button');
    b.className = 'deck-key';
    b.title = a.name;
    if (a.type === 'audioDevice') {
      var device = (audioState.devices || []).filter(function (d) {
          return d.id === a.deviceId && d.target === a.deviceTarget;
        })[0],
        known = Array.isArray(audioState.devices),
        unavailable = known && (!device || !device.available);
      b.classList.toggle('device-unavailable', unavailable);
      b.classList.toggle('device-selected', !!(device && device.selected));
      b.title = a.name + (unavailable ? '（未接続・無効）' : device && device.selected ? '（選択中）' : '');
      if (!preview) b.disabled = unavailable;
      if (unavailable || (device && device.selected)) {
        var badge = document.createElement('span');
        badge.className = 'device-badge';
        badge.textContent = unavailable ? '未接続' : '選択中';
        b.appendChild(badge);
      }
    }
    b.appendChild(iconNode(a));
    var label = document.createElement('span');
    label.className = 'key-label';
    label.textContent = a.name;
    b.appendChild(label);
    b.setAttribute('aria-label', a.name);
    b.dataset.appIndex = index;
    b.dataset.size = a.size || 1;
    b.dataset.width = a.width || a.size || 1;
    b.dataset.height = a.height || a.size || 1;
    applyAppearance(b, a, preview);
    if (preview) {
      b.draggable = true;
      b.ondragstart = function (e) {
        e.dataTransfer.setData('text/plain', 'tile:' + index);
        e.dataTransfer.effectAllowed = 'move';
      };
      addDropTarget(b, index, slotIndex);
      b.oncontextmenu = function (e) {
        openDeckContextMenu(e, index, a);
      };
    } else
      b.onclick = function () {
        act('launch', a.id, b);
      };
    return b;
  }
  function emptyTile(preview, index, slotIndex) {
    var slot = document.createElement(preview ? 'button' : 'div');
    slot.className = 'deck-key empty-key';
    if (preview) {
      slot.type = 'button';
      slot.title = 'ここにアプリを追加';
      slot.setAttribute('aria-label', 'ここにアプリを追加');
      var plus = document.createElement('span');
      plus.className = 'empty-plus';
      plus.textContent = '＋';
      slot.appendChild(plus);
      slot.onclick = function () {
        startImport(index, slotIndex);
      };
      addDropTarget(slot, index, slotIndex);
    } else slot.setAttribute('aria-hidden', 'true');
    return slot;
  }
  function displayGrid(preview) {
    return gridFor(currentOrientation(preview));
  }
  function fillDeck(container, preview) {
    container.textContent = '';
    var display = displayGrid(preview),
      columns = display.columns,
      total = display.columns * display.rows,
      orientation = currentOrientation(preview);
    ensurePlacements(deckApps);
    container.dataset.columns = columns;
    container.style.gridTemplateColumns = 'repeat(' + columns + ',minmax(0,1fr))';
    container.style.gridTemplateRows = 'repeat(' + display.rows + ',minmax(0,1fr))';
    container.style.aspectRatio = columns + '/' + display.rows;
    if (!preview) container.parentElement.style.setProperty('--deck-ratio', columns / display.rows);
    var used = {};
    function put(tile, pos, width, height) {
      width = width || 1;
      height = height || 1;
      tile.dataset.slot = pos.row * columns + pos.column;
      tile.style.gridColumn = pos.column + 1 + ' / span ' + width;
      tile.style.gridRow = pos.row + 1 + ' / span ' + height;
      container.appendChild(tile);
      for (var y = pos.row; y < pos.row + height; y++)
        for (var x = pos.column; x < pos.column + width; x++) used[y * columns + x] = true;
    }
    ['speaker', 'mic'].forEach(function (target) {
      var rect = controlRect(target, orientation);
      if (!rect) return;
      var slot = rect.row * columns + rect.column,
        tile = audioFader(target, preview, slot);
      if (preview) {
        addControlDropTarget(tile, slot);
        tile.draggable = true;
        tile.ondragstart = function (e) {
          e.dataTransfer.setData('text/plain', 'control-' + target + '-fader');
        };
      }
      put(tile, { page: page, row: rect.row, column: rect.column }, rect.width, rect.height);
    });
    deckApps.forEach(function (a, i) {
      if (a.orientation !== orientation) return;
      var pos = a[orientation];
      if (pos && pos.page === page) put(appTile(a, preview, i, pos.row * columns + pos.column), pos, a.width || a.size || 1, a.height || a.size || 1);
    });
    for (var slot = 0; slot < total; slot++)
      if (!used[slot]) put(emptyTile(preview, rows.length, slot), positionAt(page, slot, columns), 1, 1);
  }
  function renderDeck() {
    var orientation = currentOrientation(false);
    if (lastPhoneOrientation && lastPhoneOrientation !== orientation) pageByOrientation[lastPhoneOrientation] = page;
    if (lastPhoneOrientation !== orientation) {
      page = pageByOrientation[orientation] || 0;
      lastPhoneOrientation = orientation;
    }
    pageCount = layoutPages();
    page = Math.max(0, Math.min(page, pageCount - 1));
    pageByOrientation[orientation] = page;
    fillDeck($('deck'), false);
    $('page-label').textContent = page + 1 + ' / ' + pageCount;
    $('prev-page').disabled = page === 0;
    $('next-page').disabled = page === pageCount - 1;
    $('empty').hidden = deckApps.some(function (a) {
      return a.orientation === orientation;
    });
    scheduleClockUpdates();
  }
  function renderPreview() {
    if (!admin) return;
    var portrait = previewOrientation === 'portrait';
    $('phone-shell').classList.toggle('portrait', portrait);
    $('phone-shell').classList.toggle('landscape', !portrait);
    $('preview-landscape').setAttribute('aria-pressed', portrait ? 'false' : 'true');
    $('preview-portrait').setAttribute('aria-pressed', portrait ? 'true' : 'false');
    pageCount = layoutPages();
    page = Math.max(0, Math.min(page, pageCount - 1));
    fillDeck($('preview-deck'), true);
    $('preview-page-label').textContent = page + 1 + ' / ' + pageCount;
    $('preview-prev').disabled = page === 0;
    $('preview-next').disabled = page === pageCount - 1;
    scheduleClockUpdates();
  }
  function updatePhoneStatus(active) {
    if (!admin) return;
    $('phone-status').textContent = active ? '● 接続中' : '○ 未接続';
    $('phone-status').classList.toggle('online', !!active);
    $('preview-offline').hidden = !!active;
    var settingsRoot = $('settings'),
      connection = $('connection-panel'),
      studio = $('studio');
    if (active) settingsRoot.appendChild(connection);
    else settingsRoot.insertBefore(connection, studio);
  }
  function syncGridControls() {
    var orientation = admin ? previewOrientation : currentOrientation(false),
      grid = gridFor(orientation),
      minimumColumns = 2,
      minimumRows = 2;
    allControls(orientation).forEach(function (controls) {
      minimumColumns = Math.max(minimumColumns, controls.speakerWidth || controls.speakerSize || 1, controls.micWidth || controls.micSize || 1);
      minimumRows = Math.max(minimumRows, controls.speakerHeight || controls.speakerSize || 1, controls.micHeight || controls.micSize || 1);
    });
    deckApps.forEach(function (app) {
      if (app.orientation !== orientation) return;
      minimumColumns = Math.max(minimumColumns, app.width || app.size || 1);
      minimumRows = Math.max(minimumRows, app.height || app.size || 1);
    });
    $('grid-columns').value = grid.columns;
    $('grid-rows').value = grid.rows;
    $('admin-columns').value = grid.columns;
    $('admin-rows').value = grid.rows;
    [$('grid-columns'), $('admin-columns')].forEach(function (select) {
      Array.prototype.forEach.call(select.options, function (option) { option.disabled = Number(option.value) < minimumColumns; });
    });
    [$('grid-rows'), $('admin-rows')].forEach(function (select) {
      Array.prototype.forEach.call(select.options, function (option) { option.disabled = Number(option.value) < minimumRows; });
    });
    appsPerPage = Math.max(1, grid.columns * grid.rows - 2);
  }
  function applyLayout(s) {
    if (s.landscapeGrid) layout.grids.landscape = { columns: s.landscapeGrid.columns, rows: s.landscapeGrid.rows };
    else if (typeof s.columns === 'number' && typeof s.rows === 'number')
      layout.grids.landscape = { columns: Math.max(s.columns, s.rows), rows: Math.min(s.columns, s.rows) };
    if (s.portraitGrid) layout.grids.portrait = { columns: s.portraitGrid.columns, rows: s.portraitGrid.rows };
    else if (typeof s.columns === 'number' && typeof s.rows === 'number')
      layout.grids.portrait = { columns: Math.min(s.columns, s.rows), rows: Math.max(s.columns, s.rows) };
    if (typeof s.keepAwake === 'boolean') layout.keepAwake = s.keepAwake;
    ['landscape', 'portrait'].forEach(function (o) {
      var source = s[o + 'Controls'] || (typeof s.speakerSlot === 'number' ? s : null),
        grid = layout.grids[o];
      if (Array.isArray(s[o + 'ControlPages'])) {
        layout.controlPages[o] = {};
        s[o + 'ControlPages'].forEach(function (entry) {
          var controls = normalizeControls(entry, grid);
          controls.page = entry.page;
          controls.speakerHidden = !!entry.speakerHidden;
          controls.micHidden = !!entry.micHidden;
          layout.controlPages[o][entry.page] = controls;
        });
      }
      if (source) layout.controls[o] = normalizeControls(source, grid);
    });
    $('awake').checked = layout.keepAwake;
    syncGridControls();
  }
  function normalizeControls(source, grid) {
      var speakerSlot = source.speakerSlot || 0,
        micSlot = typeof source.micSlot === 'number' ? source.micSlot : 1,
        speakerSize = source.speakerSize || 1,
        micSize = source.micSize || 1;
      return {
        speakerSlot: speakerSlot,
        micSlot: micSlot,
        speakerSize: speakerSize,
        micSize: micSize,
        speakerRow: typeof source.speakerRow === 'number' ? source.speakerRow : Math.floor(speakerSlot / grid.columns),
        speakerColumn: typeof source.speakerColumn === 'number' ? source.speakerColumn : speakerSlot % grid.columns,
        speakerWidth: source.speakerWidth || speakerSize,
        speakerHeight: source.speakerHeight || speakerSize,
        micRow: typeof source.micRow === 'number' ? source.micRow : Math.floor(micSlot / grid.columns),
        micColumn: typeof source.micColumn === 'number' ? source.micColumn : micSlot % grid.columns,
        micWidth: source.micWidth || micSize,
        micHeight: source.micHeight || micSize,
      };
  }
  function deckRenderSignature() {
    var orientation = admin ? previewOrientation : currentOrientation(false);
    return JSON.stringify({
      orientation: orientation,
      version: deckVersion,
      page: pageByOrientation[orientation] || 0,
      pages: pagesByOrientation[orientation] || 1,
      grid: layout.grids[orientation],
      controls: layout.controls[orientation],
      controlPages: layout.controlPages[orientation],
      audio: {
        speakerVolume: audioState.speakerVolume,
        speakerMuted: audioState.speakerMuted,
        speakerAvailable: audioState.speakerAvailable,
        micVolume: audioState.micVolume,
        micMuted: audioState.micMuted,
        micAvailable: audioState.micAvailable,
        devices: audioState.devices || [],
      },
    });
  }
  function applyState(s, forceRender) {
    var beforeRender = deckRenderSignature();
    if (s.inputSessions) applyInputSessions(s);
    deckRevision = s.revision || deckRevision;
    if (s.appVersion) $('app-version').textContent = 'Version ' + s.appVersion;
    if (s.apps) {
      deckApps = s.apps;
      deckVersion = s.version || deckVersion;
    }
    if (s.audio) audioState = s.audio;
    if (s.metrics) metricsState = s.metrics;
    if (s.weather) weatherState = s.weather;
    applyLayout(s);
    if (typeof s.landscapePage === 'number') pageByOrientation.landscape = s.landscapePage;
    if (typeof s.portraitPage === 'number') pageByOrientation.portrait = s.portraitPage;
    if (s.landscapePages) pagesByOrientation.landscape = s.landscapePages;
    if (s.portraitPages) pagesByOrientation.portrait = s.portraitPages;
    var orientation = admin ? previewOrientation : currentOrientation(false);
    page = pageByOrientation[orientation] || 0;
    serverPages = pagesByOrientation[orientation] || 1;
    if (admin && typeof s.pairingRevision === 'number' && s.pairingRevision !== pairingRevision) {
      pairingRevision = s.pairingRevision;
      refreshPairing();
    }
    if (admin) {
      updatePhoneStatus(s.phoneConnected);
      if (forceRender || beforeRender !== deckRenderSignature()) renderPreview();
      else { updateMetricTiles(); updateWeatherTiles(); }
    } else if (inputInteraction && (forceRender || beforeRender !== deckRenderSignature())) inputRenderDeferred = true;
    else if (!audioInteraction) {
      if (forceRender || beforeRender !== deckRenderSignature()) renderDeck();
      else { updateMetricTiles(); updateWeatherTiles(); }
    }
  }

  function visibleWidgetIds() {
    if (document.hidden) return [];
    var orientation = admin ? previewOrientation : currentOrientation(false);
    return deckApps
      .filter(function (app) {
        var position = app[orientation];
        return (
          app.orientation === orientation &&
          position &&
          position.page === page &&
          (app.type === 'metrics' || app.type === 'weather' || app.type === 'wheel' || app.type === 'touchpad' || app.type === 'keypad')
        );
      })
      .map(function (app) { return app.id; })
      .slice(0, 40);
  }

  function viewQuery() {
    return '&viewId=' + encodeURIComponent(viewId) + '&visibleIds=' + encodeURIComponent(visibleWidgetIds().join(','));
  }

  var announcedViewSignature = '';
  function applyInputSessions(response) {
    if (!response || !response.inputSessions) return;
    var previous = inputSessionByWidget;
    inputSessionByWidget = {};
    response.inputSessions.forEach(function (session) {
      // A response built before an in-flight input was acknowledged must not rewind the sequence.
      var known = previous[session.widgetId];
      if (known && known.sessionId === session.sessionId && known.nextSequence > session.nextSequence)
        session.nextSequence = known.nextSequence;
      inputSessionByWidget[session.widgetId] = session;
    });
  }
  function announceView() {
    if (!key || document.hidden) return Promise.resolve();
    var ids = visibleWidgetIds();
    var signature = ids.join(',');
    if (signature === announcedViewSignature) return Promise.resolve();
    announcedViewSignature = signature;
    return api('view', { viewId: viewId, visibleIds: ids })
      .then(applyInputSessions)
      .catch(function () {
        announcedViewSignature = '';
      });
  }

  function refresh() {
    if (!key) return Promise.resolve();
    return api('state?version=' + encodeURIComponent(deckVersion) + viewQuery())
      .then(function (s) {
        var was = connected;
        connected = true;
        applyState(s, true);
        announceView();
        if (!admin) {
          $('status').textContent = '● ' + s.computer;
          $('status').title = s.computer;
          $('pair').hidden = true;
          $('controls').hidden = false;
          $('offline').hidden = true;
          if (!was) wake();
        }
        startWatch();
      })
      .catch(function (e) {
        connected = false;
        release();
        if (!admin) {
          $('status').textContent = '未接続';
          if ($('controls').hidden) message(e.message);
          else $('offline').hidden = false;
        } else message(e.message);
      });
  }
  function startWatch() {
    if (watchStarted) return;
    watchStarted = true;
    watch();
  }
  function watch() {
    if (!key || document.hidden) {
      watchStarted = false;
      return;
    }
    api('sync?revision=' + deckRevision + viewQuery(), undefined, 22000)
      .then(function (s) {
        if (s.version && s.version !== deckVersion) return refresh();
        applyState(s);
        announceView();
      })
      .catch(function () {
        if (!admin) {
          connected = false;
          release();
          $('offline').hidden = false;
        }
      })
      .finally(function () {
        if (watchStarted) setTimeout(watch, 150);
      });
  }
  function setPage(next) {
    var orientation = admin ? previewOrientation : currentOrientation(false);
    api('page', { page: next, orientation: orientation })
      .then(function (s) {
        page = s.page;
        pageByOrientation[orientation] = s.page;
        pagesByOrientation[orientation] = s.pages || pagesByOrientation[orientation];
        serverPages = s.pages || serverPages;
        deckRevision = s.revision;
        if (admin) renderPreview();
        else renderDeck();
        announceView();
      })
      .catch(function (e) {
        message(e.message);
      });
  }
  function act(action, id, b) {
    b.disabled = true;
    api('action', { action: action, id: id })
      .then(function (result) {
        message(result.message || (action === 'launch' ? '操作を送信しました' : '音量操作を送信しました'));
      })
      .catch(function (e) {
        message(e.message);
        refresh();
      })
      .finally(function () {
        b.disabled = false;
      });
  }

  // Rapid taps on deck buttons can otherwise start an iOS text selection that swallows later taps.
  $('deck').addEventListener('selectstart', function (e) {
    e.preventDefault();
  });
  $('prev-page').onclick = function () {
    setPage(page - 1);
  };
  $('next-page').onclick = function () {
    setPage(page + 1);
  };
  $('preview-prev').onclick = function () {
    setPage(page - 1);
  };
  $('preview-next').onclick = function () {
    setPage(page + 1);
  };
  function setPreviewOrientation(value) {
    pageByOrientation[previewOrientation] = page;
    previewOrientation = value;
    page = pageByOrientation[value] || 0;
    serverPages = pagesByOrientation[value] || 1;
    localStorage.setItem('tapoard-preview-orientation', value);
    syncGridControls();
    renderEditorOrder();
    renderPreview();
    announceView();
  }
  $('preview-landscape').onclick = function () {
    setPreviewOrientation('landscape');
  };
  $('preview-portrait').onclick = function () {
    setPreviewOrientation('portrait');
  };
  function setDeviceMenu(open) {
    if (open) syncGridControls();
    $('device-menu-backdrop').hidden = !open;
    $('device-menu-button').setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('menu-open', open);
  }
  $('device-menu-button').onclick = function () {
    setDeviceMenu(true);
  };
  $('device-menu-close').onclick = function () {
    setDeviceMenu(false);
  };
  $('device-menu-backdrop').onclick = function (e) {
    if (e.target === this) setDeviceMenu(false);
  };
  function closeDeckContextMenu() {
    $('deck-context-menu').hidden = true;
  }
  function contextButton(text, className, action, disabled) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = className || '';
    button.textContent = text;
    button.disabled = !!disabled;
    button.onclick = function (e) {
      e.stopPropagation();
      closeDeckContextMenu();
      action();
    };
    return button;
  }
  function moveAudioControl(target, destination) {
    var orientation = admin ? previewOrientation : currentOrientation(false),
      grid = gridFor(orientation),
      total = grid.columns * grid.rows;
    if (destination < 0 || destination >= total) return;
    var edit = editPageControls(orientation),
      controls = edit.controls,
      otherTarget = target === 'mic' ? 'speaker' : 'mic',
      destinationRow = Math.floor(destination / grid.columns),
      destinationColumn = destination % grid.columns,
      other = controlRect(otherTarget, orientation);
    controls[target + 'Hidden'] = false;
    if (other && destinationRow === other.row && destinationColumn === other.column) {
      controls[otherTarget + 'Row'] = controls[target + 'Row'];
      controls[otherTarget + 'Column'] = controls[target + 'Column'];
      controls[otherTarget + 'Slot'] = controls[target + 'Slot'];
    }
    controls[target + 'Row'] = destinationRow;
    controls[target + 'Column'] = destinationColumn;
    controls[target + 'Slot'] = destination;
    try {
      validatePlacements(rows.map(rowData));
    } catch (e) {
      var blocked = controlConflict(target, orientation);
      edit.revert();
      message(blocked || e.message);
      return;
    }
    saveLayout(
      (orientation === 'portrait' ? '縦' : '横') +
        '向き' + (page + 1) + 'ページ目の' +
        (target === 'mic' ? 'マイク' : 'スピーカー') +
        '位置を保存しました。',
      true,
    );
  }
  function setAudioControlShape(target, width, height, label) {
    var orientation = admin ? previewOrientation : currentOrientation(false),
      edit = editPageControls(orientation),
      controls = edit.controls,
      key = target + 'Size';
    controls[key] = width === height ? width : 1;
    controls[target + 'Width'] = width;
    controls[target + 'Height'] = height;
    try {
      validatePlacements(rows.map(rowData));
    } catch (e) {
      var blocked = controlConflict(target, orientation);
      edit.revert();
      message(blocked || e.message);
      return;
    }
    saveLayout(
      (orientation === 'portrait' ? '縦' : '横') +
        '向き' + (page + 1) + 'ページ目の' +
        (target === 'mic' ? 'マイク' : 'スピーカー') +
        'フェーダーを' +
        label +
        '表示にしました。',
      true,
    );
  }
  function hideAudioControl(target) {
    var orientation = admin ? previewOrientation : currentOrientation(false),
      edit = editPageControls(orientation);
    edit.controls[target + 'Hidden'] = true;
    saveLayout(
      (page + 1) + 'ページ目の' + (target === 'mic' ? 'マイク' : 'スピーカー') +
        'フェーダーを非表示にしました。ショートカット一覧の「このページに表示」で戻せます。',
      true,
    );
  }
  var FADER_SHAPES = [[1, 1, '1マス'], [2, 2, '4マス'], [3, 1, '横3マス'], [4, 1, '横4マス'], [3, 2, '6マス'], [4, 2, '8マス']];
  function openAudioContextMenu(e, target, slot) {
    if (!admin) return;
    e.preventDefault();
    e.stopPropagation();
    var menu = $('deck-context-menu'),
      isMic = target === 'mic',
      display = displayGrid(true),
      rect = controlRect(target, previewOrientation),
      shape = rect.width + 'x' + rect.height,
      column = rect.column,
      row = rect.row;
    menu.textContent = '';
    var head = document.createElement('div');
    head.className = 'context-head';
    var glyph = document.createElement('span');
    glyph.className = 'context-audio-icon';
    glyph.innerHTML = isMic ? micIcon : speakerIcon;
    head.appendChild(glyph);
    var text = document.createElement('span');
    var name = document.createElement('strong');
    name.textContent =
      (previewOrientation === 'portrait' ? '縦向き · ' : '横向き · ') + (isMic ? 'マイク' : 'スピーカー');
    text.appendChild(name);
    var hint = document.createElement('small');
    hint.textContent = '音量フェーダー · ' + (page + 1) + 'ページ目 · ' + (FADER_SHAPES.filter(function (item) { return item[0] + 'x' + item[1] === shape; })[0] || [1, 1, '1マス'])[2];
    text.appendChild(hint);
    head.appendChild(text);
    menu.appendChild(head);
    FADER_SHAPES.forEach(function (item) {
      menu.appendChild(
        contextButton(
          item[2] + '（' + item[0] + '×' + item[1] + '）',
          '',
          function () {
            setAudioControlShape(target, item[0], item[1], item[2]);
          },
          shape === item[0] + 'x' + item[1],
        ),
      );
    });
    menu.appendChild(
      contextButton(
        'このページで非表示',
        '',
        function () {
          hideAudioControl(target);
        },
        false,
      ),
    );
    menu.appendChild(
      contextButton(
        '← 左へ移動',
        '',
        function () {
          moveAudioControl(target, slot - 1);
        },
        column === 0,
      ),
    );
    menu.appendChild(
      contextButton(
        '→ 右へ移動',
        '',
        function () {
          moveAudioControl(target, slot + 1);
        },
        column >= display.columns - rect.width,
      ),
    );
    menu.appendChild(
      contextButton(
        '↑ 上へ移動',
        '',
        function () {
          moveAudioControl(target, slot - display.columns);
        },
        row === 0,
      ),
    );
    menu.appendChild(
      contextButton(
        '↓ 下へ移動',
        '',
        function () {
          moveAudioControl(target, slot + display.columns);
        },
        row >= display.rows - rect.height,
      ),
    );
    menu.hidden = false;
    var width = menu.offsetWidth,
      height = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(e.clientX, window.innerWidth - width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(e.clientY, window.innerHeight - height - 8)) + 'px';
  }
  function openDeckContextMenu(e, index, a) {
    if (!admin) return;
    e.preventDefault();
    e.stopPropagation();
    var menu = $('deck-context-menu');
    menu.textContent = '';
    var head = document.createElement('div');
    head.className = 'context-head';
    head.appendChild(iconNode(a));
    var text = document.createElement('span');
    var name = document.createElement('strong');
    name.textContent = a.name;
    text.appendChild(name);
    var hint = document.createElement('small');
    hint.textContent =
      a.type === 'hotkey'
        ? 'ショートカット'
        : a.type === 'url'
          ? 'URL'
          : a.type === 'clipboard'
            ? 'コピーテキスト'
            : a.type === 'audioDevice'
              ? '音声機器切替'
              : a.type === 'clock'
                ? '時計ウィジェット'
                : a.type === 'metrics'
                  ? 'PC情報ウィジェット'
                  : a.type === 'weather'
                    ? '天気ウィジェット'
                    : a.type === 'wheel'
                      ? 'マウスホイール'
                      : a.type === 'touchpad'
                        ? 'タッチパッド'
                        : a.type === 'keypad'
                          ? 'テンキー'
              : 'アプリ';
    text.appendChild(hint);
    head.appendChild(text);
    menu.appendChild(head);
    if (a.type !== 'clock' && a.type !== 'metrics' && a.type !== 'wheel' && a.type !== 'touchpad' && a.type !== 'keypad')
      menu.appendChild(
        contextButton('アイコンを選ぶ', '', function () {
          if (rows[index]) openIconPicker(rows[index]);
        }),
      );
    var pos = a[previewOrientation],
      cols = displayGrid(true).columns;
    [
      ['← 左', -1],
      ['→ 右', 1],
      ['↑ 上', -cols],
      ['↓ 下', cols],
    ].forEach(function (move) {
      menu.appendChild(
        contextButton(move[0], '', function () {
          moveApp(index, pos.row * cols + pos.column + move[1]);
        }),
      );
    });
    menu.appendChild(
      contextButton('詳細設定を開く', '', function () {
        var row = rows[index];
        if (row) {
          row.box.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.box.classList.add('editor-focus');
          setTimeout(function () {
            row.box.classList.remove('editor-focus');
          }, 1200);
        }
      }),
    );
    menu.appendChild(
      contextButton('ボタンを削除', 'context-delete', function () {
        rows.splice(index, 1);
        renderEditorOrder();
        persistRows(a.name + 'を削除して自動保存しました。');
      }),
    );
    menu.hidden = false;
    var width = menu.offsetWidth,
      height = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(e.clientX, window.innerWidth - width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(e.clientY, window.innerHeight - height - 8)) + 'px';
  }
  $('connect').onclick = function () {
    key = $('key').value.trim();
    if (key.length === 12) key = key.toUpperCase();
    localStorage.setItem('tapoard-key', key);
    fallbackWake();
    refresh();
  };
  $('retry').onclick = function () {
    fallbackWake();
    refresh();
  };
  $('disconnect').onclick = function () {
    setDeviceMenu(false);
    localStorage.removeItem('tapoard-key');
    localStorage.removeItem('streamdeck-key');
    key = '';
    connected = false;
    watchStarted = false;
    release();
    $('controls').hidden = true;
    $('pair').hidden = false;
    $('status').textContent = '未接続';
  };
  // pageOnly sends the current page's faders; otherwise the shared faders are saved.
  function saveLayout(success, pageOnly) {
    var orientation = admin ? previewOrientation : currentOrientation(false),
      controls = pageOnly ? controlsFor(orientation) : layout.controls[orientation === 'portrait' ? 'portrait' : 'landscape'],
      grid = gridFor(orientation),
      body = {
      columns: grid.columns,
      rows: grid.rows,
      keepAwake: layout.keepAwake,
      orientation: orientation,
      speakerSlot: controls.speakerSlot,
      micSlot: controls.micSlot,
      speakerSize: controls.speakerSize,
      micSize: controls.micSize,
      speakerRow: controls.speakerRow,
      speakerColumn: controls.speakerColumn,
      speakerWidth: controls.speakerWidth,
      speakerHeight: controls.speakerHeight,
      micRow: controls.micRow,
      micColumn: controls.micColumn,
      micWidth: controls.micWidth,
      micHeight: controls.micHeight,
    };
    if (pageOnly) {
      body.page = page;
      body.speakerHidden = !!controls.speakerHidden;
      body.micHidden = !!controls.micHidden;
    }
    return api('layout', body)
      .then(function (s) {
        deckRevision = s.revision || deckRevision;
        if (admin)
          return settings().then(function () {
            message(success || '画面の設定を保存しました。');
          });
        applyState(s, true);
        message(success || '画面の設定を保存しました。');
      })
      .catch(function (e) {
        message(e.message);
        refresh();
        return false;
      });
  }
  function layoutChanged(columnsId, rowsId) {
    var orientation = admin ? previewOrientation : currentOrientation(false),
      grid = gridFor(orientation),
      oldColumns = grid.columns,
      oldRows = grid.rows;
    grid.columns = parseInt($(columnsId).value, 10);
    grid.rows = parseInt($(rowsId).value, 10);
    if (!Number.isInteger(grid.columns) || !Number.isInteger(grid.rows)) {
      grid.columns = oldColumns;
      grid.rows = oldRows;
      syncGridControls();
      return;
    }
    saveLayout((orientation === 'portrait' ? '縦' : '横') + '向きの枠数を変更しました。');
  }
  $('grid-columns').onchange = function () {
    layoutChanged('grid-columns', 'grid-rows');
  };
  $('grid-rows').onchange = function () {
    layoutChanged('grid-columns', 'grid-rows');
  };
  $('admin-columns').onchange = function () {
    layoutChanged('admin-columns', 'admin-rows');
  };
  $('admin-rows').onchange = function () {
    layoutChanged('admin-columns', 'admin-rows');
  };
  $('awake').onchange = function () {
    layout.keepAwake = this.checked;
    if (this.checked) wake();
    else release();
    saveLayout();
  };
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopClockUpdates();
      if (key) api('view', { viewId: viewId, visibleIds: [] }).catch(function () {});
      announcedViewSignature = '';
      release();
      watchStarted = false;
    } else if (key) {
      refresh();
      wake();
    } else scheduleClockUpdates();
  });
  document.addEventListener(
    'pointerdown',
    function () {
      if (connected) fallbackWake();
    },
    { passive: true },
  );
  document.addEventListener('click', closeDeckContextMenu);
  document.addEventListener('scroll', closeDeckContextMenu, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      setDeviceMenu(false);
      closeDeckContextMenu();
    }
  });
  window.addEventListener('resize', function () {
    if (!admin && connected) {
      syncGridControls();
      renderDeck();
    }
  });

  var desiredPlacement = null,
    serverPages = 1,
    pairingRevision = -1;
  var iconPickerTarget = null,
    iconPickerColor = '';
  function editorIconData(fields) {
    return {
      name: (fields.name && fields.name.value) || fields.initialName || '',
      type: fields.type,
      category: fields.category,
      icon: fields.icon,
      iconKey: fields.iconKey,
      iconColor: fields.iconColor,
      customIcon: fields.customIcon,
    };
  }
  function refreshEditorIcon(fields) {
    if (!fields.iconHolder) return;
    fields.iconHolder.textContent = '';
    fields.iconHolder.appendChild(iconNode(editorIconData(fields)));
  }
  function closeIconPicker() {
    $('icon-picker-backdrop').hidden = true;
    iconPickerTarget = null;
  }
  function choosePresetIcon(key) {
    if (!iconPickerTarget) return;
    iconPickerTarget.iconKey = key;
    iconPickerTarget.iconColor = iconPickerColor;
    iconPickerTarget.customIcon = '';
    refreshEditorIcon(iconPickerTarget);
    closeIconPicker();
    persistRows(key ? 'アイコンを変更して自動保存しました。' : '自動アイコンへ戻しました。');
  }
  function openIconPicker(fields) {
    iconPickerTarget = fields;
    iconPickerColor = fields.iconColor || '';
    $('icon-picker-current').textContent = (fields.name && fields.name.value) || 'ボタン';
    $('custom-icon-file').value = '';
    $('icon-picker-backdrop').hidden = false;
    renderIconColors();
    Array.prototype.forEach.call($('icon-preset-groups').querySelectorAll('button[data-icon-key]'), function (button) {
      button.classList.toggle('selected', !fields.customIcon && button.dataset.iconKey === fields.iconKey);
      if (button.dataset.iconKey)
        button.replaceChild(presetIconNode(button.dataset.iconKey, fields.iconColor), button.firstChild);
    });
  }
  function useCustomIcon(file) {
    if (!iconPickerTarget || !file) return;
    if (file.size > 5 * 1024 * 1024) {
      message('画像は5MB以内を選んでください。');
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () {
      message('画像を読み込めませんでした。');
    };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () {
        message('画像を読み込めませんでした。');
      };
      img.onload = function () {
        var size = 96,
          canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var context = canvas.getContext('2d'),
          scale = Math.min((size - 8) / img.width, (size - 8) / img.height),
          width = Math.max(1, Math.round(img.width * scale)),
          height = Math.max(1, Math.round(img.height * scale));
        context.clearRect(0, 0, size, size);
        context.drawImage(img, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height);
        var value = canvas.toDataURL('image/png');
        if (value.length > 60000) {
          size = 72;
          canvas.width = size;
          canvas.height = size;
          context = canvas.getContext('2d');
          scale = Math.min((size - 6) / img.width, (size - 6) / img.height);
          width = Math.max(1, Math.round(img.width * scale));
          height = Math.max(1, Math.round(img.height * scale));
          context.drawImage(img, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height);
          value = canvas.toDataURL('image/png');
        }
        if (value.length > 60000) {
          message('画像を小さくしてからもう一度選んでください。');
          return;
        }
        iconPickerTarget.customIcon = value;
        iconPickerTarget.iconKey = '';
        refreshEditorIcon(iconPickerTarget);
        closeIconPicker();
        persistRows('オリジナルアイコンを保存しました。');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  function renderIconPicker() {
    var root = $('icon-preset-groups');
    root.textContent = '';
    var automatic = document.createElement('button');
    automatic.type = 'button';
    automatic.className = 'icon-choice automatic';
    automatic.dataset.iconKey = '';
    automatic.appendChild(shortcutGlyph('app'));
    var autoName = document.createElement('span');
    autoName.textContent = '自動取得';
    automatic.appendChild(autoName);
    automatic.onclick = function () {
      choosePresetIcon('');
    };
    root.appendChild(automatic);
    presetGroups.forEach(function (group) {
      var section = document.createElement('section');
      section.className = 'icon-preset-group';
      var heading = document.createElement('h3');
      heading.textContent = group.title;
      section.appendChild(heading);
      var grid = document.createElement('div');
      grid.className = 'icon-preset-grid';
      group.items.forEach(function (item) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'icon-choice';
        button.dataset.iconKey = item[0];
        button.title = item[2];
        button.appendChild(presetIconNode(item[0]));
        var name = document.createElement('span');
        name.textContent = item[2];
        button.appendChild(name);
        button.onclick = function () {
          choosePresetIcon(item[0]);
        };
        grid.appendChild(button);
      });
      section.appendChild(grid);
      root.appendChild(section);
    });
  }
  $('icon-picker-close').onclick = closeIconPicker;
  $('icon-picker-backdrop').onclick = function (e) {
    if (e.target === this) closeIconPicker();
  };

  function buildClockSettings(fields, box) {
    fields.options = clockOptions({ options: fields.options });
    var area = document.createElement('fieldset');
    area.className = 'clock-settings';
    var legend = document.createElement('legend');
    legend.textContent = '時計の表示';
    area.appendChild(legend);
    function check(name, text) {
      var label = document.createElement('label'),
        input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = fields.options[name];
      label.appendChild(input);
      label.appendChild(document.createTextNode(text));
      area.appendChild(label);
      input.onchange = function () {
        fields.options[name] = input.checked;
        deckApps = rows.map(rowData);
        renderPreview();
      };
      return input;
    }
    check('showSeconds', '秒を表示');
    if (fields.options.style === 'digital') {
      check('showDate', '日付を表示');
      check('showWeekday', '曜日を表示');
      check('hour12', '12時間表示（AM / PM）');
    }
    var note = document.createElement('p');
    note.className = 'editor-feedback';
    note.textContent = 'スマートフォンの時刻を使います。時計のためのPC通信は行いません。';
    area.appendChild(note);
    box.appendChild(area);
  }

  function buildMetricsSettings(fields, box) {
    fields.options = metricOptions({ options: fields.options });
    var area = document.createElement('fieldset');
    area.className = 'metrics-settings';
    var legend = document.createElement('legend');
    legend.textContent = 'PC情報の表示';
    area.appendChild(legend);
    var primaryLabel = document.createElement('label');
    primaryLabel.textContent = '1マスで表示する項目';
    var primary = document.createElement('select');
    [['cpu', 'CPU使用率'], ['memory', 'メモリ使用率'], ['gpu', 'GPU使用率'], ['gpuMemory', 'GPUメモリ使用率']].forEach(function (pair) {
      var option = document.createElement('option');
      option.value = pair[0];
      option.textContent = pair[1];
      primary.appendChild(option);
    });
    primary.value = fields.options.primary;
    primaryLabel.appendChild(primary);
    area.appendChild(primaryLabel);
    var gpuLabel = document.createElement('label');
    gpuLabel.textContent = '表示するGPU';
    var gpuSelect = document.createElement('select'),
      availableGpus = Array.isArray(metricsState.gpus) ? metricsState.gpus : [];
    if (!availableGpus.length) {
      var noGpu = document.createElement('option');
      noGpu.value = '';
      noGpu.textContent = 'GPUを検出中／未対応';
      gpuSelect.appendChild(noGpu);
    }
    availableGpus.forEach(function (gpu) {
      var option = document.createElement('option');
      option.value = gpu.id;
      option.textContent = gpu.name || gpu.id;
      gpuSelect.appendChild(option);
    });
    // A stale saved id resolves to the same-named (or first) GPU; saving stores its current id.
    var resolvedGpu = selectedGpu(fields.options.gpuId, fields.options.gpuName);
    if (!availableGpus.length && fields.options.gpuId) {
      var savedGpu = document.createElement('option');
      savedGpu.value = fields.options.gpuId;
      savedGpu.textContent = fields.options.gpuName || '保存済みのGPU';
      gpuSelect.appendChild(savedGpu);
    }
    gpuSelect.value = resolvedGpu ? resolvedGpu.id : fields.options.gpuId || '';
    gpuLabel.appendChild(gpuSelect);
    area.appendChild(gpuLabel);
    var cycleLabel = document.createElement('label'),
      cycle = document.createElement('input');
    cycle.type = 'checkbox';
    cycle.checked = fields.options.cycle;
    cycleLabel.appendChild(cycle);
    cycleLabel.appendChild(document.createTextNode('CPUとメモリを自動で切り替える'));
    area.appendChild(cycleLabel);
    function previewMetrics() {
      fields.options.primary = primary.value;
      fields.options.cycle = cycle.checked;
      fields.options.gpuId = gpuSelect.value;
      var chosenGpu = availableGpus.filter(function (gpu) { return gpu && gpu.id === gpuSelect.value; })[0];
      if (chosenGpu) fields.options.gpuName = String(chosenGpu.name || '').slice(0, 128);
      else if (typeof fields.options.gpuName !== 'string') fields.options.gpuName = '';
      gpuLabel.hidden = primary.value !== 'gpu' && primary.value !== 'gpuMemory' && (fields.width !== 2 || fields.height !== 2);
      deckApps = rows.map(rowData);
      renderPreview();
    }
    primary.onchange = previewMetrics;
    cycle.onchange = previewMetrics;
    gpuSelect.onchange = previewMetrics;
    previewMetrics();
    var note = document.createElement('p');
    note.className = 'editor-feedback';
    note.textContent = '4マスではCPU・メモリ・選択したGPUと直近60秒のグラフを表示します。表示中だけPCから2秒ごとに取得します。';
    area.appendChild(note);
    box.appendChild(area);
  }

  function buildWheelSettings(fields, box) {
    fields.options = wheelOptions({ options: fields.options });
    var rotary = fields.options.style === 'rotary',
      area = document.createElement('fieldset');
    area.className = 'wheel-settings';
    var legend = document.createElement('legend');
    legend.textContent = rotary ? '円形ホイールの操作' : '縦型ホイールの操作';
    area.appendChild(legend);
    function changed() {
      deckApps = rows.map(rowData);
      renderPreview();
    }
    var sensitivityLabel = document.createElement('label'),
      sensitivity = document.createElement('input'),
      sensitivityValue = document.createElement('span');
    sensitivityLabel.textContent = rotary ? '1目盛りの回転角' : '1目盛りのスワイプ距離';
    sensitivity.type = 'range';
    sensitivity.min = rotary ? 6 : 8;
    sensitivity.max = rotary ? 90 : 120;
    sensitivity.value = Math.max(Number(sensitivity.min), Math.min(Number(sensitivity.max), fields.options.sensitivity));
    function showSensitivity() {
      fields.options.sensitivity = Number(sensitivity.value);
      sensitivityValue.textContent = sensitivity.value + (rotary ? '°（小さいほど敏感）' : 'px（小さいほど敏感）');
    }
    sensitivity.oninput = showSensitivity;
    sensitivity.onchange = changed;
    showSensitivity();
    sensitivityLabel.appendChild(sensitivity);
    sensitivityLabel.appendChild(sensitivityValue);
    area.appendChild(sensitivityLabel);
    var amountLabel = document.createElement('label'),
      amount = document.createElement('select');
    amountLabel.textContent = '1目盛りのスクロール量';
    for (var step = 1; step <= 10; step++) {
      var option = document.createElement('option');
      option.value = step;
      option.textContent = step + '段';
      amount.appendChild(option);
    }
    amount.value = fields.options.multiplier;
    amount.onchange = function () {
      fields.options.multiplier = Number(amount.value);
      changed();
    };
    amountLabel.appendChild(amount);
    area.appendChild(amountLabel);
    function check(name, text) {
      var label = document.createElement('label'),
        input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = fields.options[name];
      input.dataset.option = name;
      label.appendChild(input);
      label.appendChild(document.createTextNode(text));
      area.appendChild(label);
      input.onchange = function () {
        fields.options[name] = input.checked;
        changed();
      };
    }
    check('reverse', 'スクロール方向を反転');
    check('ctrl', 'Ctrlを押しながら（拡大・縮小など）');
    check('shift', 'Shiftを押しながら（横スクロールなど）');
    check('alt', 'Altを押しながら');
    check('middleClick', rotary ? '中央タップで中クリック' : 'タップで中クリック');
    var note = document.createElement('p');
    note.className = 'editor-feedback';
    note.textContent = rotary
      ? '円の縁をなぞると回した角度だけスクロールします。中央付近は反応しません。'
      : '上下にスワイプするとPCのマウスホイールとして動きます。スクロール量と修飾キーはPC側の設定で決まります。';
    area.appendChild(note);
    box.appendChild(area);
  }

  function buildTouchpadSettings(fields, box) {
    fields.options = touchpadOptions({ options: fields.options });
    var area = document.createElement('fieldset');
    area.className = 'wheel-settings touchpad-settings';
    var legend = document.createElement('legend');
    legend.textContent = 'タッチパッドの操作';
    area.appendChild(legend);
    function changed() {
      deckApps = rows.map(rowData);
      renderPreview();
    }
    var speedLabel = document.createElement('label'),
      speed = document.createElement('input'),
      speedValue = document.createElement('span');
    speedLabel.textContent = 'ポインターの速さ';
    speed.type = 'range';
    speed.min = 1;
    speed.max = 10;
    speed.value = fields.options.speed;
    speed.oninput = function () {
      fields.options.speed = Number(speed.value);
      speedValue.textContent = speed.value;
    };
    speed.onchange = changed;
    speedValue.textContent = speed.value;
    speedLabel.appendChild(speed);
    speedLabel.appendChild(speedValue);
    area.appendChild(speedLabel);
    var longLabel = document.createElement('label'),
      longPress = document.createElement('select');
    longLabel.textContent = '長押し';
    [['none', '何もしない'], ['rightClick', '右クリック'], ['drag', 'ドラッグ開始']].forEach(function (pair) {
      var option = document.createElement('option');
      option.value = pair[0];
      option.textContent = pair[1];
      longPress.appendChild(option);
    });
    longPress.value = fields.options.longPress;
    longPress.onchange = function () {
      fields.options.longPress = longPress.value;
      changed();
    };
    longLabel.appendChild(longPress);
    area.appendChild(longLabel);
    [
      ['acceleration', '速く動かすと遠くまで動く（加速）'],
      ['tapToClick', 'タップでクリック（2本指タップで右クリック、タップ後に触れて動かすとドラッグ）'],
      ['twoFingerScroll', '2本指の上下でスクロール'],
      ['reverseScroll', 'スクロール方向を反転'],
    ].forEach(function (pair) {
      var label = document.createElement('label'),
        input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = fields.options[pair[0]];
      input.dataset.option = pair[0];
      label.appendChild(input);
      label.appendChild(document.createTextNode(pair[1]));
      area.appendChild(label);
      input.onchange = function () {
        fields.options[pair[0]] = input.checked;
        changed();
      };
    });
    var note = document.createElement('p');
    note.className = 'editor-feedback';
    note.textContent = '操作中は他の端末から横取りされません。指を離すと他の端末が操作できます（通信が切れた場合は約2秒後）。';
    area.appendChild(note);
    box.appendChild(area);
  }

  function createEditor(a) {
    var box = document.createElement('div');
    box.className = 'editor';
    var fields = {
      id: a.id || '',
      orientation: a.orientation || previewOrientation,
      landscape: a.landscape || null,
      portrait: a.portrait || null,
      size: a.size || 1,
      width: a.width || a.size || 1,
      height: a.height || a.size || 1,
      fontSize: a.fontSize || 11,
      iconScale: a.iconScale || 82,
      labelOpacity: typeof a.labelOpacity === 'number' ? a.labelOpacity : 45,
      hideLabel: !!a.hideLabel,
      hotkey: a.hotkey || '',
      box: box,
      type: a.type || 'app',
      action: a.action || '',
      category: a.category || 'app',
      icon: a.icon || null,
      iconKey: a.iconKey || '',
      customIcon: a.customIcon || '',
      iconColor: a.iconColor || '',
      deviceTarget: a.deviceTarget || 'speaker',
      deviceId: { value: a.deviceId || '' },
      deviceName: a.deviceName || '',
      options: a.options || null,
      initialName: a.name || '',
    };
    var heading = document.createElement('div');
    heading.className = 'editor-heading';
    var iconHolder = document.createElement('span');
    iconHolder.className = 'editor-icon-holder';
    fields.iconHolder = iconHolder;
    heading.appendChild(iconHolder);
    var title = document.createElement('strong');
    title.textContent = a.name || '新しいボタン';
    heading.appendChild(title);
    var kind = document.createElement('span');
    kind.className = 'editor-kind';
    kind.textContent =
      fields.type === 'hotkey'
        ? (fields.category || 'shortcut').toUpperCase()
        : fields.type === 'url'
          ? 'URL'
          : fields.type === 'clipboard'
            ? 'COPY'
            : fields.type === 'audioDevice'
              ? 'AUDIO'
              : fields.type === 'clock'
                ? 'CLOCK'
                : fields.type === 'metrics'
                  ? 'METRICS'
                  : fields.type === 'weather'
                    ? 'WEATHER'
                    : fields.type === 'wheel'
                      ? 'WHEEL'
                      : fields.type === 'touchpad'
                        ? 'TOUCHPAD'
                      : fields.type === 'keypad'
                        ? 'KEYPAD'
              : 'APP';
    heading.appendChild(kind);
    box.appendChild(heading);
    var definitions = [['name', '表示名', 'input']];
    if (fields.type === 'app')
      definitions.push(['path', '実行ファイル・ショートカット', 'input'], ['args', '起動引数（任意）', 'input']);
    else if (fields.type === 'url') definitions.push(['url', '開くURL（http:// または https://）', 'url']);
    else if (fields.type === 'clipboard') definitions.push(['text', 'コピーするテキスト', 'textarea']);
    definitions.forEach(function (f) {
      var label = document.createElement('label');
      label.textContent = f[1];
      var input = document.createElement(f[2] === 'textarea' ? 'textarea' : 'input');
      if (f[2] === 'url') {
        input.type = 'url';
        input.placeholder = 'https://example.com/';
      }
      if (f[2] === 'textarea') {
        input.rows = 5;
        input.maxLength = 32768;
      }
      input.value = a[f[0]] || '';
      label.appendChild(input);
      box.appendChild(label);
      fields[f[0]] = input;
    });
    if (fields.type === 'audioDevice') buildDeviceSelector(fields, box);
    if (fields.type === 'clock') buildClockSettings(fields, box);
    if (fields.type === 'metrics') buildMetricsSettings(fields, box);
    if (fields.type === 'wheel') buildWheelSettings(fields, box);
    if (fields.type === 'touchpad') buildTouchpadSettings(fields, box);
    if (fields.type === 'weather') {
      fields.options = fields.options || { forecastMode: 'days' };
      var weatherNote = document.createElement('p');
      weatherNote.className = 'editor-feedback';
      weatherNote.textContent = fields.width === 2 && fields.height === 2 ? '3日分の最高・最低気温と降水確率を表示します。' : '現在の気温と今日の降水確率を表示します。';
      box.appendChild(weatherNote);
      var locate = document.createElement('button');
      locate.type = 'button';
      locate.className = 'subtle weather-locate';
      locate.textContent = weatherLocation.configured ? '地域を変更（' + weatherLocation.name + '）' : '地域を設定する';
      locate.onclick = focusWeatherLocation;
      box.appendChild(locate);
    }
    buildAppearance(fields, box);
    if (fields.type === 'hotkey' && fields.action.indexOf('audio-') !== 0) buildHotkey(fields, box);
    ['path', 'args', 'url', 'text'].forEach(function (name) {
      if (!fields[name]) fields[name] = { value: '' };
    });
    fields.name.oninput = function () {
      title.textContent = this.value || '新しいボタン';
      refreshEditorIcon(fields);
    };
    refreshEditorIcon(fields);
    if (fields.type !== 'clock' && fields.type !== 'metrics' && fields.type !== 'weather' && fields.type !== 'wheel' && fields.type !== 'touchpad' && fields.type !== 'keypad') {
      var iconButton = document.createElement('button');
      iconButton.type = 'button';
      iconButton.className = 'subtle icon-select-button';
      iconButton.textContent = '▦ アイコンを選ぶ';
      iconButton.onclick = function () {
        openIconPicker(fields);
      };
      box.appendChild(iconButton);
    }
    [-1, 1].forEach(function (direction) {
      var move = document.createElement('button');
      move.textContent = direction < 0 ? '← 左へ移動' : '右へ移動 →';
      move.className = 'subtle';
      move.onclick = function () {
        var pos = fields[previewOrientation];
        moveApp(rows.indexOf(fields), pos.row * displayGrid(true).columns + pos.column + direction);
      };
      box.appendChild(move);
    });
    var del = document.createElement('button');
    del.textContent = '削除';
    del.className = 'subtle danger';
    del.onclick = function () {
      rows = rows.filter(function (r) {
        return r !== fields;
      });
      renderEditorOrder();
      persistRows('削除して自動保存しました。');
    };
    box.appendChild(del);
    return fields;
  }
  function renderEditorOrder() {
    $('editors').textContent = '';
    rows.forEach(function (r) {
      if (r.orientation === previewOrientation) $('editors').appendChild(r.box);
    });
  }
  function editor(a, index) {
    a.orientation = a.orientation || previewOrientation;
    assignPlacement(a, rows.map(rowData), desiredPlacement);
    desiredPlacement = null;
    var fields = createEditor(a);
    if (typeof index === 'number') rows.splice(index, 0, fields);
    else rows.push(fields);
    renderEditorOrder();
    deckApps = rows.map(rowData);
    renderPreview();
    return fields;
  }
  function rowData(r) {
    return {
      id: r.id,
      orientation: r.orientation,
      landscape: r.landscape,
      portrait: r.portrait,
      size: r.size,
      width: r.width,
      height: r.height,
      fontSize: r.fontSize,
      iconScale: r.iconScale,
      labelOpacity: r.labelOpacity,
      hideLabel: r.hideLabel,
      hotkey: r.hotkey,
      name: r.name.value.trim(),
      path: r.path.value.trim(),
      args: r.args.value,
      url: r.url.value.trim(),
      text: r.text.value,
      type: r.type,
      action: r.action,
      category: r.category,
      iconKey: r.iconKey || '',
      iconColor: r.iconColor || '',
      deviceId: r.deviceId.value,
      deviceTarget: r.deviceTarget,
      deviceName: r.deviceName,
      customIcon: r.customIcon || '',
      options: r.options,
    };
  }
  function persistRows(success) {
    var apps = rows.map(rowData);
    try {
      validatePlacements(apps);
    } catch (e) {
      message(e.message);
      return Promise.resolve(false);
    }
    deckApps = apps;
    renderPreview();
    saveQueue = saveQueue
      .catch(function () {})
      .then(function () {
        return api('settings', { apps: apps });
      })
      .then(function () {
        return settings();
      })
      .then(function () {
        message(success || '自動保存しました。');
        return true;
      })
      .catch(function (e) {
        message('自動保存できませんでした。 ' + e.message);
        return false;
      });
    return saveQueue;
  }

  function renderCatalog() {
    var root = $('shortcut-groups'),
      previous = root.querySelectorAll('details.shortcut-group'),
      opened = {};
    // Saving re-renders the catalog; keep whichever groups the user had open.
    Array.prototype.forEach.call(previous, function (details) {
      opened[details.dataset.group] = details.open;
    });
    root.textContent = '';
    catalog.forEach(function (group, groupIndex) {
      var details = document.createElement('details');
      details.className = 'shortcut-group';
      details.dataset.group = group.title;
      details.open = previous.length ? !!opened[group.title] : groupIndex === 0;
      var summary = document.createElement('summary');
      summary.appendChild(shortcutGlyph(group.category, group.glyph));
      var text = document.createElement('span');
      text.innerHTML = '<strong>' + group.title + '</strong><small>' + group.note + '</small>';
      summary.appendChild(text);
      details.appendChild(summary);
      var list = document.createElement('div');
      list.className = 'shortcut-list';
      group.items.forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'shortcut-row';
        row.draggable = true;
        row.dataset.action = item[0];
        row.addEventListener('dragstart', function (e) {
          row.classList.add('dragging');
          e.dataTransfer.effectAllowed = controlFromAction(item[0]) ? 'move' : 'copy';
          e.dataTransfer.setData('text/plain', item[0]);
        });
        row.addEventListener('dragend', function () {
          row.classList.remove('dragging');
        });
        var label = document.createElement('div');
        label.innerHTML = '<strong>' + item[1] + '</strong><kbd>' + item[2] + '</kbd>';
        var add = document.createElement('button'),
          control = controlFromAction(item[0]),
          custom = customTypeFromAction(item[0]),
          widget = widgetFromAction(item[0]);
        add.textContent = control ? 'このページに表示' : '追加';
        add.onclick = function () {
          if (control) {
            // Shows a hidden fader again where it was on this page.
            var current = controlsFor(admin ? previewOrientation : currentOrientation(false));
            moveAudioControl(control, current[control + 'Slot'] || 0);
            return;
          }
          if (custom) {
            addCustomEditor(custom);
            return;
          }
          if (widget) {
            if (addWidgetEditor(item[0])) persistRows(widget.name + 'を追加して自動保存しました。');
            return;
          }
          if (
            rows.filter(function (r) {
              return r.orientation === previewOrientation;
            }).length >= 40
          ) {
            message('ボタンはこの向きで40個以内です。');
            return;
          }
          var index = Math.min(rows.length, (page + 1) * appsPerPage);
          editor(
            {
              name: item[1],
              type: 'hotkey',
              action: item[0],
              category: group.category,
              iconKey: defaultIconForAction(item[0], group.category),
            },
            index,
          );
          persistRows(item[1] + 'を追加して自動保存しました。');
        };
        row.appendChild(label);
        row.appendChild(add);
        list.appendChild(row);
      });
      details.appendChild(list);
      root.appendChild(details);
    });
  }
  function drawPairQr(url, canvasId, statusId) {
    function draw() {
      try {
        var code = qrcode(0, 'M');
        code.addData(url, 'Byte');
        code.make();
        var modules = code.getModuleCount(),
          quiet = 4,
          canvas = $(canvasId),
          cell = Math.max(3, Math.floor(220 / (modules + quiet * 2))),
          size = (modules + quiet * 2) * cell,
          context = canvas.getContext('2d');
        canvas.width = size;
        canvas.height = size;
        context.fillStyle = '#fff';
        context.fillRect(0, 0, size, size);
        context.fillStyle = '#101216';
        for (var row = 0; row < modules; row++)
          for (var column = 0; column < modules; column++)
            if (code.isDark(row, column)) context.fillRect((column + quiet) * cell, (row + quiet) * cell, cell, cell);
        $(statusId).textContent = 'カメラで読み取ってください';
      } catch (e) {
        $(statusId).textContent = 'QRコードを作成できませんでした';
      }
    }
    if (typeof qrcode === 'function') {
      draw();
      return;
    }
    var script = document.createElement('script');
    script.src = '/qrcode.js';
    script.onload = draw;
    script.onerror = function () {
      $(statusId).textContent = 'QRコードを読み込めませんでした';
    };
    document.head.appendChild(script);
  }
  function settings() {
    return api('settings?' + viewQuery().slice(1))
      .then(function (s) {
        $('token').value = s.token;
        drawPairQr(s.iphoneQrUrl || s.qrUrl, 'pair-qr-iphone', 'qr-status-iphone');
        drawPairQr(s.androidQrUrl || s.qrUrl, 'pair-qr-android', 'qr-status-android');
        $('lan-url').textContent = s.lanUrl;
        $('lan-url').href = s.lanUrl;
        $('network-status').textContent = s.networkStatus;
        if (s.weatherLocation) weatherLocation = s.weatherLocation;
        renderWeatherLocation();
        $('ip-urls').textContent = '';
        (s.ipUrls || []).forEach(function (url) {
          var a = document.createElement('a');
          a.href = url;
          a.textContent = url;
          $('ip-urls').appendChild(a);
        });
        applyLayout(s);
        ensurePlacements(s.apps || []);
        rows = [];
        (s.apps || []).forEach(function (a) {
          rows.push(createEditor(a));
        });
        renderEditorOrder();
        applyState(s, true);
        announceView();
        refreshDeviceSelectors();
        renderCatalog();
        startWatch();
      })
      .catch(function (e) {
        message('トレイの「設定をブラウザで開く」から開き直してください。 ' + e.message);
      });
  }
  function renderWeatherLocation() {
    if (!admin) return;
    $('weather-current-location').textContent = weatherLocation.configured
      ? '設定中：' + weatherLocation.name + '（' + weatherLocation.timezone + '）'
      : '地域が未設定です。検索して候補を選んでください。';
  }
  function weatherError(text) {
    var error = document.createElement('p');
    error.className = 'weather-error';
    error.setAttribute('role', 'alert');
    error.textContent = text;
    $('weather-results').textContent = '';
    $('weather-results').appendChild(error);
  }
  $('weather-search').onclick = function () {
    var query = $('weather-query').value.trim();
    if (query.length < 2) {
      weatherError('地域名を2文字以上入力してください（例：札幌、横浜）。');
      $('weather-query').focus();
      return;
    }
    $('weather-results').textContent = '検索中…';
    api('weather/search', { query: query })
      .then(function (response) {
        $('weather-results').textContent = '';
        if (!response.results || !response.results.length) {
          $('weather-results').textContent = '候補が見つかりませんでした。「札幌市」「東京都」のように市・都・府・県まで入れるか、ローマ字（Sapporo）で試してください。';
          return;
        }
        response.results.forEach(function (result) {
          var button = document.createElement('button');
          button.type = 'button'; button.className = 'subtle weather-result';
          button.textContent = [result.name, result.region, result.country].filter(Boolean).join('、');
          button.onclick = function () {
            button.disabled = true;
            api('weather/location', result)
              .then(function (saved) {
                weatherLocation = saved.weatherLocation;
                renderWeatherLocation();
                $('weather-results').textContent = '地域を保存しました。天気部品を表示すると予報を取得します。';
                refresh();
              })
              .catch(function (e) { button.disabled = false; weatherError('保存できませんでした：' + e.message); });
          };
          $('weather-results').appendChild(button);
        });
      })
      .catch(function (e) { weatherError('検索できませんでした：' + e.message); });
  };
  $('weather-query').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('weather-search').click(); } };
  $('add').onclick = function () {
    editor({ type: 'app', category: 'app' });
  };
  $('add-url').onclick = function () {
    addCustomEditor('url');
  };
  $('add-text').onclick = function () {
    addCustomEditor('clipboard');
  };
  $('save').onclick = function () {
    persistRows('保存しました。スマートフォンの画面にも反映されます。').then(function (ok) {
      if (ok) $('phone-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  var importTimer, importTicket, importIndex;
  function setImportBusy(busy) {
    $('preview-add').disabled = busy;
  }
  function startImport(index, slot) {
    desiredPlacement =
      typeof slot === 'number'
        ? { orientation: previewOrientation, position: positionAt(page, slot, displayGrid(true).columns) }
        : null;
    clearTimeout(importTimer);
    importIndex =
      typeof index === 'number' ? Math.min(index, rows.length) : Math.min(rows.length, (page + 1) * appsPerPage);
    setImportBusy(true);
    api('import', {})
      .then(function (s) {
        importTicket = s.id;
        $('import-status').textContent = '開いたウィンドウにアイコンをドロップするか、URLを入力してください。';
        pollImport();
      })
      .catch(function (e) {
        setImportBusy(false);
        $('import-status').textContent = e.message;
      });
  }
  $('preview-add').onclick = function () {
    startImport();
  };
  function pollImport() {
    api('import')
      .then(function (s) {
        if (s.id !== importTicket) {
          $('import-status').textContent = '別の設定画面で追加が開始されました。';
          setImportBusy(false);
          return;
        }
        if (!s.result) {
          importTimer = setTimeout(pollImport, 1000);
          return;
        }
        setImportBusy(false);
        if (s.result.cancelled) {
          $('import-status').textContent = '追加をキャンセルしました。';
          return;
        }
        var count = 0,
          skipped = 0,
          at = importIndex;
        (s.result.apps || []).forEach(function (a) {
          if (
            rows.some(function (r) {
              if (r.orientation !== previewOrientation || r.type !== a.type) return false;
              return a.type === 'url'
                ? r.url.value.trim() === a.url
                : r.path.value.toLowerCase() === a.path.toLowerCase();
            })
          ) {
            skipped++;
            return;
          }
          editor(a, at++);
          count++;
        });
        if (!count) {
          $('import-status').textContent =
            '追加する新しいボタンはありませんでした。' +
            (skipped ? ' この向きに登録済みの' + skipped + '個はスキップしました。' : '');
          return;
        }
        persistRows(count + '個のボタンを追加して自動保存しました。').then(function (ok) {
          $('import-status').textContent = ok
            ? count +
              '個追加して自動保存しました。' +
              (skipped ? ' この向きに登録済みの' + skipped + '個はスキップしました。' : '')
            : '追加しましたが、自動保存に失敗しました。';
        });
      })
      .catch(function (e) {
        setImportBusy(false);
        $('import-status').textContent = e.message;
      });
  }
  $('copy').onclick = function () {
    if (!navigator.clipboard) {
      $('token').select();
      message('接続キーを選択しました。コピーしてください。');
      return;
    }
    navigator.clipboard
      .writeText($('token').value)
      .then(function () {
        message('コピーしました');
      })
      .catch(function () {
        $('token').select();
        message('接続キーを選択しました。コピーしてください。');
      });
  };
  $('rotate').onclick = function () {
    if (confirm('既存端末の接続を解除し、新しいキーを発行しますか？'))
      api('rotate', {})
        .then(settings)
        .catch(function (e) {
          message(e.message);
        });
  };
  $('custom-icon-file').onchange = function () {
    if (this.files && this.files[0]) useCustomIcon(this.files[0]);
  };

  function currentOrientation(preview) {
    return preview ? previewOrientation : window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }
  function gridFor(orientation) {
    return layout.grids[orientation === 'portrait' ? 'portrait' : 'landscape'];
  }
  function controlsFor(orientation, pageIndex) {
    var o = orientation === 'portrait' ? 'portrait' : 'landscape';
    return layout.controlPages[o][typeof pageIndex === 'number' ? pageIndex : page] || layout.controls[o];
  }
  function allControls(orientation) {
    var o = orientation === 'portrait' ? 'portrait' : 'landscape',
      pages = layout.controlPages[o];
    return [layout.controls[o]].concat(Object.keys(pages).map(function (key) { return pages[key]; }));
  }
  // Page edits work on that page's own copy; revert() undoes a rejected edit.
  function editPageControls(orientation) {
    var o = orientation === 'portrait' ? 'portrait' : 'landscape',
      pages = layout.controlPages[o],
      existing = pages[page],
      before = existing ? Object.assign({}, existing) : null;
    if (!existing) pages[page] = Object.assign({ page: page, speakerHidden: false, micHidden: false }, layout.controls[o]);
    return {
      controls: pages[page],
      revert: function () {
        if (before) pages[page] = before;
        else delete pages[page];
      },
    };
  }
  function positionAt(pageIndex, slot, cols) {
    return { page: pageIndex, row: Math.floor(slot / cols), column: slot % cols };
  }
  // null when the page hides this fader.
  function controlRect(target, orientation, pageIndex) {
    var grid = gridFor(orientation),
      controls = controlsFor(orientation, pageIndex);
    if (controls[target + 'Hidden']) return null;
    var slot = controls[target + 'Slot'],
      size = controls[target + 'Size'] || 1;
    return {
      row: typeof controls[target + 'Row'] === 'number' ? controls[target + 'Row'] : Math.floor(slot / grid.columns),
      column: typeof controls[target + 'Column'] === 'number' ? controls[target + 'Column'] : slot % grid.columns,
      width: controls[target + 'Width'] || size,
      height: controls[target + 'Height'] || size,
      rows: grid.rows,
      columns: grid.columns,
    };
  }
  // Names the button on this page that is in the fader's way.
  function controlConflict(target, orientation) {
    var rect = controlRect(target, orientation),
      hit = rect && rows.map(rowData).filter(function (a) {
        var p = a[orientation];
        return (a.orientation || 'landscape') === orientation && p && p.page === page &&
          rectOverlap({ row: p.row, column: p.column, width: a.width || a.size || 1, height: a.height || a.size || 1 }, rect);
      })[0];
    if (!hit) return '';
    return (hit[orientation].page + 1) + 'ページ目の「' + (hit.name || 'ボタン') + '」と重なるため動かせません。先にそのボタンを別の枠へ移動してください。';
  }
  function rectOverlap(a, b) {
    return (
      !!a && !!b &&
      a.row < b.row + b.height && a.row + a.height > b.row && a.column < b.column + b.width && a.column + a.width > b.column
    );
  }
  function controlsFit(orientation) {
    var o = orientation === 'portrait' ? 'portrait' : 'landscape';
    function inside(rect) {
      return !rect || (rect.row >= 0 && rect.column >= 0 && rect.row + rect.height <= rect.rows && rect.column + rect.width <= rect.columns);
    }
    return [-1].concat(Object.keys(layout.controlPages[o]).map(Number)).every(function (pageIndex) {
      var speaker = controlRect('speaker', o, pageIndex),
        mic = controlRect('mic', o, pageIndex);
      return inside(speaker) && inside(mic) && !rectOverlap(speaker, mic);
    });
  }
  function canPlace(apps, index, pos, width, height, orientation) {
    var grid = gridFor(orientation);
    width = width || 1;
    height = height || 1;
    if (
      !pos ||
      pos.page < 0 ||
      pos.page >= 40 ||
      pos.row < 0 ||
      pos.column < 0 ||
      pos.row + height > grid.rows ||
      pos.column + width > grid.columns
    )
      return false;
    var tile = { row: pos.row, column: pos.column, width: width, height: height };
    if (rectOverlap(tile, controlRect('speaker', orientation, pos.page)) || rectOverlap(tile, controlRect('mic', orientation, pos.page)))
      return false;
    return !apps.some(function (a, i) {
      var p = a[orientation],
        w = a.width || a.size || 1,
        h = a.height || a.size || 1;
      return (
        i !== index &&
        p &&
        p.page === pos.page &&
        p.row < pos.row + height &&
        p.row + h > pos.row &&
        p.column < pos.column + width &&
        p.column + w > pos.column
      );
    });
  }
  function findSpace(apps, index, width, height, orientation, startPage) {
    var grid = gridFor(orientation);
    for (var p = startPage || 0; p < 40; p++)
      for (var slot = 0; slot < grid.columns * grid.rows; slot++) {
        var pos = positionAt(p, slot, grid.columns);
        if (canPlace(apps, index, pos, width, height, orientation)) return pos;
      }
    throw Error('空き枠がありません。');
  }
  function assignPlacement(a, apps, desired) {
    a.size = a.size || 1;
    a.width = a.width || a.size;
    a.height = a.height || a.size;
    var o = a.orientation || previewOrientation;
    if (a[o]) return;
    var pos = desired && desired.orientation === o ? desired.position : findSpace(apps, -1, a.width, a.height, o, page);
    if (!canPlace(apps, -1, pos, a.width, a.height, o)) throw Error('空き枠へ配置してください。');
    a[o] = { page: pos.page, row: pos.row, column: pos.column };
  }
  function ensurePlacements(apps) {
    apps.forEach(function (a, i) {
      a.size = a.size || 1;
      a.width = a.width || a.size;
      a.height = a.height || a.size;
      var o = a.orientation || 'landscape';
      if (!a[o]) a[o] = findSpace(apps, i, a.width, a.height, o, 0);
    });
  }
  function validatePlacements(apps) {
    ['landscape', 'portrait'].forEach(function (o) {
      if (!controlsFit(o))
        throw Error(
          (o === 'portrait' ? '縦' : '横') +
            '配置でフェーダー同士が重なるか枠からはみ出します。先に空き枠へ移動してください。',
        );
    });
    apps.forEach(function (a, i) {
      var o = a.orientation || 'landscape';
      if (!canPlace(apps, i, a[o], a.width || a.size || 1, a.height || a.size || 1, o))
        throw Error((o === 'portrait' ? '縦' : '横') + '配置で重なるか枠からはみ出します。空き枠へ移動してください。');
    });
  }
  function layoutPages() {
    var o = admin ? previewOrientation : currentOrientation(false),
      count = pagesByOrientation[o] || 1;
    deckApps.forEach(function (a) {
      if (a.orientation === o && a[o]) count = Math.max(count, a[o].page + 1);
    });
    return count;
  }
  function moveApp(index, slot) {
    var fields = rows[index],
      grid = displayGrid(true);
    if (!fields || fields.orientation !== previewOrientation || slot < 0 || slot >= grid.columns * grid.rows) return;
    var pos = positionAt(page, slot, grid.columns);
    if (!canPlace(rows.map(rowData), index, pos, fields.width, fields.height, previewOrientation)) {
      message('空いている枠へ移動してください。');
      return;
    }
    fields[previewOrientation] = pos;
    persistRows('位置を保存しました。');
  }
  function applyAppearance(tile, a, preview) {
    var grid = displayGrid(preview),
      root = preview ? $('preview-deck') : $('deck'),
      gap = preview ? 8 : 9,
      cell = Math.max(28, (root.clientWidth - gap * (grid.columns - 1)) / grid.columns),
      font = ((a.fontSize || 11) * cell) / 100,
      opacity = typeof a.labelOpacity === 'number' ? Math.max(0, Math.min(100, a.labelOpacity)) : 45,
      alpha = opacity / 100;
    tile.setAttribute('aria-label', a.name);
    tile.classList.toggle('label-hidden', !!a.hideLabel);
    var label = tile.querySelector('.key-label');
    label.style.fontSize = Math.max(5, font) + 'px';
    label.style.background =
      'linear-gradient(transparent,rgba(5,6,8,' + Math.max(0, alpha * 0.75) + ') 45%,rgba(5,6,8,' + alpha + '))';
    label.hidden = !!a.hideLabel;
    var icon = tile.querySelector('.app-icon,.preset-icon,.shortcut-icon,.icon-fallback');
    if (icon) {
      icon.style.width = (a.iconScale || 82) + '%';
      icon.style.height = (a.iconScale || 82) + '%';
      icon.style.maxWidth = 'none';
      icon.style.maxHeight = 'none';
      icon.style.fontSize = (cell * Math.min(a.width || a.size || 1, a.height || a.size || 1) * (a.iconScale || 82)) / 180 + 'px';
    }
  }
  function buildAppearance(fields, box) {
    var area = document.createElement('fieldset');
    area.className = 'appearance-settings';
    var legend = document.createElement('legend');
    legend.textContent = 'サイズと配置';
    area.appendChild(legend);
    var status = document.createElement('p');
    status.className = 'editor-feedback';
    status.setAttribute('role', 'status');
    function preview() {
      deckApps = rows.map(rowData);
      renderPreview();
    }
    function select(labelText, name, options) {
      var label = document.createElement('label');
      label.textContent = labelText;
      var input = document.createElement('select');
      input.className = 'appearance-' + name;
      options.forEach(function (pair) {
        var op = document.createElement('option');
        op.value = pair[0];
        op.textContent = pair[1];
        input.appendChild(op);
      });
      input.value = fields[name];
      input.onchange = function () {
        var old = fields[name],
          oldWidth = fields.width,
          oldHeight = fields.height,
          oldPosition = fields[fields.orientation];
        fields[name] = Number(input.value);
        if (name === 'size') {
          fields.width = fields.type === 'clock' ? 2 : fields.size;
          fields.height = fields.size;
        }
        try {
          validatePlacements(rows.map(rowData));
          status.textContent = '「設定を保存」で反映します。';
          preview();
        } catch (e) {
          if (name === 'size' && fields.size === 2) {
            try {
              var candidate = findSpace(
                rows.map(rowData),
                rows.indexOf(fields),
                fields.width,
                fields.height,
                fields.orientation,
                oldPosition ? oldPosition.page : 0,
              );
              fields[fields.orientation] = candidate;
              validatePlacements(rows.map(rowData));
              page = candidate.page;
              pageByOrientation[fields.orientation] = page;
              status.textContent = fields.width + '×' + fields.height + 'の空き枠へ自動移動しました。「設定を保存」で反映します。';
              preview();
              return;
            } catch (ignore) {
              fields[fields.orientation] = oldPosition;
            }
          }
          fields[name] = old;
          fields.width = oldWidth;
          fields.height = oldHeight;
          input.value = old;
          status.textContent = e.message;
        }
      };
      label.appendChild(input);
      area.appendChild(label);
    }
    if (fields.type !== 'keypad')
      select(
        fields.type === 'clock' ? '時計の大きさ' : 'ボタンの大きさ',
        'size',
        fields.type === 'clock'
          ? fields.options && fields.options.style === 'analog'
            ? [[2, '4マス（2×2）']]
            : [
                [1, '横長2マス（2×1）'],
                [2, '4マス（2×2）'],
              ]
          : [
              [1, '1マス（1×1）'],
              [2, '4マス（2×2）'],
            ],
      );
    select('文字サイズ', 'fontSize', [
      [8, '小さめ 8'],
      [11, '標準 11'],
      [14, '大きめ 14'],
      [18, '特大 18'],
      [22, '22'],
      [28, '28'],
    ]);
    select('アイコンの大きさ', 'iconScale', [
      [20, '20%'],
      [40, '40%'],
      [60, '60%'],
      [82, '標準 82%'],
      [100, '100%'],
    ]);
    var opacityLabel = document.createElement('label'),
      opacityText = document.createElement('span'),
      opacityInput = document.createElement('input');
    opacityLabel.className = 'opacity-setting';
    opacityText.textContent = '文字背景の濃さ ' + fields.labelOpacity + '%';
    opacityInput.type = 'range';
    opacityInput.min = 0;
    opacityInput.max = 100;
    opacityInput.step = 5;
    opacityInput.value = fields.labelOpacity;
    opacityInput.className = 'appearance-labelOpacity';
    opacityInput.oninput = function () {
      fields.labelOpacity = Number(this.value);
      opacityText.textContent = '文字背景の濃さ ' + fields.labelOpacity + '%';
      status.textContent = '「設定を保存」で反映します。';
      preview();
    };
    opacityLabel.appendChild(opacityText);
    opacityLabel.appendChild(opacityInput);
    area.appendChild(opacityLabel);
    var label = document.createElement('label'),
      check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = fields.hideLabel;
    check.className = 'appearance-hideLabel';
    label.appendChild(check);
    label.appendChild(document.createTextNode('文字を表示しない（アイコンのみ）'));
    check.onchange = function () {
      fields.hideLabel = check.checked;
      status.textContent = '「設定を保存」で反映します。';
      preview();
    };
    area.appendChild(label);
    var placement = document.createElement('div');
    placement.className = 'placement-settings';
    var orient = document.createElement('select');
    [[fields.orientation, fields.orientation === 'portrait' ? '縦の配置' : '横の配置']].forEach(function (v) {
      var op = document.createElement('option');
      op.value = v[0];
      op.textContent = v[1];
      orient.appendChild(op);
    });
    orient.value = fields.orientation;
    placement.appendChild(orient);
    var inputs = {};
    [
      ['page', 'ページ', 40],
      ['row', '行', 8],
      ['column', '列', 8],
    ].forEach(function (v) {
      var l = document.createElement('label');
      l.textContent = v[1];
      var input = document.createElement('input');
      input.type = 'number';
      input.min = 1;
      input.max = v[2];
      input.className = 'placement-' + v[0];
      l.appendChild(input);
      placement.appendChild(l);
      inputs[v[0]] = input;
    });
    function sync() {
      var p = fields[orient.value] || { page: 0, row: 0, column: 0 };
      Object.keys(inputs).forEach(function (k) {
        inputs[k].value = p[k] + 1;
      });
    }
    orient.onchange = sync;
    sync();
    var move = document.createElement('button');
    move.type = 'button';
    move.className = 'subtle';
    move.textContent = '配置を適用';
    move.onclick = function () {
      var p = {
        page: Number(inputs.page.value) - 1,
        row: Number(inputs.row.value) - 1,
        column: Number(inputs.column.value) - 1,
      };
      if (
        !Object.keys(p).every(function (k) {
          return Number.isInteger(p[k]);
        }) ||
        !canPlace(rows.map(rowData), rows.indexOf(fields), p, fields.width, fields.height, orient.value)
      ) {
        status.textContent = '空いている範囲内のマスを指定してください。';
        return;
      }
      fields[orient.value] = p;
      previewOrientation = orient.value;
      page = p.page;
      status.textContent = '「設定を保存」で反映します。';
      preview();
    };
    placement.appendChild(move);
    area.appendChild(placement);
    area.appendChild(status);
    box.appendChild(area);
  }
  function buildHotkey(fields, box) {
    var area = document.createElement('fieldset');
    area.className = 'hotkey-settings';
    var legend = document.createElement('legend');
    legend.textContent = 'ショートカットキー';
    area.appendChild(legend);
    var standard = catalogItem(fields.action),
      display = document.createElement('p');
    display.className = 'hotkey-current';
    area.appendChild(display);
    function show() {
      display.textContent = fields.hotkey || '標準：' + (standard ? standard.item[2] : fields.action);
    }
    show();
    var mods = {};
    ['Ctrl', 'Shift', 'Alt', 'Win'].forEach(function (k) {
      var label = document.createElement('label'),
        input = document.createElement('input');
      input.type = 'checkbox';
      mods[k] = input;
      label.appendChild(input);
      label.appendChild(document.createTextNode(k));
      area.appendChild(label);
    });
    var select = document.createElement('select');
    select.className = 'hotkey-main';
    var names = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
    for (var i = 1; i <= 24; i++) names.push('F' + i);
    names = names.concat([
      'Enter',
      'Tab',
      'Escape',
      'Space',
      'Backspace',
      'Delete',
      'Insert',
      'Home',
      'End',
      'PageUp',
      'PageDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'PrintScreen',
      'Pause',
      'CapsLock',
      'Semicolon',
      'Equal',
      'Comma',
      'Minus',
      'Period',
      'Slash',
      'Backquote',
      'BracketLeft',
      'Backslash',
      'BracketRight',
      'Quote',
      'MediaPlayPause',
      'MediaTrackNext',
      'MediaTrackPrevious',
      'MediaStop',
    ]);
    names.forEach(function (k) {
      var op = document.createElement('option');
      op.value = k;
      op.textContent = k;
      select.appendChild(op);
    });
    area.appendChild(select);
    function sync() {
      var parts = fields.hotkey.split('+');
      Object.keys(mods).forEach(function (k) {
        mods[k].checked = parts.indexOf(k) >= 0;
      });
      if (parts.length && names.indexOf(parts[parts.length - 1]) >= 0) select.value = parts[parts.length - 1];
    }
    sync();
    function change() {
      fields.hotkey = Object.keys(mods)
        .filter(function (k) {
          return mods[k].checked;
        })
        .concat([select.value])
        .join('+');
      show();
    }
    Object.keys(mods).forEach(function (k) {
      mods[k].onchange = change;
    });
    select.onchange = change;
    var record = document.createElement('input');
    record.className = 'hotkey-record';
    record.readOnly = true;
    record.placeholder = 'ここを選んでキーを押す';
    record.setAttribute('aria-label', 'キーを押して登録');
    record.onkeydown = function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (['Control', 'Shift', 'Alt', 'Meta'].indexOf(e.key) >= 0) return;
      var code = e.code || '',
        main = /^Key[A-Z]$/.test(code) ? code.slice(3) : /^Digit[0-9]$/.test(code) ? code.slice(5) : code;
      if (names.indexOf(main) < 0) {
        record.value = '一覧から選択してください';
        return;
      }
      mods.Ctrl.checked = e.ctrlKey;
      mods.Shift.checked = e.shiftKey;
      mods.Alt.checked = e.altKey;
      mods.Win.checked = e.metaKey;
      select.value = main;
      change();
      record.value = fields.hotkey;
    };
    area.appendChild(record);
    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'subtle';
    reset.textContent = '標準に戻す';
    reset.onclick = function () {
      fields.hotkey = '';
      record.value = '';
      sync();
      show();
    };
    area.appendChild(reset);
    var hint = document.createElement('p');
    hint.textContent =
      '変更後は「設定を保存」。ブラウザが受け取れないキーは一覧から指定できます。記号キーはPCのキーボード配列により異なります。Ctrl+Alt+Deleteは対象外です。';
    area.appendChild(hint);
    box.appendChild(area);
  }
  var pairTimer = null,
    pairAttempt = null;
  function pairFetch(path, body, secret) {
    return fetch('/api/pair/' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (secret || key) },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().then(function (s) {
        if (!r.ok) throw Error(s.error || '接続承認に失敗しました。');
        return s;
      });
    });
  }
  function pollPair() {
    clearTimeout(pairTimer);
    if (!pairAttempt || document.hidden) return;
    if (Date.now() > Date.parse(pairAttempt.expires)) {
      pairAttempt = null;
      $('pair-request').disabled = false;
      $('pair-progress').textContent = '期限が切れました。もう一度リクエストしてください。';
      return;
    }
    pairFetch('status?id=' + encodeURIComponent(pairAttempt.id), null, pairAttempt.secret)
      .then(function (s) {
        if (s.status === 'approved') {
          key = s.token;
          localStorage.setItem('tapoard-key', key);
          pairAttempt = null;
          $('pair-request').disabled = false;
          $('pair-progress').textContent = '承認されました。';
          refresh();
        } else if (s.status === 'denied') {
          pairAttempt = null;
          $('pair-request').disabled = false;
          $('pair-progress').textContent = 'PCで接続が拒否されました。';
        } else pairTimer = setTimeout(pollPair, 2000);
      })
      .catch(function (e) {
        $('pair-progress').textContent = e.message;
        if (pairAttempt) pairTimer = setTimeout(pollPair, 3000);
      });
  }
  $('pair-request').onclick = function () {
    this.disabled = true;
    $('pair-progress').textContent = 'リクエスト中…';
    pairFetch('start', { name: $('pair-name').value.trim() || 'スマートフォン' })
      .then(function (s) {
        pairAttempt = s;
        $('pair-progress').textContent =
          '確認番号 ' + s.code + ' — PCの設定画面で同じ番号を確認し「許可」を押してください（3分以内）。';
        pollPair();
      })
      .catch(function (e) {
        $('pair-request').disabled = false;
        $('pair-progress').textContent = e.message;
      });
  };
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) clearTimeout(pairTimer);
    else if (pairAttempt) pollPair();
  });
  function refreshPairing() {
    if (!admin) return;
    pairFetch('manage')
      .then(renderPairing)
      .catch(function (e) {
        $('pair-admin-status').textContent = e.message;
      });
  }
  function renderPairing(s) {
    pairingRevision = s.revision;
    var pending = $('pair-pending'),
      devices = $('paired-devices');
    pending.textContent = '';
    devices.textContent = '';
    $('pair-admin-status').textContent = (s.pending || []).length
      ? 'スマホの確認番号と一致するリクエストだけ許可してください。'
      : '接続待ちの端末はありません。';
    (s.pending || []).forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'pair-request-row';
      var name = document.createElement('strong');
      name.textContent = p.code + ' · ' + p.name;
      row.appendChild(name);
      var info = document.createElement('small');
      info.textContent = p.address + ' / ' + new Date(p.expires).toLocaleTimeString() + 'まで';
      row.appendChild(info);
      [true, false].forEach(function (approve) {
        var b = document.createElement('button');
        b.textContent = approve ? '許可' : '拒否';
        b.className = approve ? '' : 'subtle';
        b.onclick = function () {
          b.disabled = true;
          pairFetch('manage', { id: p.id, code: p.code, approve: approve })
            .then(renderPairing)
            .catch(function (e) {
              b.disabled = false;
              $('pair-admin-status').textContent = e.message;
            });
        };
        row.appendChild(b);
      });
      pending.appendChild(row);
    });
    (s.devices || []).forEach(function (d) {
      var row = document.createElement('div');
      row.className = 'pair-request-row';
      var text = document.createElement('span');
      text.textContent = d.name + ' · 登録 ' + new Date(d.created).toLocaleDateString();
      row.appendChild(text);
      var b = document.createElement('button');
      b.className = 'subtle';
      b.textContent = '接続を解除';
      b.onclick = function () {
        pairFetch('manage', { id: d.id, revoke: true })
          .then(renderPairing)
          .catch(function (e) {
            $('pair-admin-status').textContent = e.message;
          });
      };
      row.appendChild(b);
      devices.appendChild(row);
    });
  }
  $('pair-refresh').onclick = refreshPairing;
  $('preview-new-page').onclick = function () {
    setPage(layoutPages());
  };
  // 3.0 PC window: full-window deck, mouse wheel pages, and the info overlay the window toggles.
  function setupPcWindow() {
    document.body.classList.add('pc-window');
    var info = document.createElement('div'),
      badge = document.createElement('div'),
      frames = 0,
      fps = 0,
      since = performance.now(),
      raf = null,
      pingTimer = null,
      wheelRest = 0,
      wheelAt = 0;
    info.id = 'pc-info';
    info.hidden = true;
    info.setAttribute('aria-live', 'off');
    badge.id = 'pc-view-only';
    badge.hidden = true;
    badge.textContent = '見るだけモード　Ctrl+Alt+V で戻す';
    document.body.appendChild(info);
    document.body.appendChild(badge);
    function ms(value) {
      return value === null ? '—' : value + ' ms';
    }
    function render() {
      info.textContent =
        '描画 ' + fps + ' fps\n' +
        'PC との往復 ' + ms(pcStats.ping) + '\n' +
        '最後の操作 ' + ms(pcStats.action) + '\n' +
        (connected ? '接続中' : '未接続');
    }
    function tick(now) {
      frames++;
      if (now - since >= 1000) {
        fps = Math.round((frames * 1000) / (now - since));
        frames = 0;
        since = now;
        render();
      }
      raf = requestAnimationFrame(tick);
    }
    function ping() {
      var started = Date.now();
      api('ping')
        .then(function () { pcStats.ping = Date.now() - started; })
        .catch(function () { pcStats.ping = null; })
        .finally(render);
    }
    window.tapoardPc = {
      set: function (s) {
        s = s || {};
        var on = !!s.info;
        info.hidden = !on;
        if (on && raf === null) {
          since = performance.now();
          frames = 0;
          raf = requestAnimationFrame(tick);
          ping();
          pingTimer = setInterval(ping, 2000);
        } else if (!on && raf !== null) {
          cancelAnimationFrame(raf);
          clearInterval(pingTimer);
          raf = null;
        }
        document.body.classList.toggle('pc-fill', s.aspect === 'fill');
        badge.hidden = !s.viewOnly;
        render();
      },
    };
    // The window has no browser menu; a right click never opens one.
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // Wheel over the deck (not over a wheel or touchpad widget) turns the page.
    $('controls').addEventListener('wheel', function (e) {
      if (e.ctrlKey) {
        e.preventDefault();
        return;
      }
      if (!$('device-menu-backdrop').hidden) return;
      e.preventDefault();
      var now = Date.now();
      if (now - wheelAt > 400) wheelRest = 0;
      wheelAt = now;
      wheelRest += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      if (Math.abs(wheelRest) < 80) return;
      var next = page + (wheelRest > 0 ? 1 : -1);
      wheelRest = 0;
      if (next < 0 || next >= pageCount) return;
      setPage(next);
    }, { passive: false });
  }
  if (pcWindow) setupPcWindow();
  // 3.0 settings page: firewall help under the QR codes and the PC window entry.
  function firewallText(s) {
    var where = s.networks ? '（' + s.networks + '）' : '',
      parts = [];
    if (s.profile === 'public') parts.push('いまのネットワーク' + where + 'は「パブリック」です。手順 1 で「プライベート」にしてください。');
    else if (s.profile === 'private') parts.push('いまのネットワーク' + where + 'は「プライベート」です。');
    else if (s.profile === 'domain') parts.push('いまのネットワーク' + where + 'は「ドメイン」です。会社のネットワークでは管理者の設定が優先されます。');
    else parts.push('ネットワークの種類を確認できませんでした。');
    if (s.rulesChecked)
      parts.push(s.httpRule && s.mdnsRule ? 'TaPoard の通信の許可は登録されています。' : 'TaPoard の通信の許可が見つかりません。「はい」で追加してください。');
    if (s.blockRules) parts.push('TaPoard を止める設定が ' + s.blockRules + ' 件あります。「はい」で取り除けます。');
    if (s.blockAllInbound && s.profile === 'public') parts.push('パブリック ネットワークでは「すべての着信接続をブロック」がオンになっています。');
    return parts.join(' ');
  }
  function refreshFirewall() {
    return api('firewall', undefined, 15000)
      .then(function (s) {
        $('firewall-status').textContent = firewallText(s);
        $('firewall-yes').disabled = !s.scriptAvailable || s.repair === 'running';
        if (!s.scriptAvailable) $('firewall-result').textContent = 'この TaPoard には許可を追加するスクリプトがありません。インストーラーから入れた TaPoard で実行してください。';
        return s;
      })
      .catch(function (e) {
        $('firewall-status').textContent = e.message;
      });
  }
  function waitForRepair() {
    setTimeout(function () {
      refreshFirewall().then(function (s) {
        if (!s) return;
        $('firewall-result').textContent = s.repairMessage || '';
        if (s.repair === 'running') waitForRepair();
      });
    }, 1500);
  }
  function closeFirewallHelp() {
    $('firewall-backdrop').hidden = true;
  }
  if (admin) {
    $('firewall-help').onclick = function () {
      $('firewall-backdrop').hidden = false;
      $('firewall-result').textContent = '';
      $('firewall-status').textContent = 'この PC の状態を確認しています…';
      refreshFirewall();
    };
    $('firewall-close').onclick = closeFirewallHelp;
    $('firewall-no').onclick = closeFirewallHelp;
    $('firewall-backdrop').addEventListener('click', function (e) {
      if (e.target === $('firewall-backdrop')) closeFirewallHelp();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('firewall-backdrop').hidden) closeFirewallHelp();
    });
    $('firewall-yes').onclick = function () {
      $('firewall-yes').disabled = true;
      api('firewall/repair', {}, 15000)
        .then(function (s) {
          $('firewall-result').textContent = s.repairMessage || '';
          waitForRepair();
        })
        .catch(function (e) {
          $('firewall-result').textContent = e.message;
          $('firewall-yes').disabled = false;
        });
    };
    $('open-pc-window').onclick = function () {
      api('pc-window/open', { fullscreen: false }, 15000)
        .then(function () { message('PC 用ウィンドウを開きました。'); })
        .catch(function (e) { message(e.message); });
    };
    $('pc-window-settings-link').onclick = function () {
      this.href = '/pc-window#' + key;
    };
  }
  if (admin) {
    $('pair').hidden = true;
    $('settings').hidden = false;
    $('status').textContent = 'PC SETTINGS';
    renderIconPicker();
    settings();
    refreshPairing();
  } else if (key) refresh();
})();
