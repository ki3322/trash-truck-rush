# 垃圾車來了！Trash Truck Rush Taiwan

> 台灣人的極限運動 — 聽到垃圾車音樂，從高樓衝下樓，把垃圾袋丟進移動中的垃圾車！

手機直向為主的 HTML5 網頁遊戲（Phaser 3 + TypeScript + Vite）。免下載、免註冊，所有美術與音效都由程式即時繪製／合成，不依賴任何外部素材。

開發規格（優化後的 prompt）見 [PROMPT.md](PROMPT.md)。

## 快速開始

需要 Node.js 20 以上。

```bash
npm install
npm run dev          # 本機開發 http://localhost:5173（--host 可用手機連同一 Wi-Fi 測試）
npm test             # 單元測試（Vitest）
npm run test:coverage
npx playwright install chromium-headless-shell   # 第一次跑 E2E 前
npm run test:e2e     # E2E 測試（Playwright，會自動啟動 dev server）
npm run build        # 型別檢查 + 正式建置到 dist/
npm run preview      # 預覽正式建置
```

## 操作說明

| 階段 | 手機 | 電腦 |
|---|---|---|
| 垃圾分類 | 點【垃圾袋】／【回收桶】，或把卡片往左／右滑 | `A`（垃圾袋）／`D`（回收桶） |
| 衝下樓 | 左右交替點【左腳】【右腳】 | 交替按 `A` / `D`（或 ← →） |
| 突發事件 | 點畫面中央的事件按鈕 | `空白鍵`（或 `W` / ↑） |
| 垃圾袋快破了 | 停下來不要踩，等穩住條集滿 | 同左 |
| 追垃圾車 | **左手**按住【追垃圾車！】 | 按住 `D` / → |
| 瞄準＋蓄力＋丟出 | **右手**按住【丟垃圾】開始蓄力，同一根手指**上下滑**調角度，放開就丟（彈弓式；手指滑出按鈕也不會中斷）。兩手可同時操作 | 在畫面上按住左鍵拖曳（同時瞄準＋蓄力），或 `W`/`S` 調角度＋按住 `空白鍵` |

- 同一隻腳連按會踉蹌、短暫停住。
- 垃圾車停靠約 1 秒後開走：越晚丟距離越遠、分數越高，但也越難中。一局有 3 袋機會。
- 只有「由上往下掉進投入口」才算命中，但垃圾袋會反彈：打到車頂、投入口邊緣、車身或地面都會彈起來，彈進去一樣算（還有「反彈進車」+200）。袋子停下來、被車頂載走、或彈超過 5 次才算沒中。

## 手機優先設計

- **雙拇指操作**：左手按住【追垃圾車！】、右手按住【丟垃圾】上下滑瞄準，兩個動作可以同時進行；第一次玩會出現操作提示。
- **填滿長螢幕**：邏輯畫面寬 720，高度依手機比例在 1280～1600 之間自動調整（19.5:9 手機不會有上下黑邊），HUD 貼齊上緣、按鈕貼齊下緣。
- **避開瀏海與 Home 條**：遊戲區域扣掉 `safe-area-inset`。
- **震動回饋**（Android）：踉蹌、事件、分錯、反彈、命中都會震；首頁可關閉。iOS Safari 不支援震動，所以不顯示開關。
- **防誤觸**：禁止雙指縮放、雙擊縮放、長按選單、下拉重新整理；橫拿手機會提示轉成直向。
- **加入主畫面**：附 PWA manifest 與圖示，從主畫面開啟可全螢幕遊玩。
- **音效解鎖**：第一次觸控畫面任何地方就解鎖 iOS 音效。

## 部署到 Cloudflare Pages

**方法 A：連接 Git（推薦）**
1. 將專案推到 GitHub / GitLab。
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git。
3. Build command：`npm run build`；Build output directory：`dist`；環境變數 `NODE_VERSION=20`（可選 `VITE_GA_ID`）。

**方法 B：直接上傳**
```bash
npm run build
npx wrangler pages deploy dist --project-name trash-truck-rush
```

`public/_headers` 會設定基本安全標頭與靜態資源快取；`vite.config.ts` 使用相對路徑 `base: './'`，放在子路徑也能運作。

### GA4（可選）
在 `.env` 或 Cloudflare 環境變數設定 `VITE_GA_ID=G-XXXXXXX` 才會載入 GA4；未設定時 `track()` 為 no-op，不影響遊戲。只送遊戲數據（難度、分數、時間等），不收集個資。若在需要同意的地區上線，請先加上同意機制再設定此變數。

## 專案架構

```
src/
├── config/        所有平衡參數（gameConfig）、難度（difficultyConfig）、文案（texts）
├── systems/       純邏輯：RunnerModel、GameClock、EventSystem、ScoreSystem、TitleSystem、
│                  ChallengeSystem、StorageSystem、GameFlow；以及 Audio / Share / Analytics
├── utils/         physics（拋物線與碰撞）、stairPath（Z 字樓梯路徑）、rng（可重現亂數）
├── objects/       Player、GarbageTruck、GarbageBag、Stairwell、Scenery、Props（程式繪圖）
├── scenes/        Boot → Menu → Intro → Stair → Throw → Result
├── ui/            Button、Overlay/Toast、theme
├── state.ts       跨場景的存檔與選項
└── main.ts
tests/             Vitest 單元測試（計分、稱號、命中判定、挑戰參數、事件、狀態機、平衡）
e2e/               Playwright E2E（三種難度完整通關、失敗流程、挑戰連結、localStorage 被封鎖）
```

