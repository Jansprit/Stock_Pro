name: Pull Request
description: 提交變更
body:
  - type: markdown
    attributes:
      value: |
        感謝貢獻！請填寫以下資訊讓 reviewer 快速理解變更內容。

  - type: dropdown
    id: type
    attributes:
      label: 變更類型
      options:
        - fix: bug 修復
        - feat: 新功能
        - perf: 效能改善
        - refactor: 重構（無行為改變）
        - docs: 文件 / README
        - test: 測試
        - ci: CI / 部署配置
        - chore: 其他雜項
    validations:
      required: true

  - type: input
    id: issue
    attributes:
      label: 關聯 Issue
      description: 例：`#42` 或 `fixes #42`
      placeholder: "fixes #42"
    validations:
      required: false

  - type: textarea
    id: summary
    attributes:
      label: 變更摘要
      description: 改了什麼？為什麼？
    validations:
      required: true

  - type: textarea
    id: testing
    attributes:
      label: 測試方式
      description: 怎麼驗證？跑了哪些 command？跑了哪些股票代碼？
    validations:
      required: true

  - type: checkboxes
    id: checklist
    attributes:
      label: Checklist
      options:
        - label: 已跑 `npm run build` 確認無 build error
          required: true
        - label: 已跑 `npx tsc --noEmit` 確認無 type error
          required: true
        - label: 已用 Playwright 截圖驗證 UI（如有 UI 變更）
          required: false
        - label: 已更新 `.env.local.example`（如有新增 env var）
          required: false
        - label: 未引入新 dependency（如有，已在 PR 說明理由）
          required: true
        - label: 未 commit 任何 API key / token / `.env.local`
          required: true