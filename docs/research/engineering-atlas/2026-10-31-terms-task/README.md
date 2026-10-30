# Задание dots: ядро терминов всей книги (2026-10-31)

**Что это.** Входные данные задания на словарь атласа (`linguistpro.atlas-terms-pack.1.0.0`):
`term-candidates.jsonl` (1924 кандидата: заголовки, описания символов, названия рисунков, частые
словосочетания ≥ 4) и `book-text.jsonl` (сырой ивритский текст 541 страницы с текстовым слоем).

**Как получено.** Экстрактор по всей книге (`python scripts/atlas/atlas_book.py extract --pdf <PDF> --out .tmp/atlas-book`,
42 раздела по `atlas/a97002/sections.json`), затем `atlas_book.py candidates` и `atlas_book.py booktext`.
Архив для dots: `python scripts/atlas/build_dots_bundle.py --terms --book-text <this>/book-text.jsonl --candidates <this>/term-candidates.jsonl --out <zip>`
→ `a97002-terms-task-v1.zip`, 181 107 байт, sha256 `66c4be6b…f7a0c4f`; передан в чат dots и в папку обмена.

**Сдача.** `a97002-terms-v1.jsonl`; проверка `atlas_validate.py --terms …` (цитаты ищутся на указанных
страницах — защита от выдуманных терминов). Статус: `sent-to-dots`.
