# 2026 環球旅行行程管理網站

一個可直接放在 GitHub Pages 的純前端行程網站。以手機操作為優先，也支援平板與電腦。網站不需要帳號、資料庫或後端伺服器。

## 主要功能

- 依日期查看日本、歐洲、紐約與美西行程
- 新增、編輯、複製與刪除每日行程
- 集中查看住宿、交通票券與待辦事項
- 自動將修改保存在目前瀏覽器的 localStorage
- 復原最近一次修改，或恢復公開初始行程
- 匯出完整 JSON 備份，並可在其他裝置匯入
- 公開初始資料不含住宿地址、價格與訂位編號

## 在電腦預覽

此網站會讀取 JSON 檔案，因此請使用本機網頁伺服器，不要直接雙擊 `index.html`。

```bash
python3 -m http.server 8000
```

接著開啟：

```text
http://localhost:8000
```

## 日常使用方式

1. 進入「行程」，點開任一天查看細節。
2. 使用「編輯」更新時間軸、住宿、交通、門票、提醒與備案。
3. 按右下角「＋」新增一天；複製既有日程可快速建立類似安排。
4. 在「待辦」勾選已完成事項。
5. 大幅修改前，先到「設定」匯出完整 JSON 備份。

所有表單的多筆資料皆採一行一筆：

```text
時間 | 內容 | 地點 | 備註
```

交通與門票格式：

```text
名稱 | booked 或 unbooked | https://官方連結
```

## 資料與隱私

- `data/default-trip.json` 是會發布到 GitHub 的公開初始資料。
- 在網站中輸入的私人住宿欄位，只保存在該瀏覽器的 localStorage。
- 匯出的 JSON 會包含本機私人欄位，請不要提交到公開 GitHub repository。
- 清除瀏覽器網站資料會移除本機修改；請定期匯出備份。
- 若換手機或瀏覽器，先在舊裝置匯出，再到新裝置匯入。

## 發布到 GitHub Pages

### 1. 建立 GitHub repository

在 GitHub 建立一個新的 public repository，例如 `travel-planner`，不要勾選自動建立 README。

### 2. 上傳網站

在此資料夾執行：

```bash
git remote add origin https://github.com/你的帳號/travel-planner.git
git push -u origin main
```

### 3. 開啟 GitHub Pages

1. 進入 repository 的 `Settings`。
2. 選擇 `Pages`。
3. `Source` 選擇 `Deploy from a branch`。
4. Branch 選 `main`，資料夾選 `/ (root)`。
5. 儲存後等待 GitHub 完成發布。

網站網址通常會是：

```text
https://你的帳號.github.io/travel-planner/
```

## 更新公開初始行程

若要讓所有新裝置都看到相同的初始內容，請編輯 `data/default-trip.json` 後提交：

```bash
git add data/default-trip.json
git commit -m "更新公開行程"
git push
```

只在網站介面修改不會自動更新 GitHub；介面修改是個人本機版本。

## 執行測試

需要 Node.js 18 以上版本：

```bash
npm test
```

## 專案結構

```text
index.html              網站入口
assets/styles.css       手機優先的版面與視覺樣式
data/default-trip.json  公開初始行程
src/app.js              畫面與操作邏輯
src/model.js            行程資料操作與驗證
src/storage.js          本機保存、復原與匯入匯出
tests/                  自動化測試
```