設計重點：
- **規則與畫面分離**：所有勝負判定都在無 Phaser 依賴的純函式裡，方便測試與調整。
- **可預測物理**：固定時間步長（1/120 秒）的拋物線與反彈（恢復係數＋摩擦，在垃圾車的移動座標系計算）；預測虛線、慢動作預判和實際飛行用同一套 `stepBag()` / `advanceBag()`。
- **計時公平**：倒數從玩家取得控制權才開始；開場動畫、慢動作期間不計時；計時器由場景 `update` 驅動，換場景不會殘留。
- **可重現關卡**：隨機事件由種子決定，挑戰連結帶種子，朋友玩到相同的事件配置。

## 調整平衡

全部在 `src/config/gameConfig.ts` 與 `src/config/difficultyConfig.ts`：
跑速（`maxRunSpeed`、`comboStrideBonus`）、重力與力道（`gravity`、`minThrowPower`、`maxThrowPower`）、
垃圾車速度與投入口大小（各難度 `truckSpeed`、`openingWidth`）、計分與稱號門檻等。
修改後跑 `npm test`，`tests/throwBalance.test.ts` 會確認各難度仍「打得中但不無腦」。

## 已完成功能

- 首頁（動畫標題、垃圾車、主角、音符）、玩法說明、最佳紀錄、難度選擇、音效開關、免責聲明
- 可跳過的開場劇情（5 樓滑手機 → 聽到垃圾車 → 抓垃圾袋）
- 垃圾分類小關：一般垃圾放垃圾袋、可回收放回收桶（依台灣分類規則、每局依種子挑 5～8 件），分錯扣 1.5 秒並顯示正確答案，全對 +200；倒數與計時從這裡開始
- 追垃圾車：按住【追垃圾車！】往前追（有體力條、不能貼到車上），邊跑邊丟時垃圾袋會帶著跑速；靠越近越好中但距離分越低
- 3‑2‑1 倒數後開始的樓梯衝刺：交替踏步加速、同腳踉蹌、攝影機跟隨、樓層提示、垃圾車狀態條
- 5 種隨機事件（鞋櫃、阿嬤、拖鞋飛走、媽媽的最後一袋、垃圾袋快破），每局依難度 1～3 個，皆有預警與反應時間
- 垃圾車投擲：拖曳/滑鼠瞄準、長按蓄力、虛線預測、移動的投入口、命中前 0.5 秒慢動作與鏡頭聚焦、3 袋機會
- 距離分級計分＋完美命中、一次命中、反彈進車、剩餘時間、無失誤下樓、媽媽那袋加分
- 垃圾袋反彈：撞車頂、投入口邊緣、車身、地面都會彈，彈進投入口也算命中
- 依失敗原因的搞笑結局、11 種有固定優先序的人格稱號
- 1080×1080 成績圖、Threads 分享（Web Share API 附圖，或 Threads intent＋自動複製文案）、下載圖片、挑戰連結
- 好友挑戰：相同難度與事件種子，結算時顯示是否贏過朋友
- localStorage 本機紀錄（分難度），帶版本與 schema 驗證，無法使用時自動改存記憶體
- 垃圾車音樂：每局依種子播放貝多芬〈給愛麗絲〉或巴達婕芙絲卡〈少女的祈禱〉（皆為公眾領域樂曲，用 Web Audio 即時合成、不使用任何錄音），隨剩餘時間加速；開場會顯示今天放哪一首
- GA4 事件介面（未設定時不載入）

## 已知問題與限制

- 桌面會左右留邊（以手機直向為主，尚未做寬螢幕版面）。
- 高解析度手機上文字略有柔化：Phaser 3.90 沒有渲染倍率設定，畫布以 720 寬邏輯解析度放大顯示。
- PWA 尚未加入 Service Worker，所以沒有離線遊玩。
- 圖片分享到 Threads：多數手機瀏覽器透過系統分享選單可直接附圖；桌面與部分瀏覽器只能開啟 Threads 發文頁並帶入文字，需手動附上下載的圖片。
- 挑戰連結資料可被修改，僅供趣味比較，不具防作弊能力。
- 角色與場景皆為程式繪製的卡通風格，尚未使用像素藝術貼圖。
- 〈少女的祈禱〉主旋律是憑記憶編寫，未對照樂譜；旋律資料在 `src/config/tunes.ts`，若聽起來不對可直接修正音符。
- 平衡參數經自動化測試與機器人試玩驗證，仍建議實際找玩家測手感後微調。

## 後續擴充建議

- 全台排行榜（Cloudflare D1 / KV＋Workers，搭配伺服器端重播驗證）
- 角色造型（拖鞋、睡衣、阿伯、學生）與垃圾袋款式，可做成解鎖獎勵
- 更多關卡：雨天（地板滑）、颱風天（側風）、資源回收車同時出現（要丟對車）
- 每日挑戰（以日期為種子），配合分享
- 寬螢幕桌面版面、PWA 離線遊玩
- 以正式像素美術貼圖取代程式繪圖；加入振動回饋（`navigator.vibrate`）
