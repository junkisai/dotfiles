# エミュレータでの確認

コマンドは `orca-emulator`（iOS）と `orca-emulator-android`（Android）のガイドに従う（`orca skills get orca-emulator` / `orca skills get orca-emulator-android`）。ここには確認で外さない点だけを書く。

## 準備

- アプリの build と導入は Orca の外で行う。iOS は `xcodebuild` と `xcrun simctl install / launch`、Android は Gradle で APK を作り `orca emulator install / launch`。
- 端末は UDID / serial で指定する。同じ名前のシミュレータが複数あるので（`iPhone 18 Pro` が3台など）、名前だけで指定しない。一覧は `orca emulator devices --json`。
- 起動済みのシミュレータはユーザーが使っている可能性がある。勝手に `shutdown` しない。止めてよいのは自分で起動した端末だけ。

## 観測

- 操作の前に `ax` で対象の要素と `frame` を取る。タップは `frame` の中心（x + w/2、y + h/2）に `tap` で行い、座標を目測で決めない。スクロールは `gesture`。
- 結果は `ax` の文言で確認し、見た目が要点なら静止画も撮る。iOS は `xcrun simctl io <udid> screenshot <file>`、Android は `adb exec-out screencap -p`。
- `type` は US-ASCII しか送れない。日本語などの入力が必要な項目は、未確認として残す。
- Android のクラッシュやエラーの裏取りには `logcat` を使う。

## iOS で attach が失敗するとき

`orca emulator attach` が `Helper failed: ... Library not loaded: @rpath/SimulatorKit.framework` で失敗することがある。Orca の serve-sim が Xcode の SimulatorKit を見つけられない状態で、2026-09 時点の Xcode 27.0 と Orca 1.4.199 で確認した（SimulatorKit が `Contents/SharedFrameworks/` に移り、Orca が探す `Contents/Developer/Library/PrivateFrameworks/` にない）。

この状態では、Orca 経由の `tap` / `type` / `ax` などの入力・取得は使えない。

- 原因と Xcode / Orca のバージョンを報告する。Xcode 側のファイルをコピーやリンクで書き換えて回避しない。
- `xcrun simctl`（`screenshot`、`recordVideo`、`launch`、`openurl`）は Orca に依存せず使える。表示の観測はできるが、操作が必要な項目は未確認として報告する。

## 後片付け

終わったら `orca emulator kill` でヘルパーを止める。ヘルパーを放置すると、Orca を終了するまで端末を掴んだままになる。端末そのものは起動したままにする。
