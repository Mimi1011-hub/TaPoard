(function () {
  'use strict';
  var $ = function (id) {
    return document.getElementById(id);
  };
  var admin = location.pathname === '/settings';
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
  var timer,
    lock = null,
    noSleep = null,
    connected = false,
    rows = [],
    deckApps = [],
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
    audioInteraction = false,
    messageTimer = null;
  if (admin) {
    document.body.classList.add('admin-view');
    sessionStorage.setItem('tapoard-admin', key);
    history.replaceState(null, '', '/settings');
  } else if (key) {
    localStorage.setItem('tapoard-key', key);
    if (scannedKey) history.replaceState(null, '', '/');
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
      hasBody = data !== undefined;
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

  function shortcutGlyph(category) {
    var s = document.createElement('span');
    s.className = 'shortcut-icon ' + (category || 'app');
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
    track.querySelector('.fader-level').style.height = value + '%';
    track.querySelector('.fader-thumb').style.bottom = 'calc(' + value + '% - 5px)';
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
      return tile;
    }
    if (!available) return tile;
    var tracking = false,
      moved = false,
      startY = 0,
      current = value,
      pending = null,
      inFlight = false,
      sendTimer = null,
      lastSent = 0,
      finishing = false;
    function pointY(e) {
      var list =
        e && e.touches && e.touches.length
          ? e.touches
          : e && e.changedTouches && e.changedTouches.length
            ? e.changedTouches
            : null;
      return list ? list[0].clientY : e && typeof e.clientY === 'number' ? e.clientY : null;
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
    function updateAt(y, e) {
      if (typeof y !== 'number' || !isFinite(y)) return;
      var rect = track.getBoundingClientRect();
      if (!rect.height) return;
      current = Math.round(Math.max(0, Math.min(100, ((rect.bottom - y) * 100) / rect.height)));
      setFaderVisual(track, current);
      label.textContent = current + '%';
      tile.classList.toggle('adjusting', moved);
      if (moved) queue(false);
      if (e && e.cancelable) e.preventDefault();
    }
    function begin(e) {
      if (e.target && e.target.closest && e.target.closest('.audio-mute')) return;
      tracking = true;
      moved = false;
      audioInteraction = true;
      startY = pointY(e);
      if (e.pointerId !== undefined && tile.setPointerCapture)
        try {
          tile.setPointerCapture(e.pointerId);
        } catch (ignore) {}
      if (e.cancelable) e.preventDefault();
    }
    function move(e) {
      if (!tracking) return;
      var y = pointY(e);
      if (typeof y !== 'number') return;
      if (Math.abs(y - startY) > 3) moved = true;
      if (moved) updateAt(y, e);
    }
    function end(e) {
      if (!tracking) return;
      var y = pointY(e);
      if (moved && typeof y === 'number') updateAt(y, e);
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
        custom = customTypeFromAction(value);
      if (control) {
        moveAudioControl(control, slotIndex);
        return;
      }
      if (
        !canPlace(rows.map(rowData), -1, positionAt(page, slotIndex, displayGrid(true).columns), 1, 1, previewOrientation)
      ) {
        message('空き枠へドロップしてください。');
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
      orientation = currentOrientation(preview),
      controls = controlsFor(orientation);
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
      var slot = controls[target + 'Slot'],
        tile = audioFader(target, preview, slot);
      if (preview) {
        addControlDropTarget(tile, slot);
        tile.draggable = true;
        tile.ondragstart = function (e) {
          e.dataTransfer.setData('text/plain', 'control-' + target + '-fader');
        };
      }
      var rect = controlRect(target, orientation);
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
      controls = controlsFor(orientation),
      minimumColumns = Math.max(2, controls.speakerWidth || controls.speakerSize || 1, controls.micWidth || controls.micSize || 1),
      minimumRows = Math.max(2, controls.speakerHeight || controls.speakerSize || 1, controls.micHeight || controls.micSize || 1);
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
      if (!source) return;
      var speakerSlot = source.speakerSlot || 0,
        micSlot = typeof source.micSlot === 'number' ? source.micSlot : 1,
        speakerSize = source.speakerSize || 1,
        micSize = source.micSize || 1;
      layout.controls[o] = {
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
    });
    $('awake').checked = layout.keepAwake;
    syncGridControls();
  }
  function applyState(s) {
    deckRevision = s.revision || deckRevision;
    if (s.appVersion) $('app-version').textContent = 'Version ' + s.appVersion;
    if (s.apps) {
      deckApps = s.apps;
      deckVersion = s.version || deckVersion;
    }
    if (s.audio) audioState = s.audio;
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
      renderPreview();
    } else if (!audioInteraction) renderDeck();
  }

  function refresh() {
    if (!key) return Promise.resolve();
    return api('state?version=' + encodeURIComponent(deckVersion))
      .then(function (s) {
        var was = connected;
        connected = true;
        applyState(s);
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
    api('sync?revision=' + deckRevision, undefined, 22000)
      .then(function (s) {
        if (s.version && s.version !== deckVersion) return refresh();
        applyState(s);
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
      total = grid.columns * grid.rows,
      controls = controlsFor(orientation);
    if (destination < 0 || destination >= total) return;
    var otherTarget = target === 'mic' ? 'speaker' : 'mic',
      before = Object.assign({}, controls),
      destinationRow = Math.floor(destination / grid.columns),
      destinationColumn = destination % grid.columns,
      other = controlRect(otherTarget, orientation);
    if (destinationRow === other.row && destinationColumn === other.column) {
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
      Object.assign(controls, before);
      message(e.message);
      return;
    }
    saveLayout(
      (orientation === 'portrait' ? '縦' : '横') +
        '向きの' +
        (target === 'mic' ? 'マイク' : 'スピーカー') +
        '位置を保存しました。',
    );
  }
  function setAudioControlSize(target, size) {
    var orientation = admin ? previewOrientation : currentOrientation(false),
      controls = controlsFor(orientation),
      key = target + 'Size',
      before = Object.assign({}, controls);
    controls[key] = size;
    controls[target + 'Width'] = size;
    controls[target + 'Height'] = size;
    try {
      validatePlacements(rows.map(rowData));
    } catch (e) {
      Object.assign(controls, before);
      message(e.message);
      return;
    }
    saveLayout(
      (orientation === 'portrait' ? '縦' : '横') +
        '向きの' +
        (target === 'mic' ? 'マイク' : 'スピーカー') +
        'フェーダーを' +
        (size === 2 ? '4マス' : '1マス') +
        '表示にしました。',
    );
  }
  function openAudioContextMenu(e, target, slot) {
    if (!admin) return;
    e.preventDefault();
    e.stopPropagation();
    var menu = $('deck-context-menu'),
      isMic = target === 'mic',
      display = displayGrid(true),
      rect = controlRect(target, previewOrientation),
      size = rect.width === rect.height ? rect.width : 1,
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
    hint.textContent = '音量フェーダー · ' + (size === 2 ? '4マス' : '1マス');
    text.appendChild(hint);
    head.appendChild(text);
    menu.appendChild(head);
    menu.appendChild(
      contextButton(
        '1マス（1×1）',
        '',
        function () {
          setAudioControlSize(target, 1);
        },
        size === 1,
      ),
    );
    menu.appendChild(
      contextButton(
        '4マス（2×2）',
        '',
        function () {
          setAudioControlSize(target, 2);
        },
        size === 2,
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
              : 'アプリ';
    text.appendChild(hint);
    head.appendChild(text);
    menu.appendChild(head);
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
  function saveLayout(success) {
    var orientation = admin ? previewOrientation : currentOrientation(false),
      controls = controlsFor(orientation),
      grid = gridFor(orientation);
    return api('layout', {
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
    })
      .then(function (s) {
        deckRevision = s.revision || deckRevision;
        if (admin)
          return settings().then(function () {
            message(success || '画面の設定を保存しました。');
          });
        applyState(s);
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
      release();
      watchStarted = false;
    } else if (key) {
      refresh();
      wake();
    }
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
    var iconButton = document.createElement('button');
    iconButton.type = 'button';
    iconButton.className = 'subtle icon-select-button';
    iconButton.textContent = '▦ アイコンを選ぶ';
    iconButton.onclick = function () {
      openIconPicker(fields);
    };
    box.appendChild(iconButton);
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
    var root = $('shortcut-groups');
    root.textContent = '';
    catalog.forEach(function (group, groupIndex) {
      var details = document.createElement('details');
      details.className = 'shortcut-group';
      details.open = groupIndex === 0;
      var summary = document.createElement('summary');
      summary.appendChild(shortcutGlyph(group.category));
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
          custom = customTypeFromAction(item[0]);
        add.textContent = control ? '標準位置へ' : '追加';
        add.onclick = function () {
          if (control) {
            moveAudioControl(control, control === 'speaker' ? 0 : 1);
            return;
          }
          if (custom) {
            addCustomEditor(custom);
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
    return api('settings')
      .then(function (s) {
        $('token').value = s.token;
        drawPairQr(s.iphoneQrUrl || s.qrUrl, 'pair-qr-iphone', 'qr-status-iphone');
        drawPairQr(s.androidQrUrl || s.qrUrl, 'pair-qr-android', 'qr-status-android');
        $('lan-url').textContent = s.lanUrl;
        $('lan-url').href = s.lanUrl;
        $('network-status').textContent = s.networkStatus;
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
        applyState(s);
        refreshDeviceSelectors();
        renderCatalog();
        startWatch();
      })
      .catch(function (e) {
        message('トレイの「設定をブラウザで開く」から開き直してください。 ' + e.message);
      });
  }
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
        $('import-status').textContent = '開いたウィンドウにアイコンをドロップしてください。';
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
              return (
                r.orientation === previewOrientation &&
                r.type === 'app' &&
                r.path.value.toLowerCase() === a.path.toLowerCase()
              );
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
            '追加する新しいアプリはありませんでした。' +
            (skipped ? ' この向きに登録済みの' + skipped + '個はスキップしました。' : '');
          return;
        }
        persistRows(count + '個のアプリを追加して自動保存しました。').then(function (ok) {
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
  function controlsFor(orientation) {
    return layout.controls[orientation === 'portrait' ? 'portrait' : 'landscape'];
  }
  function positionAt(pageIndex, slot, cols) {
    return { page: pageIndex, row: Math.floor(slot / cols), column: slot % cols };
  }
  function controlRect(target, orientation) {
    var grid = gridFor(orientation),
      controls = controlsFor(orientation),
      slot = controls[target + 'Slot'],
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
  function rectOverlap(a, b) {
    return (
      a.row < b.row + b.height && a.row + a.height > b.row && a.column < b.column + b.width && a.column + a.width > b.column
    );
  }
  function controlsFit(orientation) {
    var speaker = controlRect('speaker', orientation),
      mic = controlRect('mic', orientation);
    return (
      speaker.row >= 0 && speaker.column >= 0 && mic.row >= 0 && mic.column >= 0 &&
      speaker.row + speaker.height <= speaker.rows &&
      speaker.column + speaker.width <= speaker.columns &&
      mic.row + mic.height <= mic.rows &&
      mic.column + mic.width <= mic.columns &&
      !rectOverlap(speaker, mic)
    );
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
    if (rectOverlap(tile, controlRect('speaker', orientation)) || rectOverlap(tile, controlRect('mic', orientation)))
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
        if (name === 'size') fields.width = fields.height = fields.size;
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
              status.textContent = '4マス分の空き枠へ自動移動しました。「設定を保存」で反映します。';
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
    select('ボタンの大きさ', 'size', [
      [1, '1マス（1×1）'],
      [2, '4マス（2×2）'],
    ]);
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
  if (admin) {
    $('pair').hidden = true;
    $('settings').hidden = false;
    $('status').textContent = 'PC SETTINGS';
    renderIconPicker();
    settings();
    refreshPairing();
  } else if (key) refresh();
})();
