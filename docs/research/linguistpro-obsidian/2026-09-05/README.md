# LinguistPro → Obsidian Premium Study Package v3

Статус: локальная реализация и полный пакет проверены; production verification
для версии 3.11.478 выполняется после публикации, 2026-09-05.

Этот каталог фиксирует архитектуру третьей версии учебного пакета: доказуемые
парадигмы Pealim, контекст и аудио LinguistPro, безопасное объединение многих
текстов в одном vault и учебный маршрут без второго SRS.

- [Архитектура и методика](PREMIUM_STUDY_PACKAGE_V3.md)
- [Контракт формы, начальной формы и корня](SURFACE_HEADWORD_ROOT_CONTRACT.md)
- [Матрица проверки](VERIFICATION.md)

Полный пример на пользовательском тексте не коммитится: он содержит частные
учебные данные. Он воспроизводится локально командой:

    node scripts/premium/obsidian-lexical-preview.js --zip <learning-package.zip> --text-id <text-id> --output-zip <study-package.zip>

Проверка результата:

    node scripts/premium/obsidian-study-package-audit.js --zip <study-package.zip>
