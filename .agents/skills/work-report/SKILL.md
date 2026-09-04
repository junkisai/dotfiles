---
name: work-report
description: Create concise Japanese development work reports for contractors or daily status sharing from GitHub pull requests. Use when the user asks to summarize today's work, report development tasks, list or filter PRs for a work report, or turn GitHub PR activity into a short business report. Always confirm or ask which GitHub repository/repositories should be included before finalizing the report.
---

# Work Report

## Overview

Create a short Japanese work report from GitHub PR activity. Prioritize accurate repository scope, date boundaries, PR status, and a natural report tone suitable for development outsourcing or daily status sharing.

## Workflow

1. Determine the reporting date.
   - If the user says "today", use the current date in the user's timezone.
   - State the concrete date when there is any ambiguity.
   - For Japan-based work reports, default to JST unless the user specifies otherwise.

2. Determine the GitHub repository scope before finalizing.
   - If the user names a repository, use only that repository.
   - If the request is in a local checkout, infer the current repo from `git remote -v` and present it as the default scope.
   - If GitHub search finds PRs from other repos, do not include them unless the user explicitly asks.
   - If the user asks for the report skill to be reusable, include a reminder to ask: "どの GitHub リポジトリを報告対象にしますか？"

3. Gather PR data.
   - Prefer GitHub CLI when available.
   - For a single repo:
     ```bash
     gh pr list --repo OWNER/REPO --state all --author @me --limit 100 --json number,title,state,createdAt,mergedAt,updatedAt,url,body,isDraft,headRefName,baseRefName
     ```
   - Filter using the reporting date in the user's timezone. Convert to UTC if filtering JSON locally.
   - If the user wants "self-assigned" PRs, use an assignee search link or query instead of assuming author equals assignee.
   - If network access is blocked, retry with the required approval flow.

4. Produce the report.
   - Use the bullet-list format (see Output Template). Keep it short.
   - Put the filtered GitHub search URL directly under the greeting, before the bullets.
   - Summarize the work as 3-6 concise bullets. Group by engineering theme; don't write one bullet per PR title.
   - Write each bullet **feature-first**: describe the capability or value delivered — what the product or its users can now do — in plain language a non-engineer stakeholder (the contractor's client, a PM) would understand. A PR title is written for engineers and names internal components; don't just paraphrase it.
   - To do this, **read the PR body** (the `body` field from the `gh` call), not only the title. The title tells you which component changed; the body tells you what was actually built and why. Translate that into user/business terms. When several PRs advance one capability, fold them into a single bullet that tells the story end-to-end (e.g. 設計確定 → 保存先 DB → 取得処理).
   - Keep internal jargon out of the lead phrasing (component/schema/role names, "RLS", "Text-to-SQL", "OAuth スコープ", etc.). If a specific term adds real precision, tuck it into a short parenthetical rather than leading with it.
   - A noun phrase ending is fine, but lead with the capability, not the task. Example transform: PR title 「経営AI対話エージェント（実行接地型 Text-to-SQL）を実装」 → bullet 「経営者が自然言語で質問すると、AI が自らデータを集計・分析して答える『経営AIとの対話』機能を実装（数値の正しさ・店舗ごとのデータ分離・監査ログも担保）」. The title names the mechanism; the bullet names what the user gets.
   - End with a one-line "明日は〜" next-step sentence.
     - If the user tells you what they plan to do next, use their wording (lightly smoothed) rather than inferring.
     - Otherwise infer the likely next step from in-progress, draft, or just-merged spec/design PRs when possible.
     - If the next step is still unclear, leave a clear placeholder like 「明日はXXXXXに入っていければと思います！」 and tell the user to fill it in.
   - Do not include unrelated repositories.
   - Do not include PR count or status counts unless the user asks.

## Repository Scope

Ask or confirm the repo scope early when it is not explicit.

Use this phrasing when needed:

```text
報告対象の GitHub リポジトリはどれにしますか？
現在の checkout からは OWNER/REPO を候補として見ています。
```

If the user says a separate repository is unnecessary, explicitly exclude it and continue.

## Filter Links

For a repo-scoped PR link:

```text
https://github.com/pulls?q=is%3Apr+repo%3AOWNER%2FREPO+author%3AUSERNAME+created%3AYYYY-MM-DD
```

For self-assigned PRs:

```text
https://github.com/pulls?q=is%3Apr+repo%3AOWNER%2FREPO+assignee%3AUSERNAME+created%3AYYYY-MM-DD
```

Tell the user that `author:` is safer for "PRs I created", while `assignee:` is correct only when PRs are actually assigned.

## Style

Default to a friendly but professional Japanese report:

```text
今日の作業内容の共有です！
...
```

Avoid over-explaining. Preserve business intent when shortening. If shortening changes nuance, tell the user and keep the longer phrasing.

## Output Template

```text
今日の作業内容の共有です！
{filtered_link}

- {theme_1}
- {theme_2}
- {theme_3}

明日は{next_step}に入っていければと思います！
```

Example (note how each bullet leads with the capability/value, not the component name):

```text
今日の作業内容の共有です！
https://github.com/pulls?q=is%3Apr+repo%3Astandupworks%2Fhanninmae-webapp+author%3Ajunkisai+created%3A2026-06-29

- 経営者が自然言語で質問すると、AI が自らデータを集計・分析して答える「経営AIとの対話」機能を実装（数値の正しさ・店舗ごとのデータ分離・監査ログも担保）
- Google のクチコミ（Google ビジネスプロフィール）を自動で日次取得・蓄積する連携の土台づくり（設計確定 → 保存用 DB → クチコミの取得・保存処理まで）
- 店舗ユーザーがアプリ内で Google 連携を自分で完了できるようにする仕組みの設計確定
- 食べログデータの閲覧権限を他データソースと揃え、テナント内メンバーが見られるよう整備

明日はモデルの検証＆確定（gpt-5.4-nano / mini など）と、Google 連携のスクレイパー・連携機能の実装を終わらせられればと思います！
```
