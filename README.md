# 即時資訊儀表板

一個 Apple 風格的瀏覽器主頁儀表板，以卡片形式顯示六項即時資訊。繁體中文介面，深／淺色主題，每張卡可手動更新，預設每分鐘自動更新。

## 六張卡片

| 卡片 | 資料來源 | 需要後端 |
|---|---|---|
| 列治文天氣 | [Open-Meteo](https://open-meteo.com/) | 否 |
| 九日天氣預報 | Open-Meteo | 否 |
| 港幣匯率（CAD / JPY / GBP） | [ExchangeRate-API](https://www.exchangerate-api.com/) | 否 |
| BC 省公眾假期 | 前端內置假期表 | 否 |
| 日出日落 | Open-Meteo | 否 |
| 環球市場（恒指 / 標普 / 納指100 / 道指 / 黃金） | CNBC，Yahoo 為備 | **是** |

## 為什麼需要後端

Open-Meteo 與 ExchangeRate-API 都支援跨域（CORS），瀏覽器可直接抓取。但行情來源（CNBC / Yahoo Finance）不開放 CORS，瀏覽器直接呼叫會被攔截，因此需要一個伺服器代為轉發。

## 本機執行

```bash
npm install
npm start
```

開啟 http://localhost:3000

> 請用 `localhost:3000` 開啟，不要直接雙擊 `public/index.html` —— 少了後端，環球市場卡會沒有數據。

Windows 使用者可直接雙擊 `啟動儀表板.bat`。

## 專案結構

```
server.js                    Express 伺服器 + API 代理（本機／Node 主機用）
public/index.html            單頁前端（無框架）
public/data/markets.json     行情快照（由 GitHub Actions 產生，GitHub Pages 版用）
scripts/fetch-markets.js     抓行情並寫入快照
.github/workflows/deploy.yml 自動部署到 GitHub Pages
package.json
```

## 部署到 GitHub Pages（全免費）

GitHub Pages 只提供靜態檔案，沒有 Node 執行環境。因此：

- **天氣、匯率、假期、日出日落** → 瀏覽器直接呼叫公開 API，即時更新
- **環球市場** → 由 GitHub Actions 每 10 分鐘抓一次，寫入 `public/data/markets.json` 靜態快照

前端會自動判斷環境：偵測到 `/api/health` 就即時抓，否則讀取靜態快照，並在市場卡右下角標示「快照 · HH:MM」。

### 設定步驟

1. 在 GitHub 建立一個 **public** repository（Actions 在公開 repo 不收費）
2. 推上程式碼（見下方指令）
3. 到 repo 的 **Settings → Pages → Build and deployment → Source**，選 **GitHub Actions**
4. 到 **Actions** 分頁，手動執行一次 `Deploy to GitHub Pages`（之後會自動定時執行）

網址會是 `https://<你的帳號>.github.io/<repo 名稱>/`

### 首次推送

```bash
git remote add origin https://github.com/<你的帳號>/<repo 名稱>.git
git branch -M main
git push -u origin main
```

> GitHub Actions 的 cron 在繁忙時段可能延遲，實際行情更新間隔約 10–25 分鐘。

## 部署到 Node 主機（即時行情）

Render、Vercel、Railway 等都支援 Node.js，直接部署整個 repo 即可，行情為即時。

- 服務必須監聽 `PORT` 環境變數並綁定 `0.0.0.0`
- 啟動指令：`npm start`

## API

| 端點 | 說明 |
|---|---|
| `GET /api/health` | 健康檢查，前端用來判斷是否處於本機模式 |
| `GET /api/weather` | 天氣、九日預報、日出日落（Open-Meteo） |
| `GET /api/exchange` | 港幣匯率（HKD 為基準） |
| `GET /api/markets` | 五項環球指數，30 秒快取 |
| `GET /api/holidays` | BC 省假期（前端另有內置版本） |

## 個人設定

稱呼、溫度單位、主題、自動更新開關都存在瀏覽器 `localStorage`。只有在本機（localhost）執行時，才會額外同步到伺服器端的 `settings.json`；部署到公開網站後不會同步，避免個人偏好外洩或被他人覆寫。

## 部署注意

- 需要 Node.js 執行環境（Render、Vercel、Railway 等）。
- 服務必須監聽 `PORT` 環境變數並綁定 `0.0.0.0`。
- GitHub Pages 只提供靜態檔案，沒有 Node 執行環境，市場數據需要另外處理。

## 授權與資料來源

天氣與日出日落資料來自 [Open-Meteo](https://open-meteo.com/)；匯率來自 [ExchangeRate-API](https://www.exchangerate-api.com/)（需標示來源）；行情來自 CNBC 與 Yahoo Finance。僅供個人使用。
