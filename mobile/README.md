# Stellar Pay mobile

```bash
flutter pub get
```

Create `mobile/.env` with your project ID from [Reown Cloud](https://cloud.reown.com):

```
REOWN_PROJECT_ID=your_project_id
```

Then run normally (CLI or IDE Run button — no `--dart-define` needed):

```bash
flutter run
```

Reown connects EVM wallets through `stellarpay://`; native Stellar payments continue to use the existing Stellar wallet flow.
