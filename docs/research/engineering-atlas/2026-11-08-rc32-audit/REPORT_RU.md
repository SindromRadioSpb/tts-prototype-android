# Постраничная проверка атласа 97001, RC3.2

Снимок проверки: 2026-11-08T03:57:03.061954+00:00. Исходник: 203 листа PDF.

**Результат: атлас не принят без замечаний.** Подтверждённые отклонения, неопределённые чтения и особенности самого PDF разделены. Production не изменялся.

Глубокие пакеты завершены для 203 из 203 листов. Явные записи проверки имеют 6826 уникальных leaf ID и 1027 из 1027 записей терминов в разделах. Сохранённые UI-наблюдения есть для 203 листов; это не полная проверка всех карточек и элементов интерфейса.

Подтверждённых адресных записей замечаний: 185. Запись может содержать несколько адресов; её повтор на другой странице не является новой независимой причиной.

## Что установлено об исходнике

PDF из вложения и официальный файл gov.il побайтово идентичны. Все 203 опубликованных страничных растра сохраняют содержание этого PDF: 193 совпали пиксельно, 10 отличаются лишь округлением рендера до 1/255 RGB. Сохранность картинки не означает полноты её учебной расшифровки.

## Повторная проверка прежних жалоб

- На 122 выделенные определения представлены отдельными записями; наличие этой структуры подтверждено и в интерфейсе.
- На 154 все четыре основных пункта и пять сносок 8–12 присутствуют, включая אלסטיות и פלסטיות. При этом определение רך из сноски 8 не связано с отдельным каноническим термином.
- На 178 все девять пунктов представлены раздельно, исходный текст и перевод сопоставлены. У двух исходных написаний остаются отдельные ограничения чтения; они не названы пропуском всего пункта.
- На 124 обнаружены другие адресные проблемы чтения דגם и нижнего словарного разбора карточек; верхние терминологические пояснения при этом могут быть правильными.

## Границы вывода

- Статусы blocked/partial имеют разные причины: качество растра, исходная опечатка, неустановленная норма или система чтения, неполный UI-охват. Они не сведены к одной причине «нечитаемо».
- Неразборчивый мелкий растр не восстановлен по формулам, соседним цифрам или предполагаемому смыслу.
- На 116 остаются 303 нечитаемых подполя из 472 проверенных полей элементов. Эти 472 не складываются с 118 ячейками-контейнерами.
- На 125 отдельно рассмотрены 22 микрорегиона. На 159 все 728 клеток проверены, 25 чтений остались неопределёнными.
- Три читаемых фрагмента логотипов повторяются на каждом из 203 листов: 609 вхождений не представлены полными языковыми полями. Это подтверждённые пропуски учебного слоя, а не плохая читаемость. Две розовые микростроки отдельно остаются неразборчивыми. Эти 609 не складываются с вложенными единицами прежних пакетов.
- На обложке нет печатного номера 1. Номера со 2 по 203 проверены визуально и совпадают.
- В формулах на 81/85 структурированные пометы исключённых корней присутствуют; замечание относится к отображению учебных строк.
- Проверки выявили и отозванные кандидаты. Например, регистр S в μ_S не является ошибкой атласа; неопределённые чтения не повышены до доказанных дефектов.
- Дополнительно выполнена выборочная независимая перепроверка 15 замечаний. Это не второй полный проход всех страниц; точные границы есть в data/independent_verification.json.
- Значение «пакет завершён» означает, что просмотр выполнен до доступного предела доказательств; оно не означает, что все поля верны.
- UI-проверка относится к сохранённой конфигурации Chrome. Кириллическая транслитерация была проверена в данных, но скрыта в использованном режиме интерфейса. Все карточки не открывались.

Каталог замечаний не равен полному перечню остаточных вопросов: локальные неуверенные чтения и нормы перечислены в remaining_axes.csv и data/remaining_details_by_packet.json. Статусы разных уровней не складываются.

## Как пользоваться

- `pagewise_coverage.csv`: все 203 страницы и степень охвата.
- `findings_by_page.csv`: замечания с адресами, цитатами и доказательствами.
- `remaining_axes.csv`: конкретные незакрытые оси по единицам. Это не полный счётчик непереведённых слов: дополнительные микрорегионы и издательский слой имеют отдельные знаменатели.
- `data/publisher_*.json`: уточнённая проверка логотипов. Она отделяет читаемые пропуски от микротекста, который ранние пакеты отмечали общим статусом blocked.
- `data/`: полный машиночитаемый каталог, включая варианты и ограничения.
- `sources/source.pdf`: единственный исходный PDF; `sources/sections/`: опубликованный снимок данных.
- `evidence/`: адресные фрагменты и снимки интерфейса без тяжёлых дублей всего оригинала.

## Постраничная ведомость

### Страница 1

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=1) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s00-front&pg=1)

- [A001-005-D001](#a001-005-d001): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [PUB-FOOTER-S01-READING](#pub-footer-s01-reading): Подтверждённое отклонение атласа. Проверка: he_niqqud, translit, translit_ru.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 7 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 2

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=2) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s00-front&pg=2)

- [A001-005-D006](#a001-005-d006): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 6 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 3

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=3) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s00-front&pg=3)

- [A001-005-D007](#a001-005-d007): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [A001-005-D010](#a001-005-d010): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [A001-005-D011](#a001-005-d011): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 5 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 4

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=4) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s01-units&pg=4)

- [A001-005-D002](#a001-005-d002): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [A001-005-D003](#a001-005-d003): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [A001-005-D004](#a001-005-d004): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [A001-005-D008](#a001-005-d008): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [A001-005-D009](#a001-005-d009): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 5

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=5) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s01-units&pg=5)

- [A001-005-D005](#a001-005-d005): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 6

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=6) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s02-statics-basics&pg=6)

- [A001-050-F001](#a001-050-f001): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 7

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=7) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s02-statics-basics&pg=7)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 8

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=8) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s02-statics-basics&pg=8)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 9

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=9) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s02-statics-basics&pg=9)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 10

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=10) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s02-statics-basics&pg=10)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 11

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=11) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s02-statics-basics&pg=11)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 12

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=12) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s02-statics-basics&pg=12)

- [A006-015-D001](#a006-015-d001): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 5 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 13

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=13) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s02-statics-basics&pg=13)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 14

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=14) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s02-statics-basics&pg=14)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 15

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=15) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s03-concurrent-forces&pg=15)

- [A006-015-D002](#a006-015-d002): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 16

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=16) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s03-concurrent-forces&pg=16)

- [A016-025-D002](#a016-025-d002): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 17

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=17) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s03-concurrent-forces&pg=17)

- [A016-025-D001](#a016-025-d001): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A016-025-D002](#a016-025-d002): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 18

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=18) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s03-concurrent-forces&pg=18)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 19

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=19) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s03-concurrent-forces&pg=19)

- [A016-025-D002](#a016-025-d002): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 20

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=20) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s03-concurrent-forces&pg=20)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 21

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=21) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s03-concurrent-forces&pg=21)

- [A016-025-D003](#a016-025-d003): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 22

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=22) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s03-concurrent-forces&pg=22)

- [A016-025-D002](#a016-025-d002): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 23

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=23) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s03-concurrent-forces&pg=23)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 24

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=24) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s04-parallel-forces&pg=24)

- [A016-025-D004](#a016-025-d004): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A016-025-D005](#a016-025-d005): Подтверждённое отклонение атласа. Проверка: Точный исходный текст.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 5 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 25

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=25) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s04-parallel-forces&pg=25)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 26

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=26) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s04-parallel-forces&pg=26)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 27

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=27) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s04-parallel-forces&pg=27)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 28

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=28) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s04-parallel-forces&pg=28)

- [A001-050-F002](#a001-050-f002): Подтверждённое отклонение атласа. Несоответствие транслитерации.
- [A001-050-F003](#a001-050-f003): Подтверждённое отклонение атласа. Несоответствие транслитерации.
- [A026-035-D001](#a026-035-d001): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [A026-035-D002](#a026-035-d002): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A026-035-D003](#a026-035-d003): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 5 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 29

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=29) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s04-parallel-forces&pg=29)

- [A001-050-F004](#a001-050-f004): Подтверждённое отклонение атласа. Несоответствие транслитерации.
- [A026-035-D002](#a026-035-d002): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 5 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 30

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=30) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s04-parallel-forces&pg=30)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 31

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=31) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s04-parallel-forces&pg=31)

- [A001-050-F005](#a001-050-f005): Подтверждённое отклонение атласа. Несоответствие транслитерации.
- [A026-035-D002](#a026-035-d002): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 5 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 32

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=32) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s04-parallel-forces&pg=32)

- [A001-050-F006](#a001-050-f006): Подтверждённое отклонение атласа. Несоответствие транслитерации.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 33

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=33) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s04-parallel-forces&pg=33)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 34

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=34) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s05-planar-forces&pg=34)

- [A026-035-D004](#a026-035-d004): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 35

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=35) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s05-planar-forces&pg=35)

- [A026-035-D004](#a026-035-d004): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 36

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=36) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s05-planar-forces&pg=36)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 37

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=37) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s05-planar-forces&pg=37)

- [A026-035-D004](#a026-035-d004): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 38

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=38) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s05-planar-forces&pg=38)

- [A026-035-D004](#a026-035-d004): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 39

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=39) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s05-planar-forces&pg=39)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 40

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=40) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s06-trusses&pg=40)

- [A036-050-D001](#a036-050-d001): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [UI40-SOURCE-UNDERLINE](#ui40-source-underline): Подтверждённое отклонение атласа. Авторское подчёркивание смешано с оформлением ссылок.
Незавершённые применимые оси: 6 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 41

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=41) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s06-trusses&pg=41)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 8 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 42

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=42) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s06-trusses&pg=42)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [UI42-SOURCE-COLOR](#ui42-source-color): Подтверждённое отклонение атласа. Утрачено смысловое различие цветовых выделений.
Незавершённые применимые оси: 5 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 43

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=43) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s06-trusses&pg=43)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [UI43-CIRCLED-NUMBERS](#ui43-circled-numbers): Подтверждённое отклонение атласа. Номера отображаются квадратами в проверенном браузере.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 44

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=44) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s06-trusses&pg=44)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 45

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=45) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s06-trusses&pg=45)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 46

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=46) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s06-trusses&pg=46)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 47

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=47) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s06-trusses&pg=47)

- [A001-050-F007](#a001-050-f007): Подтверждённое отклонение атласа. Несоответствие транслитерации.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 48

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=48) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s06-trusses&pg=48)

- [A001-050-F008](#a001-050-f008): Подтверждённое отклонение атласа. Несоответствие транслитерации.
- [A001-050-F009](#a001-050-f009): Подтверждённое отклонение атласа. Несоответствие транслитерации.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 49

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=49) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s06-trusses&pg=49)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 50

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=50) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s07-centroid&pg=50)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [UI50-SOURCE-CALLOUT](#ui50-source-callout): Подтверждённое отклонение атласа. Не сохранено выделение примечания.
Незавершённые применимые оси: 6 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 51

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=51) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s07-centroid&pg=51)

- [A51-100-GF02](#a51-100-gf02): Подтверждённое отклонение атласа. Обрезанная область подписи.
- [A51-100-ST05](#a51-100-st05): Подтверждённое отклонение атласа. Вместо отдельного подрисунка показан общий растр.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 52

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=52) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s07-centroid&pg=52)

- [A51-100-ST05](#a51-100-st05): Подтверждённое отклонение атласа. Вместо отдельного подрисунка показан общий растр.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 53

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=53) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s07-centroid&pg=53)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [UI53-PAGE-POSITION](#ui53-page-position): Подтверждённое отклонение атласа. Сбой перехода и номера текущей страницы.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 54

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=54) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s07-centroid&pg=54)

- [A51-100-GF01](#a51-100-gf01): Подтверждённое отклонение атласа. Добавлена отсутствующая в источнике подпись.
- [A51-100-SF02](#a51-100-sf02): Подтверждённое отклонение атласа. Обрезанная область формулы.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 55

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=55) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s07-centroid&pg=55)

- [A51-100-S01](#a51-100-s01): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [A51-100-SF02](#a51-100-sf02): Подтверждённое отклонение атласа. Обрезанная область формулы.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [UI43-CIRCLED-NUMBERS](#ui43-circled-numbers): Подтверждённое отклонение атласа. Номера отображаются квадратами в проверенном браузере.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 56

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=56) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s07-centroid&pg=56)

- [A51-100-S02](#a51-100-s02): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 57

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=57) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s08-friction&pg=57)

- [A51-100-D07](#a51-100-d07): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 58

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=58) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s08-friction&pg=58)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 59

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=59) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s08-friction&pg=59)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 60

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=60) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s08-friction&pg=60)

- [A51-100-TL01](#a51-100-tl01): Неустановленное расхождение. Проверка: Огласовки.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 61

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=61) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s08-friction&pg=61)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 62

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=62) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s08-friction&pg=62)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [UI62-VECTOR-ARROWS](#ui62-vector-arrows): Подтверждённое отклонение атласа. Векторные стрелки отображаются квадратами.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 63

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=63) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s08-friction&pg=63)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 64

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=64) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s08-friction&pg=64)

- [A51-100-S03](#a51-100-s03): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 65

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=65) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s08-friction&pg=65)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 66

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=66) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s08-friction&pg=66)

- [A51-100-S03](#a51-100-s03): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 67

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=67) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s09-linear-motion&pg=67)

- [A51-100-D01](#a51-100-d01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-S04](#a51-100-s04): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [A51-100-SF01](#a51-100-sf01): Подтверждённое отклонение атласа. Неверная область привязки к источнику.
- [A51-100-ST01](#a51-100-st01): Подтверждённое отклонение атласа. Неверная область привязки к источнику.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 68

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=68) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s09-linear-motion&pg=68)

- [A51-100-D06](#a51-100-d06): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-S05](#a51-100-s05): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 69

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=69) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s09-linear-motion&pg=69)

- [A51-100-D01](#a51-100-d01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-D04](#a51-100-d04): Неустановленное расхождение. Проверка: Точный исходный текст.
- [A51-100-D05](#a51-100-d05): Неустановленное расхождение. Несоответствие транслитерации.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 3 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 70

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=70) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s09-linear-motion&pg=70)

- [A51-100-S06](#a51-100-s06): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [A51-100-SF02](#a51-100-sf02): Подтверждённое отклонение атласа. Обрезанная область формулы.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 71

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=71) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s09-linear-motion&pg=71)

- [A51-100-ST02](#a51-100-st02): Подтверждённое отклонение атласа. Неверная область привязки к источнику.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 72

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=72) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s09-linear-motion&pg=72)

- [A51-100-D05](#a51-100-d05): Неустановленное расхождение. Несоответствие транслитерации.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 73

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=73) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s09-linear-motion&pg=73)

- [A51-100-D01](#a51-100-d01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-E01](#a51-100-e01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 74

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=74) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s09-linear-motion&pg=74)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 75

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=75) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s09-linear-motion&pg=75)

- [A51-100-E01](#a51-100-e01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-S07](#a51-100-s07): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 76

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=76) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s09-linear-motion&pg=76)

- [A51-100-E01](#a51-100-e01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-ST03](#a51-100-st03): Подтверждённое отклонение атласа. Неверная область привязки к источнику.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 77

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=77) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s09-linear-motion&pg=77)

- [A51-100-E02](#a51-100-e02): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-S08](#a51-100-s08): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [A51-100-SF02](#a51-100-sf02): Подтверждённое отклонение атласа. Обрезанная область формулы.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 78

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=78) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s09-linear-motion&pg=78)

- [A51-100-E01](#a51-100-e01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 79

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=79) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s09-linear-motion&pg=79)

- [A51-100-E01](#a51-100-e01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-SF02](#a51-100-sf02): Подтверждённое отклонение атласа. Обрезанная область формулы.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 80

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=80) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s09-linear-motion&pg=80)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 81

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=81) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s09-linear-motion&pg=81)

- [A51-100-005](#a51-100-005): Подтверждённое отклонение атласа. Исходный текст: отклонение или ограничение.
- [A51-100-S09](#a51-100-s09): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [A51-100-SF02](#a51-100-sf02): Подтверждённое отклонение атласа. Обрезанная область формулы.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 82

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=82) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s10-projectile-motion&pg=82)

- [A51-100-L01](#a51-100-l01): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 83

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=83) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s10-projectile-motion&pg=83)

- [A51-100-S10](#a51-100-s10): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [A51-100-SF02](#a51-100-sf02): Подтверждённое отклонение атласа. Обрезанная область формулы.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 84

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=84) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s10-projectile-motion&pg=84)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 85

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=85) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s10-projectile-motion&pg=85)

- [A51-100-006](#a51-100-006): Подтверждённое отклонение атласа. Исходный текст: отклонение или ограничение.
- [A51-100-S11](#a51-100-s11): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 86

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=86) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s10-projectile-motion&pg=86)

- [A51-100-001](#a51-100-001): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-S12](#a51-100-s12): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 87

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=87) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s10-projectile-motion&pg=87)

- [A51-100-002](#a51-100-002): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-S13](#a51-100-s13): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [A51-100-SF02](#a51-100-sf02): Подтверждённое отклонение атласа. Обрезанная область формулы.
- [A51-100-ST04](#a51-100-st04): Подтверждённое отклонение атласа. Неверная область привязки к источнику.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 88

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=88) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s10-projectile-motion&pg=88)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 89

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=89) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s10-projectile-motion&pg=89)

- [A51-100-S14](#a51-100-s14): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 90

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=90) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s11-circular-motion&pg=90)

- [A51-100-SF03](#a51-100-sf03): Не подтверждено как ошибка атласа. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 91

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=91) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s11-circular-motion&pg=91)

- [A51-100-003](#a51-100-003): Подтверждённое отклонение атласа. Расхождение символа или формулы.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 92

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=92) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s11-circular-motion&pg=92)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 93

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=93) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s11-circular-motion&pg=93)

- [A51-100-S15](#a51-100-s15): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [A51-100-SF02](#a51-100-sf02): Подтверждённое отклонение атласа. Обрезанная область формулы.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 94

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=94) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s12-sections&pg=94)

- [A51-100-F01](#a51-100-f01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-F02](#a51-100-f02): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-T01](#a51-100-t01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-T02](#a51-100-t02): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 95

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=95) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s12-sections&pg=95)

- [A51-100-F01](#a51-100-f01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-T01](#a51-100-t01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 96

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=96) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s12-sections&pg=96)

- [A51-100-D02](#a51-100-d02): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 97

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=97) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s12-sections&pg=97)

- [A51-100-F01](#a51-100-f01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 98

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=98) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s12-sections&pg=98)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 99

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=99) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s12-sections&pg=99)

- [A51-100-D02](#a51-100-d02): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-GF03](#a51-100-gf03): Подтверждённое отклонение атласа. Область подписи указывает в другое место.
- [A51-100-GL01](#a51-100-gl01): Не подтверждено как ошибка атласа. Отдельный исходный знак не аттестован.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 100

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=100) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s13-dimensions&pg=100)

- [A51-100-F01](#a51-100-f01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-F03](#a51-100-f03): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-F04](#a51-100-f04): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-F05](#a51-100-f05): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A51-100-F06](#a51-100-f06): Неустановленное расхождение. Несоответствие транслитерации.
- [A51-100-L02](#a51-100-l02): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 2 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 101

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=101) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s13-dimensions&pg=101)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 102

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=102) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s13-dimensions&pg=102)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 103

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=103) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s13-dimensions&pg=103)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 104

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=104) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s13-dimensions&pg=104)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 105

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=105) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s13-dimensions&pg=105)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 2 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 106

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=106) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s13-dimensions&pg=106)

- [A101-150-F001](#a101-150-f001): Подтверждённое отклонение атласа. Проверка: Исходный элемент, Точный исходный текст, Полнота русского перевода.
- [D101-114-AKUM](#d101-114-akum): Подтверждённое отклонение атласа. Проверка: Огласовки, translit, translit_ru.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 2 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 107

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=107) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s13-dimensions&pg=107)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 108

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=108) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s13-dimensions&pg=108)

- [D101-114-SECTION-left](#d101-114-section-left): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [D101-114-SECTION-right](#d101-114-section-right): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 109

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=109) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s14-industrial-symbols&pg=109)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 110

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=110) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s14-industrial-symbols&pg=110)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 111

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=111) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s14-industrial-symbols&pg=111)

- [D101-114-DIE-FORGING](#d101-114-die-forging): Подтверждённое отклонение атласа. Проверка: Огласовки, translit, translit_ru.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 112

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=112) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s14-industrial-symbols&pg=112)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 3 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 113

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=113) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s14-industrial-symbols&pg=113)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 3 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 114

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=114) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s14-industrial-symbols&pg=114)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 115

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=115) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s15-materials-basics&pg=115)

- [D115-123-CHOMARIM-115-b001](#d115-123-chomarim-115-b001): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [D115-123-CHOMARIM-115-b003-s01](#d115-123-chomarim-115-b003-s01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 116

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=116) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s15-materials-basics&pg=116)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 127 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 117

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=117) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s15-materials-basics&pg=117)

- [D115-123-CHOMARIM-117-b003-s02](#d115-123-chomarim-117-b003-s02): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [D115-123-CHOMARIM-117-b003-s03](#d115-123-chomarim-117-b003-s03): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [D115-123-CHOMARIM-117-b003-s04](#d115-123-chomarim-117-b003-s04): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [D115-123-CHOMARIM-117-b008](#d115-123-chomarim-117-b008): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [D115-123-TMISA-TERM-solid-solution](#d115-123-tmisa-term-solid-solution): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [D115-123-TMISA-TERM-solution](#d115-123-tmisa-term-solution): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [D115-123-TMISA-b004](#d115-123-tmisa-b004): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [D115-123-TMISA-b005](#d115-123-tmisa-b005): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [D115-123-TMISA-b006](#d115-123-tmisa-b006): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 2 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 118

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=118) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s15-materials-basics&pg=118)

- [D115-123-KEMERKAZIM](#d115-123-kemerkazim): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 119

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=119) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s15-materials-basics&pg=119)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 120

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=120) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s15-materials-basics&pg=120)

- [D115-123-MESHUSHE-BODY](#d115-123-meshushe-body): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [D115-123-MESHUSHE-TERM](#d115-123-meshushe-term): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 121

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=121) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s15-materials-basics&pg=121)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 122

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=122) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s15-materials-basics&pg=122)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 123

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=123) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s15-materials-basics&pg=123)

- [D115-123-ELASTICITY](#d115-123-elasticity): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [D115-123-RU-TERM-chemical-properties](#d115-123-ru-term-chemical-properties): Подтверждённое отклонение атласа. Непонятная или неточная формулировка перевода.
- [D115-123-RU-TERM-fatigue](#d115-123-ru-term-fatigue): Подтверждённое отклонение атласа. Непонятная или неточная формулировка перевода.
- [D115-123-RU-chemical-properties](#d115-123-ru-chemical-properties): Подтверждённое отклонение атласа. Непонятная или неточная формулировка перевода.
- [D115-123-RU-fatigue](#d115-123-ru-fatigue): Подтверждённое отклонение атласа. Непонятная или неточная формулировка перевода.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 3 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 124

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=124) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=124)

- [D124-128-DEGEM-b004](#d124-128-degem-b004): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [D124-128-DEGEM-b007](#d124-128-degem-b007): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [D124-128-DEGEM-b008-s01](#d124-128-degem-b008-s01): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [D124-128-SECTION-CONSTRUCT](#d124-128-section-construct): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [UI124-LEXICAL-SPECIMEN](#ui124-lexical-specimen): Подтверждённое отклонение атласа. Карточка выбирает неверное значение слова.
- [UI124-MORPH-METIKHA](#ui124-morph-metikha): Подтверждённое отклонение атласа. Карточка разбирает неверную лексему.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 125

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=125) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=125)

- [D124-128-MAAMATS-125-b002](#d124-128-maamats-125-b002): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [D124-128-MAAMATS-125-l-yield](#d124-128-maamats-125-l-yield): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [D124-128-YIELD-TERM](#d124-128-yield-term): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 8 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 126

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=126) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=126)

- [D124-128-AREA-126-b005](#d124-128-area-126-b005): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [D124-128-MAAMATS-126-b002](#d124-128-maamats-126-b002): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [D124-128-YIELD-TERM](#d124-128-yield-term): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 2 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 127

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=127) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=127)

- [D124-128-AREA-127-b007-s03](#d124-128-area-127-b007-s03): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [D124-128-MAAMATS-127-b006](#d124-128-maamats-127-b006): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [D124-128-MAAMATS-127-b007-s01](#d124-128-maamats-127-b007-s01): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 128

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=128) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=128)

- [D124-128-AREA-128-b002-s04](#d124-128-area-128-b002-s04): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [D124-128-MAAMATS-128-b001](#d124-128-maamats-128-b001): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [D124-128-MAAMATS-128-b002-s01](#d124-128-maamats-128-b002-s01): Подтверждённое отклонение атласа. Отклонение нормативных огласовок.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 129

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=129) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=129)

- [A101-150-F003](#a101-150-f003): Подтверждённое отклонение атласа. Проверка: Исходный элемент, Точный исходный текст, Полнота русского перевода.
- [D129-140-AREA-129-b002-s05](#d129-140-area-129-b002-s05): Подтверждённое отклонение атласа. Проверка: Огласовки, translit, translit_ru.
- [D129-140-STRESS-129-b002-s01](#d129-140-stress-129-b002-s01): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [D129-140-STRESS-129-b004](#d129-140-stress-129-b004): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 4 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 130

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=130) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=130)

- [D129-140-AREA-130-b006](#d129-140-area-130-b006): Подтверждённое отклонение атласа. Проверка: Огласовки, translit, translit_ru.
- [D129-140-AREA-130-b010-s02](#d129-140-area-130-b010-s02): Подтверждённое отклонение атласа. Проверка: Огласовки, translit, translit_ru.
- [D129-140-HARD-FEMININE](#d129-140-hard-feminine): Подтверждённое отклонение атласа. Проверка: Огласовки, translit, translit_ru.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 131

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=131) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=131)

- [D129-140-MEAN-131-b004](#d129-140-mean-131-b004): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [D129-140-SOURCEONLY-131-GLYPH](#d129-140-sourceonly-131-glyph): Подтверждённое отклонение атласа. Проверка: Полнота инвентаря источника, Структурированная запись.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 132

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=132) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=132)

- [D129-140-AREA-132-b006-s03](#d129-140-area-132-b006-s03): Подтверждённое отклонение атласа. Проверка: Огласовки, translit, translit_ru.
- [D129-140-MEAN-132-b006-s05](#d129-140-mean-132-b006-s05): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [D129-140-RU-SOURCE-GRAMMAR](#d129-140-ru-source-grammar): Подтверждённое отклонение атласа. Проверка: Полнота русского перевода.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 2 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 133

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=133) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=133)

- [D129-140-STRESS-133-b004](#d129-140-stress-133-b004): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [D129-140-STRESS-133-b005-s01](#d129-140-stress-133-b005-s01): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [D129-140-STRESS-133-b006](#d129-140-stress-133-b006): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [D129-140-STRESS-133-b007-s01](#d129-140-stress-133-b007-s01): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 134

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=134) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=134)

- [D129-140-BRONZE](#d129-140-bronze): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [D129-140-STRESS-134-b001](#d129-140-stress-134-b001): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 135

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=135) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=135)

- [D129-140-MEAN-135-b003](#d129-140-mean-135-b003): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 2 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 136

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=136) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=136)

- [D129-140-AREA-136-b001-s03](#d129-140-area-136-b001-s03): Подтверждённое отклонение атласа. Проверка: Огласовки, translit, translit_ru.
- [D129-140-MEAN-136-b001-s05](#d129-140-mean-136-b001-s05): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [D129-140-MEAN-TERM](#d129-140-mean-term): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 137

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=137) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=137)

- [D129-140-AREA-137-b003](#d129-140-area-137-b003): Подтверждённое отклонение атласа. Проверка: Огласовки, translit, translit_ru.
- [D129-140-SOURCEONLY-137-DIALS](#d129-140-sourceonly-137-dials): Подтверждённое отклонение атласа. Проверка: Полнота инвентаря источника, Структурированная запись.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 138

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=138) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=138)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 139

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=139) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=139)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 140

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=140) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=140)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 141

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=141) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=141)

- [A141-150-D008](#a141-150-d008): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 7 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 142

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=142) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=142)

- [A141-150-D001](#a141-150-d001): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [A141-150-D007](#a141-150-d007): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [A141-150-D008](#a141-150-d008): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 7 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 143

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=143) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=143)

- [A141-150-D001](#a141-150-d001): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [A141-150-D003](#a141-150-d003): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [A141-150-D008](#a141-150-d008): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 7 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 144

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=144) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=144)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 7 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 145

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=145) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=145)

- [A141-150-D009](#a141-150-d009): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A141-150-D010](#a141-150-d010): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 7 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 146

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=146) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=146)

- [A141-150-D002](#a141-150-d002): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 9 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 147

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=147) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=147)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 6 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 148

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=148) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=148)

- [A141-150-D004](#a141-150-d004): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [A141-150-D005](#a141-150-d005): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [A141-150-D006](#a141-150-d006): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [A141-150-D007](#a141-150-d007): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 10 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 149

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=149) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=149)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 5 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 150

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=150) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=150)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 6 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 151

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=151) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=151)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 152

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=152) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=152)

- [A151-203-F001](#a151-203-f001): Подтверждённое отклонение атласа. Пропуск значимого элемента.
- [A151-203-F002](#a151-203-f002): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 153

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=153) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s16-mechanical-properties&pg=153)

- [A151-203-F015](#a151-203-f015): Подтверждённое отклонение атласа. Проверка: Кириллическая транслитерация.
- [A151-203-F030](#a151-203-f030): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 154

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=154) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=154)

- [A151-203-F020](#a151-203-f020): Подтверждённое отклонение атласа. Проверка: Термины.
- [A151-203-F021](#a151-203-f021): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 155

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=155) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=155)

- [A151-203-F016](#a151-203-f016): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [A151-203-F017](#a151-203-f017): Подтверждённое отклонение атласа. Проверка: Огласовки, Латинская транслитерация, Кириллическая транслитерация.
- [A151-203-F022](#a151-203-f022): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 156

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=156) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=156)

- [A151-203-F003](#a151-203-f003): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A151-203-F017](#a151-203-f017): Подтверждённое отклонение атласа. Проверка: Огласовки, Латинская транслитерация, Кириллическая транслитерация.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 157

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=157) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=157)

- [A151-203-F004](#a151-203-f004): Неустановленное расхождение. Исходный текст: отклонение или ограничение.
- [A151-203-F018](#a151-203-f018): Подтверждённое отклонение атласа. Проверка: Латинская транслитерация, Кириллическая транслитерация.
- [A151-203-F019](#a151-203-f019): Подтверждённое отклонение атласа. Проверка: editorial_metadata.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 2 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 158

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=158) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=158)

- [A151-203-F016](#a151-203-f016): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 159

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=159) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=159)

- [A151-203-F013](#a151-203-f013): Подтверждённое отклонение атласа. Исходный текст: отклонение или ограничение.
- [A151-203-F014](#a151-203-f014): Подтверждённое отклонение атласа. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 28 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 160

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=160) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=160)

- [A151-203-F009](#a151-203-f009): Подтверждённое отклонение атласа. Исходный текст: отклонение или ограничение.
- [A151-203-F010](#a151-203-f010): Подтверждённое отклонение атласа. Исходный текст: отклонение или ограничение.
- [A151-203-F011](#a151-203-f011): Подтверждённое отклонение атласа. Исходный текст: отклонение или ограничение.
- [A151-203-F012](#a151-203-f012): Подтверждённое отклонение атласа. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 10 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 161

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=161) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=161)

- [A151-203-F016](#a151-203-f016): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 162

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=162) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=162)

- [A151-203-F017](#a151-203-f017): Подтверждённое отклонение атласа. Проверка: Огласовки, Латинская транслитерация, Кириллическая транслитерация.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 2 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 163

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=163) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=163)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 164

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=164) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=164)

- [A151-203-F016](#a151-203-f016): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [A151-203-F017](#a151-203-f017): Подтверждённое отклонение атласа. Проверка: Огласовки, Латинская транслитерация, Кириллическая транслитерация.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 3 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 165

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=165) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=165)

- [A151-203-F030](#a151-203-f030): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 2 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 166

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=166) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=166)

- [A151-203-F016](#a151-203-f016): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [A151-203-F022](#a151-203-f022): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A151-203-F023](#a151-203-f023): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 167

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=167) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=167)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 168

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=168) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=168)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 169

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=169) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=169)

- [A151-203-F005](#a151-203-f005): Подтверждённое отклонение атласа. Проверка: Точный исходный текст, Структура, Огласовки, Латинская транслитерация, Кириллическая транслитерация, Полнота русского перевода.
- [A151-203-F024](#a151-203-f024): Подтверждённое отклонение атласа. Проверка: Латинская транслитерация, Кириллическая транслитерация.
- [A151-203-F025](#a151-203-f025): Подтверждённое отклонение атласа. Перевод читаемого фрагмента не заполнен.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 170

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=170) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=170)

- [A151-203-F016](#a151-203-f016): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [A151-203-F026](#a151-203-f026): Подтверждённое отклонение атласа. Пропущена часть исходной подписи.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 5 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 171

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=171) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=171)

- [A151-203-F023](#a151-203-f023): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 3 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 172

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=172) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=172)

- [A151-203-F023](#a151-203-f023): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 5 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 173

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=173) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=173)

- [A151-203-F023](#a151-203-f023): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 5 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 174

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=174) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=174)

- [A151-203-F027](#a151-203-f027): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 175

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=175) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=175)

- [A151-203-F028](#a151-203-f028): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 176

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=176) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=176)

- [A151-203-F029](#a151-203-f029): Подтверждённое отклонение атласа. Проверка: Полнота русского перевода.
- [A151-203-F030](#a151-203-f030): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 3 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 177

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=177) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=177)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 178

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=178) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=178)

- [A151-203-F031](#a151-203-f031): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 2 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 179

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=179) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=179)

- [A151-203-F032](#a151-203-f032): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 180

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=180) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=180)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 181

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=181) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=181)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 182

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=182) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=182)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 183

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=183) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=183)

- [A151-203-F033](#a151-203-f033): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 2 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 184

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=184) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=184)

- [A151-203-F033](#a151-203-f033): Подтверждённое отклонение атласа. Проверка: Огласовки.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 185

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=185) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=185)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 186

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=186) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=186)

- [A151-203-F008](#a151-203-f008): Подтверждённое отклонение атласа. Искажена связь в переводе.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 187

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=187) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=187)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 188

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=188) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=188)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 189

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=189) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=189)

- [A151-203-F034](#a151-203-f034): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 190

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=190) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=190)

- [A151-203-F030](#a151-203-f030): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 3 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 191

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=191) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s17-steels&pg=191)

- [A191-203-L001](#a191-203-l001): Не подтверждено как ошибка атласа. Расхождение учебного чтения.
- [A191-203-S002](#a191-203-s002): Подтверждённое отклонение атласа. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 2 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 192

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=192) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s18-powder-metallurgy&pg=192)

- [A151-203-F006](#a151-203-f006): Особенность или ошибка исходника. Исходный текст: отклонение или ограничение.
- [A191-203-F006](#a191-203-f006): Подтверждённое отклонение атласа. Проверка: Огласовки, Латинская транслитерация, Кириллическая транслитерация.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 193

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=193) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s18-powder-metallurgy&pg=193)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 194

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=194) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s19-aluminium&pg=194)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 195

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=195) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s19-aluminium&pg=195)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 196

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=196) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s19-aluminium&pg=196)

- [A191-203-L002](#a191-203-l002): Не подтверждено как ошибка атласа. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 197

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=197) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s19-aluminium&pg=197)

- [A191-203-F001](#a191-203-f001): Подтверждённое отклонение атласа. Исходный текст: отклонение или ограничение.
- [A191-203-F002](#a191-203-f002): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A191-203-F003](#a191-203-f003): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A191-203-S001](#a191-203-s001): Подтверждённое отклонение атласа. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 198

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=198) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s19-aluminium&pg=198)

- [A151-203-F007](#a151-203-f007): Подтверждённое отклонение атласа. Неточная передача исходного текста.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 199

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=199) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s19-aluminium&pg=199)

- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 200

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=200) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s19-aluminium&pg=200)

- [A191-203-F004](#a191-203-f004): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A191-203-S002](#a191-203-s002): Подтверждённое отклонение атласа. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 201

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=201) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s19-aluminium&pg=201)

- [A191-203-F003](#a191-203-f003): Подтверждённое отклонение атласа. Отклонение огласовок или согласованного чтения.
- [A191-203-F006](#a191-203-f006): Подтверждённое отклонение атласа. Проверка: Огласовки, Латинская транслитерация, Кириллическая транслитерация.
- [A191-203-S002](#a191-203-s002): Подтверждённое отклонение атласа. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 0 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 202

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=202) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s19-aluminium&pg=202)

- [A191-203-F006](#a191-203-f006): Подтверждённое отклонение атласа. Проверка: Огласовки, Латинская транслитерация, Кириллическая транслитерация.
- [A191-203-S002](#a191-203-s002): Подтверждённое отклонение атласа. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

### Страница 203

Глубокий пакет завершён. UI: есть ограниченные сохранённые наблюдения.
[Оригинал](sources/source.pdf#page=203) · [Атлас](https://linguistpro.kolosei.com/study-library.html#room=atlas%3Aa97001rc32&sec=s20-composites&pg=203)

- [A191-203-F005](#a191-203-f005): Подтверждённое отклонение атласа. Расхождение учебного чтения.
- [A191-203-L003](#a191-203-l003): Не подтверждено как ошибка атласа. Исходный текст: отклонение или ограничение.
- [PUB-GAP-ACRONYM](#pub-gap-acronym): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-SUBTITLE](#pub-gap-subtitle): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
- [PUB-GAP-TITLE](#pub-gap-title): Подтверждённое отклонение атласа. Проверка: he, ru, he_niqqud, translit, translit_ru.
Незавершённые применимые оси: 1 единиц. Точные ID и статусы приведены в remaining_axes.csv.

## Адресные замечания

### A001-005-D001
Подтверждённое отклонение атласа. Страницы: 1. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p1:b004

**Наблюдение:**
Pealim distinguishes absolute/construct, both have tsere. This is a normative-vowel-mark deviation without a Modern Hebrew pronunciation difference.

**Исходник:**
סמל בחינה 97001

**Текущая запись:**
he: סמל בחינה 97001
he_niqqud: סֶמֶל בְּחִינָה 97001
translit: Semel bkhina 97001
translit_ru: сэмэл бхина 97001
ru: Код экзамена 97001

**Исправление / интерпретация:**
В слове סמל использовать סֵמֶל (цере, не сегол), в том числе в сопряжённой форме. Источник HE и произношение Semel / сэмэл не менять.

Доказательства: [файл1](sources/source.pdf#page=1), [файл2](sources/sections/s00-front.json)
Словарные источники: [источник1](https://www.pealim.com/dict/6101-semel/)

### A001-005-D002
Подтверждённое отклонение атласа. Страницы: 4. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p4:t-base-units:cell:0:2

**Наблюдение:**
Pealim distinguishes absolute/construct, both have tsere. This is a normative-vowel-mark deviation without a Modern Hebrew pronunciation difference.

**Исходник:**
סמל יחידה

**Текущая запись:**
he: סמל יחידה
he_niqqud: סֶמֶל יְחִידָה
translit: Semel yekhida
translit_ru: сэмэл йэхида
ru: Обозначение единицы

**Исправление / интерпретация:**
В слове סמל использовать סֵמֶל (цере, не сегол), в том числе в сопряжённой форме. Источник HE и произношение Semel / сэмэл не менять.

Доказательства: [файл1](sources/source.pdf#page=4), [файл2](sources/sections/s01-units.json)
Словарные источники: [источник1](https://www.pealim.com/dict/6101-semel/)

### A001-005-D003
Подтверждённое отклонение атласа. Страницы: 4. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p4:t-prefixes:cell:0:1

**Наблюдение:**
Pealim distinguishes absolute/construct, both have tsere. This is a normative-vowel-mark deviation without a Modern Hebrew pronunciation difference.

**Исходник:**
סמל

**Текущая запись:**
he: סמל
he_niqqud: סֶמֶל
translit: Semel
translit_ru: сэмэл
ru: Обозначение

**Исправление / интерпретация:**
В слове סמל использовать סֵמֶל (цере, не сегол), в том числе в сопряжённой форме. Источник HE и произношение Semel / сэмэл не менять.

Доказательства: [файл1](sources/source.pdf#page=4), [файл2](sources/sections/s01-units.json)
Словарные источники: [источник1](https://www.pealim.com/dict/6101-semel/)

### A001-005-D004
Подтверждённое отклонение атласа. Страницы: 4. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p4:t-derived-units:cell:0:1

**Наблюдение:**
Pealim distinguishes absolute/construct, both have tsere. This is a normative-vowel-mark deviation without a Modern Hebrew pronunciation difference.

**Исходник:**
סמל

**Текущая запись:**
he: סמל
he_niqqud: סֶמֶל
translit: Semel
translit_ru: сэмэл
ru: Обозначение

**Исправление / интерпретация:**
В слове סמל использовать סֵמֶל (цере, не сегол), в том числе в сопряжённой форме. Источник HE и произношение Semel / сэмэл не менять.

Доказательства: [файл1](sources/source.pdf#page=4), [файл2](sources/sections/s01-units.json)
Словарные источники: [источник1](https://www.pealim.com/dict/6101-semel/)

### A001-005-D005
Подтверждённое отклонение атласа. Страницы: 5. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p5:t-derived-units:cell:0:1

**Наблюдение:**
Pealim distinguishes absolute/construct, both have tsere. This is a normative-vowel-mark deviation without a Modern Hebrew pronunciation difference.

**Исходник:**
סמל

**Текущая запись:**
he: סמל
he_niqqud: סֶמֶל
translit: Semel
translit_ru: сэмэл
ru: Обозначение

**Исправление / интерпретация:**
В слове סמל использовать סֵמֶל (цере, не сегол), в том числе в сопряжённой форме. Источник HE и произношение Semel / сэмэл не менять.

Доказательства: [файл1](sources/source.pdf#page=5), [файл2](sources/sections/s01-units.json)
Словарные источники: [источник1](https://www.pealim.com/dict/6101-semel/)

### A001-005-D006
Подтверждённое отклонение атласа. Страницы: 2. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p2:b006:s01

**Наблюдение:**
Current מוּשְׂגֵי and חוּקִים omit sin/qoph dagesh. Exact plural construct and plural absolute morphology verified, not inferred from the singular.

**Исходник:**
2. מושגי יסוד, חוקים ואקסיומות סטטיקה

**Текущая запись:**
he: 2. מושגי יסוד, חוקים ואקסיומות סטטיקה
he_niqqud: 2. מוּשְׂגֵי יְסוֹד, חוּקִים וְאַקְסִיּוֹמוֹת סְטָטִיקָה
translit: 2. Musgei yesod, khukim ve'aksiyomot statika
translit_ru: 2. мусгэи йэсод, хуким вэ’аксийомот статика
ru: 2. Основные понятия, законы и аксиомы статики

**Исправление / интерпретация:**
Вернуть нормативные нефонематические dagesh: מוּשְּׂגֵי / מֻשְּׂגֵי и חוּקִּים / חֻקִּים. Выбор полного/неполного написания отдельно; musgei и khukim уже передают современное чтение.

Доказательства: [файл1](sources/source.pdf#page=2), [файл2](sources/sections/s00-front.json)
Словарные источники: [источник1](https://www.pealim.com/dict/4125-musag/), [источник2](https://www.pealim.com/dict/5269-chok/)

### A001-005-D007
Подтверждённое отклонение атласа. Страницы: 3. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p3:b006:s01

**Наблюдение:**
Plural construct מושגי יסוד. No pronunciation-error claim.

**Исходник:**
15. מבוא ומושגי יסוד

**Текущая запись:**
he: 15. מבוא ומושגי יסוד
he_niqqud: 15. מָבוֹא וּמוּשְׂגֵי יְסוֹד
translit: 15. Mavo umusgei yesod
translit_ru: 15. маво умусгэи йэсод
ru: 15. Введение и основные понятия

**Исправление / интерпретация:**
В וּמוּשְׂגֵי вернуть dagesh: וּמוּשְּׂגֵי (либо последовательно וּמֻשְּׂגֵי). TR umusgei верен.

Доказательства: [файл1](sources/source.pdf#page=3), [файл2](sources/sections/s00-front.json)
Словарные источники: [источник1](https://www.pealim.com/dict/4125-musag/)

### A001-005-D008
Подтверждённое отклонение атласа. Страницы: 4. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p4:b006

**Наблюдение:**
Academy lemma קִדֹּמֶת; regular plural retains medial dagesh. Kidomot pronunciation unchanged.

**Исходник:**
קידומות הכפלה וחילוק

**Текущая запись:**
he: קידומות הכפלה וחילוק
he_niqqud: קִידוֹמוֹת הַכְפָּלָה וְחִילּוּק
translit: Kidomot hakhpala vekhiluk
translit_ru: кидомот хахпала вэхилук
ru: Приставки умножения и деления

**Исправление / интерпретация:**
В קִידוֹמוֹת восстановить dagesh דּ: קִידּוֹמוֹת (или קִדּוֹמוֹת в выбранном дефективном написании).

Доказательства: [файл1](sources/source.pdf#page=4), [файл2](sources/sections/s01-units.json)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/Ktaim/ShowKtaim?kodErekhIvrit=18960)

### A001-005-D009
Подтверждённое отклонение атласа. Страницы: 4. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p4:t-prefixes:cell:0:0

**Наблюдение:**
Exact Academy lemma. This is not a complaint about preserving the source yod/vav.

**Исходник:**
קידומת

**Текущая запись:**
he: קידומת
he_niqqud: קִידוֹמֶת
translit: Kidomet
translit_ru: кидомэт
ru: Приставка

**Исправление / интерпретация:**
В קִידוֹמֶת восстановить dagesh דּ: קִידּוֹמֶת (или קִדֹּמֶת).

Доказательства: [файл1](sources/source.pdf#page=4), [файл2](sources/sections/s01-units.json)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/Ktaim/ShowKtaim?kodErekhIvrit=18960)

### A001-005-D010
Подтверждённое отклонение атласа. Страницы: 3. Важность: существенное.
Расхождение учебного чтения

Адреса: a97001:p3:b005

**Наблюдение:**
Current body hakhomarim conflicts with canonical materials-science hekhomarim. Pealim confirms plural חֳמָרִים; HUJI pronunciation guidance states segol article before ח with hataf-qamats. Source is unpointed and must remain untouched.

**Исходник:**
תורת החומרים

**Текущая запись:**
he: תורת החומרים
he_niqqud: תּוֹרַת הַחוֹמָרִים
translit: Torat hakhomarim
translit_ru: торат хахомарим
ru: Материаловедение

**Исправление / интерпретация:**
Согласовать учебное чтение с нормативным артиклем перед חֳ и уже принятой canonical term: תּוֹרַת הֶחֳמָרִים, torat hekhomarim / торат хехомарим. Само по себе полное חוֹמָרִים не объявляется ошибкой.

Доказательства: [файл1](sources/source.pdf#page=3), [файл2](sources/sections/s00-front.json)
Словарные источники: [источник1](https://www.pealim.com/dict/3209-chomer/), [источник2](https://msradio.huji.ac.il/hagiya.html)

### A001-005-D011
Подтверждённое отклонение атласа. Страницы: 3. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p3:b001:s02; a97001:p3:b002

**Исходник:**
a97001:p3:b001:s02: 13. מידות
a97001:p3:b002: סבולת מידה (טולרנס)

**Текущая запись:**
lemma_he: מידה
niqqud: מִידָה
translit: Mida
translit_ru: мида
senses: sense: mechanics
ru: размер

**Исправление / интерпретация:**
В s00-front canonical dimension восстановить dagesh דּ: מִידָּה / מִדָּה. Современное Mida / мида не меняется. Полное написание само по себе не дефект.

Доказательства: [файл1](sources/sections/s00-front.json)
Словарные источники: [источник1](https://www.pealim.com/dict/5858-mida/)

### A001-050-F001
Подтверждённое отклонение атласа. Страницы: 6. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p6:b002

**Наблюдение:**
Проверено именно construct plural; это не перенос словарной абсолютной формы. Крупный crop a97001_p6_b002.png.

**Исходник:**
2. מושגי יסוד, חוקים ואקסיומות סטטיקה

**Текущая запись:**
he_niqqud: 2. מֻשָּׂגֵי יְסוֹד, חֻקִּים וְאַקְסִיוֹמוֹת סְטָטִיקָה
translit: 2. musagei yesod, khukim ve'aksiomot statika
translit_ru: 2. мусагэи йэсод, хуким вэ’аксиомот статика

**Исправление / интерпретация:**
В сопряжённом множественном מושגי יסוד использовать מֻשְּׂגֵי יְסוֹד (допустимая полная орфография огласованного слоя выбирается последовательно), musgei yesod / мусгэй йэсод. HE/RU не менять.

Доказательства: [файл1](sources/source.pdf#page=6), [файл2](sources/sections/s02-statics-basics.json), [файл3](https://linguistpro.kolosei.com/data/atlas/a97001/assets/d85d285519f42e88cf22cc1354030cbd14da8b6643a8f1ae7654c390467eb754.png)
Словарные источники: [источник1](https://www.pealim.com/dict/4125-musag/)

### A001-050-F002
Подтверждённое отклонение атласа. Страницы: 28. Важность: существенное.
Несоответствие транслитерации

Адреса: a97001:p28:b004

**Наблюдение:**
HE и RU передают смысл; дефект относится к полноте/пригодности чтения. Это не требование молча исправлять оригинал.

**Исходник:**
במקרה זה ויש כוח/ות נטוי/ים נסמן את זווית/יות הכוח/ות ביחס לציר ה-x.

**Текущая запись:**
he_niqqud: בַּמִּקְרֶה זֶה וְיֵשׁ כּוֹחַ/וֹת נָטוּי/יִם נְסַמֵּן אֶת זָווִית/יוֹת הַכּוֹחַ/וֹת בְּיַחַס לְצִיר הַ-x.
translit: Bamikre ze veyesh koakh/ot natuy/im nesamen et zavit/yot hakoakh/ot beyakhas letsir ha-x.
translit_ru: бамикрэ зэ вэйэш коах/от натуй/им нэсамэн эт завит/йот хакоах/от бэйахас лэцир ха-x.
ru: В этом случае, если имеется наклонная сила/имеются наклонные силы, отметим угол/углы силы/сил относительно оси x.

**Исправление / интерпретация:**
Сохранить исходные slash-сокращения в HE; в произносительном учебном слое дать полные согласованные альтернативы כּוֹחַ נָטוּי / כּוֹחוֹת נְטוּיִים, זָוִית / זָוִיּוֹת по контексту либо явно удержать чтение. Не выдавать /от, /им, /йот за произносимые слова.

Доказательства: [файл1](sources/source.pdf#page=28), [файл2](sources/sections/s04-parallel-forces.json)

### A001-050-F003
Подтверждённое отклонение атласа. Страницы: 28. Важность: существенное.
Несоответствие транслитерации

Адреса: a97001:p28:b008:s01

**Наблюдение:**
HE и RU передают смысл; дефект относится к полноте/пригодности чтения. Это не требование молча исправлять оригинал.

**Исходник:**
2) נפרק כוח/ות נטוי/ים לרכיבים ישרי זווית.

**Текущая запись:**
he_niqqud: 2) נְפָרֵק כּוֹחַ/וֹת נָטוּי/יִם לִרְכִיבִים יִשְׁרֵי זָווִית.
translit: 2) Nefarek koakh/ot natuy/im lirkhivim yishrey zavit.
translit_ru: 2) нэфарэк коах/от натуй/им лирхивим йишрэй завит.
ru: 2) Разложим наклонную силу/наклонные силы на прямоугольные составляющие.

**Исправление / интерпретация:**
Сохранить исходные slash-сокращения в HE; в произносительном учебном слое дать полные согласованные альтернативы כּוֹחַ נָטוּי / כּוֹחוֹת נְטוּיִים, זָוִית / זָוִיּוֹת по контексту либо явно удержать чтение. Не выдавать /от, /им, /йот за произносимые слова.

Доказательства: [файл1](sources/source.pdf#page=28), [файл2](sources/sections/s04-parallel-forces.json)

### A001-050-F004
Подтверждённое отклонение атласа. Страницы: 29. Важность: существенное.
Несоответствие транслитерации

Адреса: a97001:p29:b006

**Наблюдение:**
HE и RU передают смысл; дефект относится к полноте/пригодности чтения. Это не требование молча исправлять оригинал.

**Исходник:**
במקרה זה ויש כוח/ות נטוי/ים נסמן את זווית/יות הכוח/ות ביחס לציר ה-x.

**Текущая запись:**
he_niqqud: בַּמִּקְרֶה זֶה וְיֵשׁ כּוֹחַ/וֹת נָטוּי/יִם נְסַמֵּן אֶת זָווִית/יוֹת הַכּוֹחַ/וֹת בְּיַחַס לְצִיר הַ-x.
translit: Bamikre ze veyesh koakh/ot natuy/im nesamen et zavit/yot hakoakh/ot beyakhas letsir ha-x.
translit_ru: бамикрэ зэ вэйэш коах/от натуй/им нэсамэн эт завит/йот хакоах/от бэйахас лэцир ха-x.
ru: В этом случае, если имеется наклонная сила/имеются наклонные силы, отметим угол/углы силы/сил относительно оси x.

**Исправление / интерпретация:**
Сохранить исходные slash-сокращения в HE; в произносительном учебном слое дать полные согласованные альтернативы כּוֹחַ נָטוּי / כּוֹחוֹת נְטוּיִים, זָוִית / זָוִיּוֹת по контексту либо явно удержать чтение. Не выдавать /от, /им, /йот за произносимые слова.

Доказательства: [файл1](sources/source.pdf#page=29), [файл2](sources/sections/s04-parallel-forces.json)

### A001-050-F005
Подтверждённое отклонение атласа. Страницы: 31. Важность: существенное.
Несоответствие транслитерации

Адреса: a97001:p31:b006

**Наблюдение:**
HE и RU передают смысл; дефект относится к полноте/пригодности чтения. Это не требование молча исправлять оригинал.

**Исходник:**
במקרה זה ויש כוח/ות נטוי/ים נסמן את זווית/יות הכוח/ות ביחס לציר ה-x.

**Текущая запись:**
he_niqqud: בַּמִּקְרֶה זֶה וְיֵשׁ כּוֹחַ/וֹת נָטוּי/יִם נְסַמֵּן אֶת זָווִית/יוֹת הַכּוֹחַ/וֹת בְּיַחַס לְצִיר הַ-x.
translit: Bamikre ze veyesh koakh/ot natuy/im nesamen et zavit/yot hakoakh/ot beyakhas letsir ha-x.
translit_ru: бамикрэ зэ вэйэш коах/от натуй/им нэсамэн эт завит/йот хакоах/от бэйахас лэцир ха-x.
ru: В этом случае, если имеется наклонная сила/имеются наклонные силы, отметим угол/углы силы/сил относительно оси x.

**Исправление / интерпретация:**
Сохранить исходные slash-сокращения в HE; в произносительном учебном слое дать полные согласованные альтернативы כּוֹחַ נָטוּי / כּוֹחוֹת נְטוּיִים, זָוִית / זָוִיּוֹת по контексту либо явно удержать чтение. Не выдавать /от, /им, /йот за произносимые слова.

Доказательства: [файл1](sources/source.pdf#page=31), [файл2](sources/sections/s04-parallel-forces.json)

### A001-050-F006
Подтверждённое отклонение атласа. Страницы: 32. Важность: существенное.
Несоответствие транслитерации

Адреса: a97001:p32:b002

**Наблюдение:**
HE и RU передают смысл; дефект относится к полноте/пригодности чтения. Это не требование молча исправлять оригинал.

**Исходник:**
2) נפרק כוח/ות נטוי/ים לרכיבים ישרי זווית

**Текущая запись:**
he_niqqud: 2) נְפָרֵק כּוֹחַ/וֹת נָטוּי/יִם לִרְכִיבִים יִשְׁרֵי זָווִית
translit: 2) Nefarek koakh/ot natuy/im lirkhivim yishrey zavit
translit_ru: 2) нэфарэк коах/от натуй/им лирхивим йишрэй завит
ru: 2) Разложим наклонную силу/наклонные силы на прямоугольные составляющие

**Исправление / интерпретация:**
Сохранить исходные slash-сокращения в HE; в произносительном учебном слое дать полные согласованные альтернативы כּוֹחַ נָטוּי / כּוֹחוֹת נְטוּיִים, זָוִית / זָוִיּוֹת по контексту либо явно удержать чтение. Не выдавать /от, /им, /йот за произносимые слова.

Доказательства: [файл1](sources/source.pdf#page=32), [файл2](sources/sections/s04-parallel-forces.json)

### A001-050-F007
Подтверждённое отклонение атласа. Страницы: 47. Важность: существенное.
Несоответствие транслитерации

Адреса: a97001:p47:b002

**Наблюдение:**
סִיבּוּבִית и sivuvit/сивувит не являются одним чтением. Академия отдельно подтверждает вариант סִיבוּב.

**Исходник:**
אין תנועה סיבובית סביב נקודת ציר מוגדרת – A

**Текущая запись:**
he_niqqud: אֵין תְּנוּעָה סִיבּוּבִית סְבִיב נְקֻדַּת צִיר מֻגְדֶּרֶת – A
translit: Ein tnua sivuvit sviv nekudat tsir mugderet – A
translit_ru: эйн тнуа сивувит свив нэкудат цир мугдэрэт – A

**Исправление / интерпретация:**
Согласовать בּ с b/б в транслитерации либо выбрать засвидетельствованный вариант без дагеша и согласовать обе записи. Не объявлять само чтение sivuv ошибочным.

Доказательства: [файл1](sources/source.pdf#page=47), [файл2](sources/sections/s06-trusses.json)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/20409_1/%D7%A1%D6%B4%D7%99%D7%91%D7%95%D6%BC%D7%91)

### A001-050-F008
Подтверждённое отклонение атласа. Страницы: 48. Важность: существенное.
Несоответствие транслитерации

Адреса: a97001:p48:b004

**Наблюдение:**
סִיבּוּבִית и sivuvit/сивувит не являются одним чтением. Академия отдельно подтверждает вариант סִיבוּב.

**Исходник:**
אין תנועה סיבובית סביב נקודת ציר מוגדרת – B

**Текущая запись:**
he_niqqud: אֵין תְּנוּעָה סִיבּוּבִית סְבִיב נְקֻדַּת צִיר מֻגְדֶּרֶת – B
translit: Ein tnua sivuvit sviv nekudat tsir mugderet – B
translit_ru: эйн тнуа сивувит свив нэкудат цир мугдэрэт – B

**Исправление / интерпретация:**
Согласовать בּ с b/б в транслитерации либо выбрать засвидетельствованный вариант без дагеша и согласовать обе записи. Не объявлять само чтение sivuv ошибочным.

Доказательства: [файл1](sources/source.pdf#page=48), [файл2](sources/sections/s06-trusses.json)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/20409_1/%D7%A1%D6%B4%D7%99%D7%91%D7%95%D6%BC%D7%91)

### A001-050-F009
Подтверждённое отклонение атласа. Страницы: 48. Важность: существенное.
Несоответствие транслитерации

Адреса: a97001:p48:b006:s02

**Наблюдение:**
סִיבּוּבִית и sivuvit/сивувит не являются одним чтением. Академия отдельно подтверждает вариант סִיבוּב.

**Исходник:**
אין תנועה סיבובית סביב נקודת ציר מוגדרת – E

**Текущая запись:**
he_niqqud: אֵין תְּנוּעָה סִיבּוּבִית סְבִיב נְקֻדַּת צִיר מֻגְדֶּרֶת – E
translit: Ein tnua sivuvit sviv nekudat tsir mugderet – E
translit_ru: эйн тнуа сивувит свив нэкудат цир мугдэрэт – E

**Исправление / интерпретация:**
Согласовать בּ с b/б в транслитерации либо выбрать засвидетельствованный вариант без дагеша и согласовать обе записи. Не объявлять само чтение sivuv ошибочным.

Доказательства: [файл1](sources/source.pdf#page=48), [файл2](sources/sections/s06-trusses.json)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/20409_1/%D7%A1%D6%B4%D7%99%D7%91%D7%95%D6%BC%D7%91)

### A006-015-D001
Подтверждённое отклонение атласа. Страницы: 12. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p12:b012:s03

**Наблюдение:**
Pealim singular construct תּוֹצָאַת־ totza'at, plural construct תּוֹצְאוֹת־ totz'ot. Exact source fragment visually checked at3.1×. This is a phonemic vowel error, unlike nonphonemic dagesh findings.

**Исходник:**
אם תוצאת חישוב כוח התגובה חיובית

**Текущая запись:**
he: אם תוצאת חישוב כוח התגובה חיובית
he_niqqud: אִם תּוֹצְאַת חִשּׁוּב כּוֹחַ הַתְּגוּבָה חִיּוּבִית
translit: Im totse'at khishuv koakh hatguva khiyuvit
translit_ru: им тоцэ’ат хишув коах хатгува хиювит

**Исправление / интерпретация:**
Для singular construct תוצאת использовать תּוֹצָאַת / totsa'at (или totza'at в принятой записи ts/z) / тоца’ат. Не переносить sheva из plural construct תּוֹצְאוֹת. HE и RU верны и не нуждаются в изменении.

Доказательства: [файл1](sources/source.pdf#page=12), [файл2](evidence/416d35193d24c73a.png), [файл3](sources/sections/s02-statics-basics.json)
Словарные источники: [источник1](https://www.pealim.com/dict/5611-totzaa/)

### A006-015-D002
Подтверждённое отклонение атласа. Страницы: 15. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p15:b002; a97001:p15:b005

**Наблюдение:**
Scoped addendum after comparing corresponding patterns on sheets16–25. Pealim6026 explicitly covers absolute and suffixed forms; nonphonemic dagesh, no TR error. Previous NI-pass on these2 units superseded, inspection completeness unchanged.

**Исходник:**
a97001:p15:b002: הגדרה: מערכת כוחות שקווי פעולתם נחתכים בנקודה אחת משותפת.
a97001:p15:b005: כאשר על גוף פועלים מספר כוחות והוא אינו בשיווי משקל, אם ברצוננו לגרום לגוף להימצא בשיווי משקל, עלינו להוסיף כוח שיאזן את שקול הכוחות, עוצמתו תהיה שווה לשקול הכוחות, ומיקומו יהיה על אותו קו פעולה בכיוון מנוגד.

**Текущая запись:**
a97001:p15:b002: he: הגדרה: מערכת כוחות שקווי פעולתם נחתכים בנקודה אחת משותפת.
he_niqqud: הַגְדָּרָה: מַעֲרֶכֶת כּוֹחוֹת שֶׁקַּוֵּי פְּעוּלָתָם נֶחְתָּכִים בִּנְקוּדָּה אַחַת מְשֻׁתֶּפֶת.
translit: Hagdara: maarekhet kokhot shekavei peulatam nekhtakhim binkuda akhat meshutefet.
translit_ru: хагдара: маарэхэт кохот шэкавэй пэулатам нэхтахим бинкуда ахат мэшутэфэт.
ru: Определение: система сил, линии действия которых пересекаются в одной общей точке.
a97001:p15:b005: he: כאשר על גוף פועלים מספר כוחות והוא אינו בשיווי משקל, אם ברצוננו לגרום לגוף להימצא בשיווי משקל, עלינו להוסיף כוח שיאזן את שקול הכוחות, עוצמתו תהיה שווה לשקול הכוחות, ומיקומו יהיה על אותו קו פעולה בכיוון מנוגד.
he_niqqud: כַּאֲשֶׁר עַל גּוּף פּוֹעֲלִים מִסְפַּר כּוֹחוֹת וְהוּא אֵינוֹ בְּשִׁוּוּי מִשְׁקָל, אִם בִּרְצוֹנֵנוּ לִגְרוֹם לַגּוּף לְהִימָּצֵא בְּשִׁוּוּי מִשְׁקָל, עָלֵינוּ לְהוֹסִיף כּוֹחַ שֶׁיְּאַזֵּן אֶת שְׁקוּל הַכּוֹחוֹת, עוֹצְמָתוֹ תִּהְיֶה שָׁוָה לִשְׁקוּל הַכּוֹחוֹת, וּמִיקּוּמוֹ יִהְיֶה עַל אוֹתוֹ קַו פְּעוּלָה בְּכִוּוּן מְנוּגָּד.
translit: Kaasher al guf poalim mispar kokhot vehu eino beshivui mishkal, im birtsonenu ligrom laguf lehimatse beshivui mishkal, aleinu lehosif koakh sheyeazen et shkul hakokhot, otsmato tihye shava lishkul hakokhot, umikumo yihye al oto kav peula bekivun menugad.
translit_ru: каашэр аль гуф поалим миспар кохот вэху эйно бэшивуй мишкаль, им бирцонэну лигром лагуф лэхимацэ бэшивуй мишкаль, алэйну лэхосиф коах шэйэазэн эт шкуль хакохот, оцмато тихйэ шава лишкуль хакохот, умикумо йихйэ аль ото кав пэула бэкивун мэнугад.
ru: Когда на тело действует несколько сил и оно не находится в равновесии, если мы хотим привести тело в состояние равновесия, мы должны добавить силу, которая уравновесит равнодействующую сил; её величина будет равна равнодействующей сил, а расположена она будет на той же линии действия в противоположном направлении.

**Исправление / интерпретация:**
Восстановить нормативный dagesh לּ в פְּעוּלָּתָם и פְּעוּלָּה (или последовательное дефективное פְּעֻלָּתָם/פְּעֻלָּה). Полное написание само по себе не дефект. TR/HE/RU не менять.

Доказательства: [файл1](sources/source.pdf#page=15)
Словарные источники: [источник1](https://www.pealim.com/dict/6026-peula/)

### A016-025-D001
Подтверждённое отклонение атласа. Страницы: 17. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p17:b002:s01

**Наблюдение:**
Normative marking only; modern pronunciation unchanged, both TR remain correct. Full spelling itself is not considered a defect.

**Исходник:**
a97001:p17:b002:s01: גלגלת נייחת (Fixed Pulley)

**Текущая запись:**
a97001:p17:b002:s01: he: גלגלת נייחת (Fixed Pulley)
he_niqqud: גַּלְגֶּלֶת נַיָּחַת (Fixed Pulley)
translit: Galgelet nayakhat (Fixed Pulley)
translit_ru: гальгэлэт наяхат (Fixed Pulley)
ru: Неподвижный блок (Fixed Pulley)

**Исправление / интерпретация:**
В feminine נייחת заменить qamats подי наpatah: נַיַּחַת. То же исправление в canonical fixed-pulley. Nayakhat/наяхат не менять.

Доказательства: [файл1](sources/source.pdf#page=17)
Словарные источники: [источник1](https://www.pealim.com/dict/8863-nayach/)

### A016-025-D002
Подтверждённое отклонение атласа. Страницы: 16, 17, 19, 22. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p16:b006; a97001:p16:b007:s01; a97001:p17:b003:s01; a97001:p19:b002:s01; a97001:p22:b005:s01

**Наблюдение:**
Normative marking only; modern pronunciation unchanged, both TR remain correct. Full spelling itself is not considered a defect.

**Исходник:**
a97001:p16:b006: נשער פעולת כוחות תגובה.
a97001:p16:b007:s01: על-פי החוק השלישי של ניוטון מפעילה הקרקע כוח תגובה (הניצב לפני השטח). מיקומו בהמשך קו הפעולה של כוח המשקל וכיוונו הפוך לכיוון פעולת כוח המשקל.
a97001:p17:b003:s01: משמשת לשינוי כיוון פעולת הכוח
a97001:p19:b002:s01: נשער פעולת כוחות תגובה.
a97001:p22:b005:s01: נשער פעולת כוחות תגובה.

**Текущая запись:**
a97001:p16:b006: he: נשער פעולת כוחות תגובה.
he_niqqud: נְשַׁעֵר פְּעוּלַת כּוֹחוֹת תְּגוּבָה.
translit: Neshaer peulat kokhot tguva.
translit_ru: нэшаэр пэулат кохот тгува.
ru: Предположим действие сил реакции.
a97001:p16:b007:s01: he: על-פי החוק השלישי של ניוטון מפעילה הקרקע כוח תגובה (הניצב לפני השטח). מיקומו בהמשך קו הפעולה של כוח המשקל וכיוונו הפוך לכיוון פעולת כוח המשקל.
he_niqqud: עַל-פִּי הַחוֹק הַשְּׁלִישִׁי שֶׁל נְיוּטוֹן מַפְעִילָה הַקַּרְקַע כּוֹחַ תְּגוּבָה (הַנִּיצָּב לִפְנֵי הַשֶּׁטַח). מִיקּוּמוֹ בְּהֶמְשֵׁךְ קַו הַפְּעוּלָה שֶׁל כּוֹחַ הַמִּשְׁקָל וְכִוּוּנוֹ הָפוּךְ לְכִוּוּן פְּעוּלַת כּוֹחַ הַמִּשְׁקָל.
translit: Al-pi hakhok hashlishi shel Nyuton mafila hakarka koakh tguva (hanitsav lifnei hashetakh). Mikumo behemshekh kav hapeula shel koakh hamishkal vekivuno hafukh lekhivun peulat koakh hamishkal.
translit_ru: аль-пи хахок хашлиши шэль Ньютон мафила хакарка коах тгува (ханицав лифнэй хашэтах). микумо бэхэмшэх кав хапэула шэль коах хамишкаль вэкивуно хафух лэхивун пэулат коах хамишкаль.
ru: Согласно третьему закону Ньютона земля оказывает силу реакции (перпендикулярную поверхности). Она расположена на продолжении линии действия силы веса, и её направление противоположно направлению действия силы веса.
a97001:p17:b003:s01: he: משמשת לשינוי כיוון פעולת הכוח
he_niqqud: מְשַׁמֶּשֶׁת לְשִׁינּוּי כִּוּוּן פְּעוּלַת הַכּוֹחַ
translit: Meshameshet leshinui kivun peulat hakoakh
translit_ru: мэшамэшэт лэшинуй кивун пэулат хакоах
ru: Служит для изменения направления действия силы
a97001:p19:b002:s01: he: נשער פעולת כוחות תגובה.
he_niqqud: נְשַׁעֵר פְּעוּלַת כּוֹחוֹת תְּגוּבָה.
translit: Neshaer peulat kokhot tguva.
translit_ru: нэшаэр пэулат кохот тгува.
ru: Предположим действие сил реакции.
a97001:p22:b005:s01: he: נשער פעולת כוחות תגובה.
he_niqqud: נְשַׁעֵר פְּעוּלַת כּוֹחוֹת תְּגוּבָה.
translit: Neshaer peulat kokhot tguva.
translit_ru: нэшаэр пэулат кохот тгува.
ru: Предположим действие сил реакции.

**Исправление / интерпретация:**
Восстановить לּ во всех перечисленных формах פְּעוּלָּה / פְּעוּלַּת. Итого6tokens в5units, включая2tokens p16:b007:s01.

Доказательства: [файл1](sources/source.pdf#page=16), [файл2](sources/source.pdf#page=17), [файл3](sources/source.pdf#page=19), [файл4](sources/source.pdf#page=22)
Словарные источники: [источник1](https://www.pealim.com/dict/6026-peula/)

### A016-025-D003
Подтверждённое отклонение атласа. Страницы: 21. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p21:b008; a97001:p21:b009

**Наблюдение:**
Normative marking only; modern pronunciation unchanged, both TR remain correct. Full spelling itself is not considered a defect.

**Исходник:**
a97001:p21:b008: בהמשך הדרך כאשר נלמד חלקי מכונות יסומן באות C.
a97001:p21:b009: בהמשך הדרך כאשר נלמד חלקי מכונות יסומן באות f.

**Текущая запись:**
a97001:p21:b008: he: בהמשך הדרך כאשר נלמד חלקי מכונות יסומן באות C.
he_niqqud: בְּהֶמְשֵׁךְ הַדֶּרֶךְ כַּאֲשֶׁר נִלְמַד חֶלְקֵי מְכוֹנוֹת יְסוּמַן בָּאוֹת C.
translit: Behemshekh haderekh kaasher nilmad khelkei mekhonot yesuman baot C.
translit_ru: бэхэмшэх хадэрэх каашэр нильмад хэлкэй мэхонот йэсуман баот C.
ru: В дальнейшем, когда будем изучать детали машин, будет обозначаться буквой C.
a97001:p21:b009: he: בהמשך הדרך כאשר נלמד חלקי מכונות יסומן באות f.
he_niqqud: בְּהֶמְשֵׁךְ הַדֶּרֶךְ כַּאֲשֶׁר נִלְמַד חֶלְקֵי מְכוֹנוֹת יְסוּמַן בָּאוֹת f.
translit: Behemshekh haderekh kaasher nilmad khelkei mekhonot yesuman baot f.
translit_ru: бэхэмшэх хадэрэх каашэр нильмад хэлкэй мэхонот йэсуман баот f.
ru: В дальнейшем, когда будем изучать детали машин, будет обозначаться буквой f.

**Исправление / интерпретация:**
В יְסוּמַן восстановить מּ: יְסוּמַּן / יְסֻמַּן. Обе footnotes остаются со своим номером и символом C/f.

Доказательства: [файл1](sources/source.pdf#page=21)
Словарные источники: [источник1](https://www.pealim.com/dict/1377-lesamen/)

### A016-025-D004
Подтверждённое отклонение атласа. Страницы: 24. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p24:b003:s01:s01

**Наблюдение:**
Normative marking only; modern pronunciation unchanged, both TR remain correct. Full spelling itself is not considered a defect.

**Исходник:**
a97001:p24:b003:s01:s01: תנועה סיבובית הנגרמת עקב פעולת כוח המצוי במרחק מנקודה קבועה המכונה ציר סיבוב (אמיתי או דמיוני).

**Текущая запись:**
a97001:p24:b003:s01:s01: he: תנועה סיבובית הנגרמת עקב פעולת כוח המצוי במרחק מנקודה קבועה המכונה ציר סיבוב (אמיתי או דמיוני).
he_niqqud: תְּנוּעָה סִיבוּבִית הַנִּגְרֶמֶת עֵקֶב פְּעוּלַּת כּוֹחַ הַמָּצוּי בְּמֶרְחָק מִנְּקוּדָה קְבוּעָה הַמְּכוּנָה צִיר סִיבוּב (אֲמִיתִּי אוֹ דִּמְיוֹנִי).
translit: Tnua sivuvit hanigremet ekev peulat koakh hamatsuy bemerkhak minekuda kvua hamekhuna tsir sivuv (amiti o dimyoni).
translit_ru: тнуа сивувит ханигрэмэт экэв пэулат коах хамацуй бэмэрхак минэкуда квуа хамэхуна цир сивув (амити о димйони).
ru: Вращательное движение, возникающее вследствие действия силы, находящейся на расстоянии от неподвижной точки, называемой осью вращения (реальной или воображаемой).

**Исправление / интерпретация:**
В מִנְּקוּדָה восстановить דּ: מִנְּקוּדָּה / מִנְּקֻדָּה.

Доказательства: [файл1](sources/source.pdf#page=24)
Словарные источники: [источник1](https://www.pealim.com/dict/2866-nekuda/)

### A016-025-D005
Подтверждённое отклонение атласа. Страницы: 24. Важность: незначительное.
Проверка: Точный исходный текст

Адреса: a97001:p24:img01:label:0; a97001:p24:img02:label:0

**Наблюдение:**
Original raster, position and vector semantics of the figure are retained. This is not a missing illustration, incorrect RU or major force-calculation error.

**Исходник:**
В обоих рисунках над F видна надстрочная векторная отметка.

**Текущая запись:**
a97001:p24:img01/source_label_inventory/0: F
a97001:p24:img02/source_label_inventory/0: F

**Исправление / интерпретация:**
Отразить надстрочную векторную отметку F в структурированной транскрипции либо явно отделить нормализованный поисковый индекс от точной транскрипции. Не изменять сохранённый источник; наконечник маленькой стрелки от черты надёжно не различим.

Доказательства: [файл1](evidence/fe22ee56ef7dfc7e.png), [файл2](sources/sections/s04-parallel-forces.json)

### A026-035-D001
Подтверждённое отклонение атласа. Страницы: 28. Важность: существенное.
Расхождение учебного чтения

Адреса: a97001:p28:b007

**Исходник:**
a97001:p28:b007: כאשר אין וודאות בכיוון פעולת כוח תגובה, רצוי לסמנו תמיד בכיוון שנבחר כחיובי. אם תוצאת חישוב כוח התגובה חיובית אזי כיוון הכוח שהנחנו נכון, ואם התוצאה המתקבלת לאחר החישוב שלילית כיוונו של כוח התגובה שגוי והוא צריך להימצא הפוך להנחה הראשונית.

**Текущая запись:**
a97001:p28:b007: he: כאשר אין וודאות בכיוון פעולת כוח תגובה, רצוי לסמנו תמיד בכיוון שנבחר כחיובי. אם תוצאת חישוב כוח התגובה חיובית אזי כיוון הכוח שהנחנו נכון, ואם התוצאה המתקבלת לאחר החישוב שלילית כיוונו של כוח התגובה שגוי והוא צריך להימצא הפוך להנחה הראשונית.
he_niqqud: כַּאֲשֶׁר אֵין וַדָּאוּת בְּכִיווּן פְּעוּלַּת כּוֹחַ תְּגוּבָה, רָצוּי לְסַמְּנוֹ תָּמִיד בַּכִּיווּן שֶׁנִּבְחַר כְּחִיּוּבִי. אִם תּוֹצְאַת חִישּׁוּב כּוֹחַ הַתְּגוּבָה חִיּוּבִית אֲזַי כִּיווּן הַכּוֹחַ שֶׁהֵנַחְנוּ נָכוֹן, וְאִם הַתּוֹצָאָה הַמִּתְקַבֶּלֶת לְאַחַר הַחִישּׁוּב שְׁלִילִית כִּיווּנוֹ שֶׁל כּוֹחַ הַתְּגוּבָה שָׁגוּי וְהוּא צָרִיךְ לְהִימָּצֵא הָפוּךְ לַהֲנָחָה הָרִאשׁוֹנִית.
translit: Kaasher eyn vadaut bekivun peulat koakh tguva, ratsuy lesamno tamid bakivun shenivkhar kekhiyuvi. Im totsaat khishuv koakh hatguva khiyuvit azay kivun hakoakh shehenakhnu nakhon, veim hatotsaa hamitkabelet leakhar hakhishuv shlilit kivuno shel koakh hatguva shaguy vehu tsarikh lehimatse hafukh lahanakha harishonit.
translit_ru: каашэр эйн вадаут бэкивун пэулат коах тгува, рацуй лэсамно тамид бакивун шэнивхар кэхиюви. им тоцаат хишув коах хатгува хиювит азай кивун хакоах шэхэнахну нахон, вэим хатоцаа хамиткабэлэт лэахар хахишув шлилит кивуно шэл коах хатгува шагуй вэху царих лэхимацэ хафух лаханаха харишонит.
ru: Когда нет уверенности в направлении действия силы реакции, желательно всегда обозначать её в направлении, выбранном положительным. Если результат расчёта силы реакции положителен, то предположенное нами направление силы верно, а если полученный после расчёта результат отрицателен, направление силы реакции ошибочно и должно быть противоположно первоначальному предположению.

**Исправление / интерпретация:**
Исправить תּוֹצְאַת на תּוֹצָאַת. Обе транслитерации уже totsaat / тоцаат с /a/, поэтому TR, HE и RU не понижаются.

Доказательства: [файл1](sources/source.pdf#page=28)
Словарные источники: [источник1](https://www.pealim.com/dict/5611-totzaa/)

### A026-035-D002
Подтверждённое отклонение атласа. Страницы: 28, 29, 31. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p28:b006:s01; a97001:p29:b008:s01; a97001:p31:b002:s01; a97001:p31:b008:s01

**Исходник:**
a97001:p28:b006:s01: ד. נבחר נקודת ציר (נקודה בעלת מספר הנעלמים הגדול ביותר) ונסמן מרחקים ביחס לנקודת הציר.
a97001:p29:b008:s01: ד. נבחר נקודת ציר (נקודה בעלת מספר הנעלמים הגדול ביותר) ונסמן מרחקים ביחס לנקודת הציר.
a97001:p31:b002:s01: לוח אחיד שמשקלו 300 N נתמך בנקודה A בסמך נייח ובנקודה B הוא מחובר לחבל BC, כמתואר באיור לשאלה. בנקודה D מופעל על הלוח כוח אנכי, P = 750 N. הלוח נמצא במצב שיווי משקל.
a97001:p31:b008:s01: ד. נבחר נקודת ציר (נקודה בעלת מספר הנעלמים הגדול ביותר) ונסמן מרחקים ביחס לנקודת הציר.

**Текущая запись:**
a97001:p28:b006:s01: he: ד. נבחר נקודת ציר (נקודה בעלת מספר הנעלמים הגדול ביותר) ונסמן מרחקים ביחס לנקודת הציר.
he_niqqud: ד. נִבְחַר נְקוּדַּת צִיר (נְקוּדָה בַּעֲלַת מִסְפַּר הַנֶּעֱלָמִים הַגָּדוֹל בְּיוֹתֵר) וּנְסַמֵּן מֶרְחַקִּים בְּיַחַס לִנְקוּדַּת הַצִּיר.
translit: Dalet. Nivkhar nekudat tsir (nekuda baalat mispar haneelamim hagadol beyoter) unesamen merkhakim beyakhas linekudat hatsir.
translit_ru: далэт. нивхар нэкудат цир (нэкуда баалат миспар ханээламим хагадол бэйотэр) унэсамэн мэрхаким бэйахас линэкудат хацир.
ru: г. Выберем точку оси (точку с наибольшим числом неизвестных) и отметим расстояния относительно точки оси.
a97001:p29:b008:s01: he: ד. נבחר נקודת ציר (נקודה בעלת מספר הנעלמים הגדול ביותר) ונסמן מרחקים ביחס לנקודת הציר.
he_niqqud: ד. נִבְחַר נְקוּדַּת צִיר (נְקוּדָה בַּעֲלַת מִסְפַּר הַנֶּעֱלָמִים הַגָּדוֹל בְּיוֹתֵר) וּנְסַמֵּן מֶרְחַקִּים בְּיַחַס לִנְקוּדַּת הַצִּיר.
translit: Dalet. Nivkhar nekudat tsir (nekuda baalat mispar haneelamim hagadol beyoter) unesamen merkhakim beyakhas linekudat hatsir.
translit_ru: далэт. нивхар нэкудат цир (нэкуда баалат миспар ханээламим хагадол бэйотэр) унэсамэн мэрхаким бэйахас линэкудат хацир.
ru: г. Выберем точку оси (точку с наибольшим числом неизвестных) и отметим расстояния относительно точки оси.
a97001:p31:b002:s01: he: לוח אחיד שמשקלו 300 N נתמך בנקודה A בסמך נייח ובנקודה B הוא מחובר לחבל BC, כמתואר באיור לשאלה. בנקודה D מופעל על הלוח כוח אנכי, P = 750 N. הלוח נמצא במצב שיווי משקל.
he_niqqud: לוּחַ אָחִיד שֶׁמִּשְׁקָלוֹ 300 N נִתְמָךְ בִּנְקוּדָה A בְּסֶמֶךְ נַיָּח וּבִנְקוּדָה B הוּא מְחוּבָּר לְחֶבֶל BC, כַּמְּתוֹאָר בָּאִיּוּר לַשְּׁאֵלָה. בִּנְקוּדָה D מוּפְעָל עַל הַלּוּחַ כּוֹחַ אֲנָכִי, P = 750 N. הַלּוּחַ נִמְצָא בְּמַצַּב שִׁיוּוּי מִשְׁקָל.
translit: Luakh akhid shemishkalo 300 N nitmakh binkuda A besemekh nayakh uvinkuda B hu mekhubar lekhevel BC, kametoar baiyur lasheela. Binkuda D mufal al haluakh koakh anakhi, P = 750 N. Haluakh nimtsa bematsav shivuy mishkal.
translit_ru: луах ахид шэмишкало 300 N нитмах бинкуда A бэсэмэх найах увинкуда B ху мэхубар лэхэвэл BC, камэтоар баиюр лашээла. бинкуда D муфал ал халуах коах анахи, P = 750 N. халуах нимца бэмацав шивуй мишкал.
ru: Однородная пластина весом 300 N опирается в точке A на неподвижную опору, а в точке B прикреплена к верёвке BC, как показано на рисунке к задаче. В точке D к пластине приложена вертикальная сила P = 750 N. Пластина находится в состоянии равновесия.
a97001:p31:b008:s01: he: ד. נבחר נקודת ציר (נקודה בעלת מספר הנעלמים הגדול ביותר) ונסמן מרחקים ביחס לנקודת הציר.
he_niqqud: ד. נִבְחַר נְקוּדַּת צִיר (נְקוּדָה בַּעֲלַת מִסְפַּר הַנֶּעֱלָמִים הַגָּדוֹל בְּיוֹתֵר) וּנְסַמֵּן מֶרְחַקִּים בְּיַחַס לִנְקוּדַּת הַצִּיר.
translit: Dalet. Nivkhar nekudat tsir (nekuda baalat mispar haneelamim hagadol beyoter) unesamen merkhakim beyakhas linekudat hatsir.
translit_ru: далэт. нивхар нэкудат цир (нэкуда баалат миспар ханээламим хагадол бэйотэр) унэсамэн мэрхаким бэйахас линэкудат хацир.
ru: г. Выберем точку оси (точку с наибольшим числом неизвестных) и отметим расстояния относительно точки оси.

**Исправление / интерпретация:**
Восстановить דּ в формах נְקוּדָּה: 6 tokens в 4 units (3 в p31:b002:s01). Это непроизносимый современный dagesh; обе TR верны.

Доказательства: [файл1](sources/source.pdf#page=28), [файл2](sources/source.pdf#page=29), [файл3](sources/source.pdf#page=31)
Словарные источники: [источник1](https://www.pealim.com/dict/2866-nekuda/)

### A026-035-D003
Подтверждённое отклонение атласа. Страницы: 28. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p28:b011

**Исходник:**
a97001:p28:b011: 4) נפתור את משוואות שיווי המשקל.

**Текущая запись:**
a97001:p28:b011: he: 4) נפתור את משוואות שיווי המשקל.
he_niqqud: 4) נִפְתּוֹר אֶת מִשְׁוְאוֹת שִׁיוּוּי הַמִּשְׁקָל.
translit: 4) Niftor et mishvaot shivuy hamishkal.
translit_ru: 4) нифтор эт мишваот шивуй хамишкал.
ru: 4) Решим уравнения равновесия.

**Исправление / интерпретация:**
Согласовать NI מִשְׁוְאוֹת с обеими TR mishvaot / мишваот. Современное construct mishve’ot; историческое pointed mishva’ot требует иной NI. Это внутреннее несоответствие конкретных полей, не blanket запрет старой нормы.

Доказательства: [файл1](sources/source.pdf#page=28)
Словарные источники: [источник1](https://www.pealim.com/dict/3949-mishvaa/), [источник2](https://terms.hebrew-academy.org.il/munnah/45709_1/)

### A026-035-D004
Подтверждённое отклонение атласа. Страницы: 34, 35, 37, 38. Важность: существенное.
Расхождение учебного чтения

Адреса: a97001:p34:b006:s02; a97001:p35:b002; a97001:p37:b005:s01; a97001:p38:b002:s01

**Исходник:**
a97001:p34:b006:s02: ב. כתבו משוואת שיווי משקל למנוף.
a97001:p35:b002: ב. כתבו משוואת שיווי משקל למנוף.
a97001:p37:b005:s01: ב. כתבו משוואת שיווי משקל לקורה.
a97001:p38:b002:s01: ב. כתבו משוואת שיווי משקל לקורה.

**Текущая запись:**
a97001:p34:b006:s02: he: ב. כתבו משוואת שיווי משקל למנוף.
he_niqqud: ב. כִּתְבוּ מִשְׁווַאת שִׁיוּוּי מִשְׁקָל לַמָּנוֹף.
translit: Bet. Kitvu mishvat shivuy mishkal lamanof.
translit_ru: бэт. китву мишват шивуй мишкал ламаноф.
ru: б. Запишите уравнение равновесия для крана.
a97001:p35:b002: he: ב. כתבו משוואת שיווי משקל למנוף.
he_niqqud: ב. כִּתְבוּ מִשְׁווַאת שִׁיוּוּי מִשְׁקָל לַמָּנוֹף.
translit: Bet. Kitvu mishvat shivuy mishkal lamanof.
translit_ru: бэт. китву мишват шивуй мишкал ламаноф.
ru: б. Запишите уравнение равновесия для крана.
a97001:p37:b005:s01: he: ב. כתבו משוואת שיווי משקל לקורה.
he_niqqud: ב. כִּתְבוּ מִשְׁווַאת שִׁיוּוּי מִשְׁקָל לַקּוֹרָה.
translit: Bet. Kitvu mishvat shivuy mishkal lakora.
translit_ru: бэт. китву мишват шивуй мишкал лакора.
ru: б. Запишите уравнение равновесия для балки.
a97001:p38:b002:s01: he: ב. כתבו משוואת שיווי משקל לקורה.
he_niqqud: ב. כִּתְבוּ מִשְׁווַאת שִׁיוּוּי מִשְׁקָל לַקּוֹרָה.
translit: Bet. Kitvu mishvat shivuy mishkal lakora.
translit_ru: бэт. китву мишват шивуй мишкал лакора.
ru: б. Запишите уравнение равновесия для балки.

**Исправление / интерпретация:**
Восстановить vowel-bearing אַ и полный учебный слог в משוואת: выбрать согласованную современную מִשְׁוְאַת / mishve’at или явно версионированную историческую מִשְׁוָאַת / mishva’at. Текущие מִשְׁווַאת / mishvat / мишват не реализуют ни одну. HE и RU верны. Это не запрет разговорного сокращения.

Доказательства: [файл1](sources/source.pdf#page=34), [файл2](sources/source.pdf#page=35), [файл3](sources/source.pdf#page=37), [файл4](sources/source.pdf#page=38), [файл5](evidence/5e43404840b4c113.json), [файл6](evidence/2f4287025b43754e.jpg), [файл7](evidence/47154979cc5c7d1a.json), [файл8](evidence/bc2457ebfa590d75.jpg)
Словарные источники: [источник1](https://www.pealim.com/dict/3949-mishvaa/), [источник2](https://terms.hebrew-academy.org.il/munnah/45709_1/)

### A036-050-D001
Подтверждённое отклонение атласа. Страницы: 40. Важность: незначительное.
Расхождение учебного чтения

Адреса: a97001:p40:b005:s02

**Исходник:**
a97001:p40:b005:s02: 2. הכוחות הפנימיים הפועלים במוטות הם שווים ומונגדים. אם תוצאות החישוב של הכוחות הפנימיים מכוונים כלפי פנים – המוט נמתח, ואם הם מכוונים כלפי חוץ – המוט נלחץ.

**Текущая запись:**
a97001:p40:b005:s02: he: 2. הכוחות הפנימיים הפועלים במוטות הם שווים ומונגדים. אם תוצאות החישוב של הכוחות הפנימיים מכוונים כלפי פנים – המוט נמתח, ואם הם מכוונים כלפי חוץ – המוט נלחץ.
he_niqqud: 2. הַכּוֹחוֹת הַפְּנִימִיִּים הַפּוֹעֲלִים בַּמּוֹטוֹת הֵם שָׁוִים וּמוּנְגָּדִים. אִם תּוֹצָאוֹת הַחִשּׁוּב שֶׁל הַכּוֹחוֹת הַפְּנִימִיִּים מְכֻוָּנִים כְּלַפֵּי פְּנִים – הַמּוֹט נִמְתָּח, וְאִם הֵם מְכֻוָּנִים כְּלַפֵּי חוּץ – הַמּוֹט נִלְחָץ.
translit: 2. Hakokhot hapnimiyim hapo alim bamotot hem shavim umungadim. Im totsa ot hakhishuv shel hakokhot hapnimiyim mekhuvanim klapei pnim – hamot nimtakh, ve im hem mekhuvanim klapei khuts – hamot nilkhats.
translit_ru: 2. хакохот хапнимийим хапо алим бамотот хэм шавим умунгадим. им тоца от хахишув шэл хакохот хапнимийим мэхуваним клапэй пним – хамот нимтах, вэ им хэм мэхуваним клапэй хуц – хамот нилхац.
ru: 2. Внутренние силы, действующие в стержнях, равны и противоположно направлены. Если результаты расчёта внутренних сил направлены внутрь, стержень растянут, а если они направлены наружу, стержень сжат.

**Исправление / интерпретация:**
В תוצאות החישוב использовать plural construct תּוֹצְאוֹת / tots’ot, согласовав NI и обе TR. Текущие תּוֹצָאוֹת / totsa ot / тоца от передают absolute форму. Это нормативный учебный контекст, не утверждение невозможности распространённого разговорного totzaot. Пробел внутри одного слова отдельно является форматной оговоркой.

Доказательства: [файл1](sources/source.pdf#page=40)
Словарные источники: [источник1](https://www.pealim.com/dict/5611-totzaa/)

### A101-150-F001
Подтверждённое отклонение атласа. Страницы: 106. Важность: существенное.
Проверка: Исходный элемент, Точный исходный текст, Полнота русского перевода

Адреса: a97001:p106:img01:label-offset-y

**Наблюдение:**
The final .1 is visibly present in source. All five current fields truncate it to 6. This reuses the existing finding ID, not a new duplicate.

**Исходник:**
6.1

**Текущая запись:**
6

**Исправление / интерпретация:**
6.1

Доказательства: [файл1](evidence/a6c8e6cc8eeda6e6.png), [файл2](evidence/8846f099e31024e2.png), [файл3](evidence/30dbaa6b0492ad30.jpg), [файл4](evidence/b6628e46b73d3d5e.json)

### A101-150-F003
Подтверждённое отклонение атласа. Страницы: 129. Важность: незначительное.
Проверка: Исходный элемент, Точный исходный текст, Полнота русского перевода

Адреса: a97001:p129:img01-symbol10

**Наблюдение:**
Source lowercase ell differs from adjacent uppercase L. All five current fields use uppercase. Existing first-pass finding reused, not a new duplicate.

**Исходник:**
Δl

**Текущая запись:**
ΔL

**Исправление / интерпретация:**
Δl

Доказательства: [файл1](evidence/c0c0e70b395eaf8d.png), [файл2](evidence/8b8e8f4b29afdebe.png), [файл3](evidence/d53ada8974c3d1ca.json), [файл4](evidence/52173156f57720fe.jpg), [файл5](evidence/a39eb0bcf17b7139.json), [файл6](evidence/dce080867ad3c889.jpg)

### A141-150-D001
Подтверждённое отклонение атласа. Страницы: 142, 143. Важность: существенное.
Расхождение учебного чтения

Адреса: a97001:p142:b005; a97001:p143:b005

**Исходник:**
בדגם המבחן

**Текущая запись:**
a97001:p142:b005: he: 3) לאחר שחרורה מתחילה המטולטלת לצבור אנרגיה קינטית עד הגעה למהירות מרבית 4 עד 7 מטר לשנייה בעת המכה בדגם המבחן.
he_niqqud: 3) לְאַחַר שִׁחְרוּרָהּ מַתְחִילָה המטולטלת לִצְבּוֹר אֵנֶרְגְּיָה קִינֵטִית עַד הַגָּעָה לִמְהִירוּת מְרַבִּית 4 עַד 7 מֶטֶר לִשְׁנִיָּה בְּעֵת הַמַּכָּה בַּדֶּגֶם הַמִּבְחַן.
translit: 3) Le'akhar Shikhrura Matkhila [unresolved:המטולטלת] Litsbor Energiya Kinetit Ad Haga'a Limhirut Merabit 4 Ad 7 Meter Lishniya Be'et Hamaka Badegem Hamivkhan.
translit_ru: 3) лэ'ахар шихрура матхила [неуточнено:המטולטלת] лицбор энэргийа кинэтит ад хага'а лимхирут мэрабит 4 ад 7 мэтэр лишнийа бэ'эт хамака бадэгэм хамивхан.
ru: 3) После освобождения маятник начинает накапливать кинетическую энергию до достижения максимальной скорости от 4 до 7 метров в секунду в момент удара по испытуемому образцу.
a97001:p143:b005: he: 3) לאחר שחרורה מתחילה המטולטלת לצבור אנרגיה קינטית עד הגעה למהירות מרבית 4 עד 7 מטר לשנייה בעת המכה בדגם המבחן.
he_niqqud: 3) לְאַחַר שִׁחְרוּרָהּ מַתְחִילָה המטולטלת לִצְבּוֹר אֵנֶרְגְּיָה קִינֵטִית עַד הַגָּעָה לִמְהִירוּת מְרַבִּית 4 עַד 7 מֶטֶר לִשְׁנִיָּה בְּעֵת הַמַּכָּה בַּדֶּגֶם הַמִּבְחַן.
translit: 3) Le'akhar Shikhrura Matkhila [unresolved:המטולטלת] Litsbor Energiya Kinetit Ad Haga'a Limhirut Merabit 4 Ad 7 Meter Lishniya Be'et Hamaka Badegem Hamivkhan.
translit_ru: 3) лэ'ахар шихрура матхила [неуточнено:המטולטלת] лицбор энэргийа кинэтит ад хага'а лимхирут мэрабит 4 ад 7 мэтэр лишнийа бэ'эт хамака бадэгэм хамивхан.
ru: 3) После освобождения маятник начинает накапливать кинетическую энергию до достижения максимальной скорости от 4 до 7 метров в секунду в момент удара по испытуемому образцу.

**Исправление / интерпретация:**
Для construct chain читать בְּדֶגֶם / bedegem / бэдэгэм, а не בַּדֶּגֶם / badegem. HE/RU точны. Отдельное source-typo המטולטלת оставляет полноту NI/TR этих строк открытой.

Доказательства: [файл1](sources/source.pdf#page=142), [файл2](sources/source.pdf#page=143), [файл3](sources/sections/s16-mechanical-properties.json)
Словарные источники: [источник1](https://msradio.huji.ac.il/hagiya.html)

### A141-150-D002
Подтверждённое отклонение атласа. Страницы: 146. Важность: существенное.
Расхождение учебного чтения

Адреса: a97001:p146:b003:s01; a97001:p146:b003:s03

**Исходник:**
a97001:p146:b003:s01: בתחום טמפרטורת המעבר
a97001:p146:b003:s03: בתחום רחב של טמפרטורות

**Текущая запись:**
a97001:p146:b003:s01: he: מתכות במבנה BCC – קיימת אי-רציפות (תחום משיך פריך) בשינוי אנרגיית השבר בתחום טמפרטורת המעבר. מעל טמפרטורת המעבר החומר משיך ואנרגיית השבר גבוהה. מתחת לטמפרטורת המעבר החומר פריך ואנרגיית השבר נמוכה מאוד.
he_niqqud: מַתָּכוֹת בְּמִבְנֶה BCC – קַיֶּמֶת אִי-רְצִיפוּת (תְּחוּם מָשִׁיךְ פָּרִיךְ) בְּשִׁינּוּי אֵנֶרְגִּיַּת הַשֶּׁבֶר בַּתְּחוּם טֶמְפֵּרָטוּרַת הַמַּעֲבָר. מֵעַל טֶמְפֵּרָטוּרַת הַמַּעֲבָר הַחוֹמֶר מָשִׁיךְ וְאֵנֶרְגִּיַּת הַשֶּׁבֶר גְּבוֹהָה. מִתַּחַת לְטֶמְפֵּרָטוּרַת הַמַּעֲבָר הַחוֹמֶר פָּרִיךְ וְאֵנֶרְגִּיַּת הַשֶּׁבֶר נְמוּכָה מְאוֹד.
translit: Matakhot Bemivne BCC – Kayemet I-Rtsifut (Tkhum Mashikh Parikh) Beshinuy Energiyat Hashever Batkhum Temperaturat Hama'avar. Me'al Temperaturat Hama'avar Hakhomer Mashikh Ve'energiyat Hashever Gvoha. Mitakhat Letemperaturat Hama'avar Hakhomer Parikh Ve'energiyat Hashever Nemukha Me'od.
translit_ru: матахот бэмивнэ BCC – кайэмэт и-рцифут (тхум маших парих) бэшинуй энэргийат хашэвэр батхум тэмпэратурат хама'авар. мэ'ал тэмпэратурат хама'авар хахомэр маших вэ'энэргийат хашэвэр гвоха. митахат лэтэмпэратурат хама'авар хахомэр парих вэ'энэргийат хашэвэр нэмуха мэ'од.
ru: Металлы со структурой BCC – имеется разрыв непрерывности (пластично-хрупкая область) в изменении энергии разрушения в диапазоне температуры перехода. Выше температуры перехода материал пластичен и энергия разрушения высока. Ниже температуры перехода материал хрупок и энергия разрушения очень мала.
a97001:p146:b003:s03: he: מתכות במבנה HCP – אלו מתכות פריכות, הקריסטלים שלהן יציגו אנרגיה נמוכה לשבר בתחום רחב של טמפרטורות.
he_niqqud: מַתָּכוֹת בְּמִבְנֶה HCP – אֵלּוּ מַתָּכוֹת פְּרִיכוֹת, הַקְּרִיסְטָלִים שֶׁלָּהֶן יַצִּיגוּ אֵנֶרְגְּיָה נְמוּכָה לְשֶׁבֶר בַּתְּחוּם רָחָב שֶׁל טֶמְפֵּרָטוּרוֹת.
translit: Matakhot Bemivne HCP – Elu Matakhot Prikhot, Hakristalim Shelahen Yatsigu Energiya Nemukha Leshever Batkhum Rakhav Shel Temperaturot.
translit_ru: матахот бэмивнэ HCP – элу матахот прихот, хакристалим шэлахэн йацигу энэргийа нэмуха лэшэвэр батхум рахав шэл тэмпэратурот.
ru: Металлы со структурой HCP – это хрупкие металлы, их кристаллы будут демонстрировать малую энергию разрушения в широком диапазоне температур.

**Исправление / интерпретация:**
В обоих контекстах בִּתְחוּם / bitkhum / битхум. Первый является construct chain, второй indefinite noun + adjective. Не переносить эту поправку на другие definite употребления תחום. HE/RU точны.

Доказательства: [файл1](sources/source.pdf#page=146), [файл2](sources/sections/s16-mechanical-properties.json)
Словарные источники: [источник1](https://msradio.huji.ac.il/hagiya.html)

### A141-150-D003
Подтверждённое отклонение атласа. Страницы: 143. Важность: существенное.
Расхождение учебного чтения

Адреса: a97001:p143:b003

**Исходник:**
בתוך מלחציים ... מעל המלחציים

**Текущая запись:**
a97001:p143:b003: he: 1) ממקמים בחלק התחתון של המכשיר דגם נבדק במידות 10 × 10 × 75 המונח אנכית ומקובע בתוך מלחציים, המורכבים משני לוחות עבים, לוח אחד נייח, לוח השני נייד. החריץ בולט 22 מ״מ מעל המלחציים. הפטיש חובט בדגם בצד של חריץ. מרחק בין הלוח של תופסן עד מיקום המגע בדגם 22 מ״מ.
he_niqqud: 1) מְמַקְּמִים בַּחֵלֶק הַתַּחְתּוֹן שֶׁל הַמַּכְשִׁיר דֶּגֶם נִבְדָּק בְּמִידּוֹת 10 × 10 × 75 הַמּוּנָּח אֲנָכִית וּמְקוּבָּע בְּתוֹךְ מַלְחֲצַיִם, הַמּוּרְכָּבִים מִשְּׁנֵי לוּחוֹת עָבִים, לוּחַ אֶחָד נַיָּח, לוּחַ הַשֵּׁנִי נַיָּד. הֶחָרִיץ בּוֹלֵט 22 מ״מ מֵעַל הַמַּלְחֲצַיִם. הַפַּטִּישׁ חוֹבֵט בַּדֶּגֶם בַּצַּד שֶׁל חָרִיץ. מֶרְחָק בֵּין הַלּוּחַ שֶׁל תּוֹפְסָן עַד מִיקּוּם הַמַּגָּע בַּדֶּגֶם 22 מ״מ.
translit: 1) Memakmim Bakhelek Hatakhton Shel Hamakhshir Degem Nivdak Bemidot 10 × 10 × 75 Hamunakh Anakhit Umekuba Betokh Malkhatsayim, Hamurkavim Mishnei Lukhot Avim, Luakh Ekhad Nayakh, Luakh Hasheni Nayad. Hekharits Bolet 22 mm Me'al Hamalkhatsayim. Hapatish Khovet Badegem Batsad Shel Kharits. Merkhak Bein Haluakh Shel Tofsan Ad Mikum Hamaga Badegem 22 mm.
translit_ru: 1) мэмакмим бахэлэк хатахтон шэл хамахшир дэгэм нивдак бэмидот 10 × 10 × 75 хамунах анахит умэкуба бэтох малхацайим, хамуркавим мишнэи лухот авим, луах эхад найах, луах хашэни найад. хэхариц болэт 22 мм мэ'ал хамалхацайим. хапатиш ховэт бадэгэм бацад шэл хариц. мэрхак бэин халуах шэл тофсан ад микум хамага бадэгэм 22 мм.
ru: 1) В нижней части прибора размещают испытуемый образец размерами 10 × 10 × 75, расположенный вертикально и закреплённый в тисках, состоящих из двух толстых пластин: одна пластина неподвижна, вторая подвижна. Надрез выступает на 22 мм над тисками. Молоток ударяет по образцу со стороны надреза. Расстояние от пластины зажима до места контакта с образцом – 22 мм.

**Исправление / интерпретация:**
מֶלְחָצַיִם / melkhatsayim и הַמֶּלְחָצַיִם / hamelkhatsayim, а не מַלְחֲצַיִם / malkhatsayim. Два вхождения в строке. Canonical s16 vise уже имеет правильную форму; исправлять только contextual NI/обе TR.

Доказательства: [файл1](sources/source.pdf#page=143), [файл2](sources/sections/s16-mechanical-properties.json)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/24916_1/)

### A141-150-D004
Подтверждённое отклонение атласа. Страницы: 148. Важность: существенное.
Расхождение учебного чтения

Адреса: a97001:p148:b001:s02

**Исходник:**
תוצאת אנרגיית הנגיפה

**Текущая запись:**
a97001:p148:b001:s02: he: יש לצפות שבחומר פגום תהיה השפעה על מבחן הנגיפה ולכן חשוב להסתכל על מקום השבר ולא רק על תוצאת אנרגיית הנגיפה. חומר בעל בועיות אוויר יספוג אנרגיה וייתן תוצאה של חומר משיך בהיותו חומר פריך.
he_niqqud: יֵשׁ לְצַפּוֹת שֶׁבַּחוֹמֶר פָּגוּם תִּהְיֶה הַשְׁפָּעָה עַל מִבְחַן הַנְּגִיפָה וְלָכֵן חָשׁוּב לְהִסְתַּכֵּל עַל מְקוֹם הַשֶּׁבֶר וְלֹא רַק עַל תּוֹצְאַת אֵנֶרְגִּיַּת הַנְּגִיפָה. חוֹמֶר בַּעַל בּוּעִיּוֹת אֲוִיר יִסְפּוֹג אֵנֶרְגְּיָה וְיִתֵּן תּוֹצָאָה שֶׁל חוֹמֶר מָשִׁיךְ בִּהְיוֹתוֹ חוֹמֶר פָּרִיךְ.
translit: Yesh Letsapot Shebakhomer Pagum Tihye Hashpa'a Al Mivkhan Hanegifa Velakhen Khashuv Lehistakel Al Mekom Hashever Velo Rak Al Tots'at Energiyat Hanegifa. Khomer Ba'al Bu'iyot Avir Yispog Energiya Veyiten Totsa'a Shel Khomer Mashikh Bihyoto Khomer Parikh.
translit_ru: йэш лэцапот шэбахомэр пагум тихйэ хашпа'а ал мивхан ханэгифа вэлахэн хашув лэхистакэл ал мэком хашэвэр вэло рак ал тоц'ат энэргийат ханэгифа. хомэр ба'ал бу'ийот авир йиспог энэргийа вэйитэн тоца'а шэл хомэр маших бихйото хомэр парих.
ru: Следует ожидать, что в дефектном материале будет влияние на испытание на удар, поэтому важно смотреть на место разрушения, а не только на результат энергии удара. Материал с воздушными пузырьками поглотит энергию и даст результат пластичного материала, будучи хрупким материалом.

**Исправление / интерпретация:**
Singular construct תּוֹצָאַת / totsa'at (totza'at) / тоца'ат, не תּוֹצְאַת / Tots'at. HE/RU точны.

Доказательства: [файл1](sources/source.pdf#page=148), [файл2](sources/sections/s16-mechanical-properties.json)
Словарные источники: [источник1](https://www.pealim.com/dict/5611-totzaa/)

### A141-150-D005
Подтверждённое отклонение атласа. Страницы: 148. Важность: незначительное.
Расхождение учебного чтения

Адреса: a97001:p148:b007:s04

**Исходник:**
תוצאות הניסוי

**Текущая запись:**
a97001:p148:b007:s04: he: תוצאות הניסוי תלויות ברדיוס החריץ – ככל שרדיוס החריץ קטן יותר, כך ריכוז המאמצים בחומר גבוה יותר, לכן האנרגיה לשבירת הדגם קטנה יותר.
he_niqqud: תּוֹצָאוֹת הַנִּיסּוּי תְּלוּיוֹת בְּרַדְיוּס הֶחָרִיץ – כְּכָל שֶׁרַדְיוּס הֶחָרִיץ קָטָן יוֹתֵר, כָּךְ רִיכּוּז הַמַּאֲמָצִים בַּחוֹמֶר גָּבוֹהַּ יוֹתֵר, לָכֵן הָאֵנֶרְגְּיָה לִשְׁבִירַת הַדֶּגֶם קְטַנָּה יוֹתֵר.
translit: Totsa'ot Hanisuy Tluyot Beradyus Hekharits – Kekhol Sheradyus Hekharits Katan Yoter, Kakh Rikuz Hama'amatsim Bakhomer Gavoah Yoter, Lakhen Ha'energiya Lishvirat Hadegem Ktana Yoter.
translit_ru: тоца'от ханисуй тлуйот бэрадйус хэхариц – кэхол шэрадйус хэхариц катан йотэр, ках рикуз хама'амацим бахомэр гавоах йотэр, лахэн ха'энэргийа лишвират хадэгэм ктана йотэр.
ru: Результаты испытания зависят от радиуса надреза – чем меньше радиус надреза, тем выше концентрация напряжений в материале, поэтому энергия разрушения образца меньше.

**Исправление / интерпретация:**
В normative учебном plural construct использовать תּוֹצְאוֹת / tots'ot / тоц'от. Текущее תּוֹצָאוֹת / Totsa'ot соответствует absolute. Распространённое разговорное произношение totzaot не объявляется невозможным. HE/RU точны.

Доказательства: [файл1](sources/source.pdf#page=148), [файл2](sources/sections/s16-mechanical-properties.json)
Словарные источники: [источник1](https://www.pealim.com/dict/5611-totzaa/)

### A141-150-D006
Подтверждённое отклонение атласа. Страницы: 148. Важность: существенное.
Расхождение учебного чтения

Адреса: a97001:p148:b006:s03

**Исходник:**
החריצים

**Текущая запись:**
a97001:p148:b006:s03: he: קיימים צורות שונות של חריצים בדגמים במבחן הנגיפה, החריצים היותר מקובלים הם:
he_niqqud: קַיָּמִים צוּרוֹת שׁוֹנוֹת שֶׁל חֲרִיצִים בַּדְּגָמִים בְּמִבְחַן הַנְּגִיפָה, הֶחָרִיצִים הַיּוֹתֵר מְקוּבָּלִים הֵם:
translit: Kayamim Tsurot Shonot Shel Kharitsim Badgamim Bemivkhan Hanegifa, Hekharitsim Hayoter Mekubalim Hem:
translit_ru: кайамим цурот шонот шэл харицим бадгамим бэмивхан ханэгифа, хэхарицим хайотэр мэкубалим хэм:
ru: При испытании на удар существуют различные формы надрезов в образцах; более распространены следующие надрезы:

**Исправление / интерпретация:**
Plural חֲרִיצִים с артиклем הַחֲרִיצִים / hakharitsim / хахарицим, не הֶחָרִיצִים / hekharitsim. Не путать с правильным singular הֶחָרִיץ.

Доказательства: [файл1](sources/source.pdf#page=148), [файл2](sources/sections/s16-mechanical-properties.json)
Словарные источники: [источник1](https://www.pealim.com/dict/8956-charitz/), [источник2](https://msradio.huji.ac.il/hagiya.html)

### A141-150-D007
Подтверждённое отклонение атласа. Страницы: 142, 148. Важность: существенное.
Расхождение учебного чтения

Адреса: a97001:p142:b003; a97001:p148:b004:s02

**Исходник:**
לחריץ

**Текущая запись:**
a97001:p142:b003: he: 1) ממקמים בחלק התחתון של המכשיר דגם נבדק במידות 10 × 10 × 55 המונח בין שני סמכים שמרחקם 40 mm. הפטיש חובט בדגם בצד המנוגד לחריץ.
he_niqqud: 1) מְמַקְּמִים בַּחֵלֶק הַתַּחְתּוֹן שֶׁל הַמַּכְשִׁיר דֶּגֶם נִבְדָּק בְּמִידּוֹת 10 × 10 × 55 הַמּוּנָּח בֵּין שְׁנֵי סְמָכִים שֶׁמֶּרְחַקָּם 40 mm. הַפַּטִּישׁ חוֹבֵט בַּדֶּגֶם בַּצַּד הַמְּנוּגָּד לַחָרִיץ.
translit: 1) Memakmim Bakhelek Hatakhton Shel Hamakhshir Degem Nivdak Bemidot 10 × 10 × 55 Hamunakh Bein Shnei Smakhim Shemerkhakam 40 mm. Hapatish Khovet Badegem Batsad Hamenugad Lakharits.
translit_ru: 1) мэмакмим бахэлэк хатахтон шэл хамахшир дэгэм нивдак бэмидот 10 × 10 × 55 хамунах бэин шнэи смахим шэмэрхакам 40 mm. хапатиш ховэт бадэгэм бацад хамэнугад лахариц.
ru: 1) В нижней части прибора размещают испытуемый образец размерами 10 × 10 × 55, лежащий между двумя опорами, расстояние между которыми 40 mm. Молоток ударяет по образцу со стороны, противоположной надрезу.
a97001:p148:b004:s02: he: בבדיקת הנגיפה נמדדת רגישות החומר לחריץ (למאמצים תלת ציריים).
he_niqqud: בִּבְדִיקַת הַנְּגִיפָה נִמְדֶּדֶת רְגִישׁוּת הַחוֹמֶר לַחָרִיץ (לְמַאֲמָצִים תְּלָת צִירִיִּים).
translit: Bivdikat Hanegifa Nimdedet Regishut Hakhomer Lakharits (Lema'amatsim Tlat Tsiriyim).
translit_ru: бивдикат ханэгифа нимдэдэт рэгишут хахомэр лахариц (лэма'амацим тлат цирийим).
ru: При испытании на удар измеряется чувствительность материала к надрезу (к трёхосным напряжениям).

**Исправление / интерпретация:**
При definite singular הֶחָרִיץ предлог даёт לֶחָרִיץ / lekharits; при indefinite чтении לְחָרִיץ / lekharits. Выбор definite/indefinite источником однозначно не огласован, но לַחָרִיץ / lakharits не соответствует ни одной из этих нормативных форм.

Доказательства: [файл1](sources/source.pdf#page=142), [файл2](sources/source.pdf#page=148), [файл3](sources/sections/s16-mechanical-properties.json)
Словарные источники: [источник1](https://www.pealim.com/dict/8956-charitz/), [источник2](https://msradio.huji.ac.il/hagiya.html)

### A141-150-D008
Подтверждённое отклонение атласа. Страницы: 141, 142, 143. Важность: незначительное.
Расхождение учебного чтения

Адреса: a97001:p141:b002; a97001:p142:b005; a97001:p143:b005

**Исходник:**
a97001:p141:b002: תהליך מבחן ... המבחן
a97001:p142:b005: המבחן
a97001:p143:b005: המבחן

**Текущая запись:**
a97001:p141:b002: he: מבחן נגיפה (בדיקת פגיעה) זהו תהליך מבחן המשמש לקביעת התנהגותם של חומרים כאשר הם נתונים לכוח או פגיעה פתאומית. המבחן מאפשר להעריך את הקשיחות, החוזק והעמידות של חומרים, בתרחישים שבהם הם עלולים לחוות תנאי עומס פתאומיים או דינמיים (צפידות). זה עוזר לבחירת חומרים שיפעלו בצורה מהימנה ובטוחה בסביבות ספציפיות או בתנאים תפעוליים מסוימים.
he_niqqud: מִבְחַן נְגִיפָה (בְּדִיקַת פְּגִיעָה) זֶהוּ תַּהֲלִיךְ מִבְחַן הַמְשַׁמֵּשׁ לִקְבִיעַת הִתְנַהֲגוּתָם שֶׁל חוֹמָרִים כַּאֲשֶׁר הֵם נְתוּנִים לַכּוֹחַ אוֹ פְּגִיעָה פִּתְאוֹמִית. הַמִּבְחַן מְאַפְשֵׁר לְהַעֲרִיךְ אֶת הַקְּשִׁיחוּת, הַחוֹזֶק וְהָעֲמִידוּת שֶׁל חוֹמָרִים, בְּתַרְחִישִׁים שֶׁבָּהֶם הֵם עֲלוּלִים לַחֲווֹת תְּנָאֵי עוֹמֶס פִּתְאוֹמִיִּים אוֹ דִּינָמִיִּים (צְפִידוּת). זֶה עוֹזֵר לִבְחִירַת חוֹמָרִים שֶׁיִּפְעֲלוּ בְּצוּרָה מְהֵימָנָה וּבְטוּחָה בִּסְבִיבוֹת סְפֵצִיפִיּוֹת אוֹ בִּתְנָאִים תִּפְעוּלִיִּים מְסוּיָּמִים.
translit: Mivkhan Ngifa (Bdikat Pgi'a) Zehu Tahalikh Mivkhan Hameshamesh Likvi'at Hitnahagutam Shel Khomarim Ka'asher Hem Netunim Lakoakh O Pgi'a Pit'omit. Hamivkhan Me'afsher Leha'arikh Et Hakshikhut, Hakhozek Veha'amidut Shel Khomarim, Betarkhishim Shebahem Hem Alulim Lakhavot Tna'ei Omes Pit'omiyim O Dinamiyim (Tsfidut). Ze Ozer Livkhirat Khomarim Sheyif'alu Betsura Meheimana Uvetukha Bisvivot Spetsifiyot O Bitna'im Tif'uliyim Mesuyamim.
translit_ru: мивхан нгифа (бдикат пги'а) зэху тахалих мивхан хамэшамэш ликви'ат хитнахагутам шэл хомарим ка'ашэр хэм нэтуним лакоах о пги'а пит'омит. хамивхан мэ'афшэр лэха'арих эт хакшихут, хахозэк вэха'амидут шэл хомарим, бэтархишим шэбахэм хэм алулим лахавот тна'эи омэс пит'омийим о динамийим (цфидут). зэ озэр ливхират хомарим шэйиф'алу бэцура мэхэимана увэтуха бисвивот спэцифийот о битна'им тиф'улийим мэсуйамим.
ru: Испытание на удар (проверка удара) – это процесс испытания, служащий для определения поведения материалов, когда они подвергаются силе или внезапному удару. Испытание позволяет оценить жёсткость, прочность и стойкость материалов в ситуациях, когда они могут испытывать внезапные или динамические нагрузки (вязкость). Это помогает выбирать материалы, которые будут надёжно и безопасно работать в конкретных средах или при определённых эксплуатационных условиях.
a97001:p142:b005: he: 3) לאחר שחרורה מתחילה המטולטלת לצבור אנרגיה קינטית עד הגעה למהירות מרבית 4 עד 7 מטר לשנייה בעת המכה בדגם המבחן.
he_niqqud: 3) לְאַחַר שִׁחְרוּרָהּ מַתְחִילָה המטולטלת לִצְבּוֹר אֵנֶרְגְּיָה קִינֵטִית עַד הַגָּעָה לִמְהִירוּת מְרַבִּית 4 עַד 7 מֶטֶר לִשְׁנִיָּה בְּעֵת הַמַּכָּה בַּדֶּגֶם הַמִּבְחַן.
translit: 3) Le'akhar Shikhrura Matkhila [unresolved:המטולטלת] Litsbor Energiya Kinetit Ad Haga'a Limhirut Merabit 4 Ad 7 Meter Lishniya Be'et Hamaka Badegem Hamivkhan.
translit_ru: 3) лэ'ахар шихрура матхила [неуточнено:המטולטלת] лицбор энэргийа кинэтит ад хага'а лимхирут мэрабит 4 ад 7 мэтэр лишнийа бэ'эт хамака бадэгэм хамивхан.
ru: 3) После освобождения маятник начинает накапливать кинетическую энергию до достижения максимальной скорости от 4 до 7 метров в секунду в момент удара по испытуемому образцу.
a97001:p143:b005: he: 3) לאחר שחרורה מתחילה המטולטלת לצבור אנרגיה קינטית עד הגעה למהירות מרבית 4 עד 7 מטר לשנייה בעת המכה בדגם המבחן.
he_niqqud: 3) לְאַחַר שִׁחְרוּרָהּ מַתְחִילָה המטולטלת לִצְבּוֹר אֵנֶרְגְּיָה קִינֵטִית עַד הַגָּעָה לִמְהִירוּת מְרַבִּית 4 עַד 7 מֶטֶר לִשְׁנִיָּה בְּעֵת הַמַּכָּה בַּדֶּגֶם הַמִּבְחַן.
translit: 3) Le'akhar Shikhrura Matkhila [unresolved:המטולטלת] Litsbor Energiya Kinetit Ad Haga'a Limhirut Merabit 4 Ad 7 Meter Lishniya Be'et Hamaka Badegem Hamivkhan.
translit_ru: 3) лэ'ахар шихрура матхила [неуточнено:המטולטלת] лицбор энэргийа кинэтит ад хага'а лимхирут мэрабит 4 ад 7 мэтэр лишнийа бэ'эт хамака бадэгэм хамивхан.
ru: 3) После освобождения маятник начинает накапливать кинетическую энергию до достижения максимальной скорости от 4 до 7 метров в секунду в момент удара по испытуемому образцу.

**Исправление / интерпретация:**
В четырёх absolute употреблениях использовать מִבְחָן / הַמִּבְחָן с qamats, а не patah construct מִבְחַן. Остальные מבחן נגיפה/מבחן צ'רפי являются construct и не затронуты. Обе TR mivkhan верны.

Доказательства: [файл1](sources/source.pdf#page=141), [файл2](sources/source.pdf#page=142), [файл3](sources/source.pdf#page=143), [файл4](sources/sections/s16-mechanical-properties.json)
Словарные источники: [источник1](https://www.pealim.com/dict/3528-mivchan/)

### A141-150-D009
Подтверждённое отклонение атласа. Страницы: 145. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p145:b002:s01

**Исходник:**
הפרשי הגבהים

**Текущая запись:**
a97001:p145:b002:s01: he: הקשר בין הפרשי הגבהים, האנרגיה לנגיפה וקשיות החומר
he_niqqud: הַקֶּשֶׁר בֵּין הֶפְרְשֵׁי הַגְּבָהִים, הָאֵנֶרְגְּיָה לִנְגִיפָה וְקַשְׁיוּת הַחוֹמֶר
translit: Hakesher Bein Hefreshei Hagvahim, Ha'energiya Lingifa Vekashyut Hakhomer
translit_ru: хакэшэр бэин хэфрэшэи хагвахим, ха'энэргийа лингифа вэкашйут хахомэр
ru: Связь между разностями высот, энергией удара и твёрдостью материала

**Исправление / интерпретация:**
Plural construct הֶפְרֵשֵׁי־, не הֶפְרְשֵׁי. Обе текущие TR Hefreshei / хэфрэшэи сохраняют правильное e и не понижаются.

Доказательства: [файл1](sources/source.pdf#page=145), [файл2](sources/sections/s16-mechanical-properties.json)
Словарные источники: [источник1](https://www.pealim.com/dict/2937-hefresh/)

### A141-150-D010
Подтверждённое отклонение атласа. Страницы: 145. Важность: существенное.
Расхождение учебного чтения

Адреса: a97001:p145:img01-specimen

**Исходник:**
דגם מתיחה של חומר משיך

**Текущая запись:**
a97001:p145:img01-specimen: he: דגם מתיחה של חומר משיך
he_niqqud: דְּגַם מְתִיחָה שֶׁל חוֹמֶר מָשִׁיךְ
translit: Dgam Metikha Shel Khomer Mashikh
translit_ru: дгам мэтиха шэл хомэр маших
ru: Образец для растяжения из пластичного материала

**Исправление / интерпретация:**
В физическом образце singular construct сохраняет דֶּגֶם / Degem / дэгэм; текущие דְּגַם / Dgam / дгам ошибочны. HE и RU верны. См. Pealim5134, строка47. Это исправление пропущенной находки в собственном первоначальном review, не правка production.

Доказательства: [файл1](sources/source.pdf#page=145), [файл2](sources/sections/s16-mechanical-properties.json)
Словарные источники: [источник1](https://www.pealim.com/dict/5134-degem/)

### A151-203-F001
Подтверждённое отклонение атласа. Страницы: 152. Важность: незначительное.
Пропуск значимого элемента

Адреса: a97001:p152:img01-tens

**Исходник:**
עמיסת סף במתיחה

**Текущая запись:**
עמיסת סף מתיחה

**Исправление / интерпретация:**
Восстановить ב в исходной подписи и согласовать учебные поля.

Доказательства: [файл1](evidence/0836b10d050bcffd.png)

### A151-203-F002
Подтверждённое отклонение атласа. Страницы: 152. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p152:b002:s02

**Исходник:**
בו מועמס דגם בעומס מתיחה-לחיצה

**Текущая запись:**
בּוֹ מוּעֲמָס דְּגַם בְּעוֹמֶס; TR Dgam

**Исправление / интерпретация:**
Заменить на דֶּגֶם / degem. Даже сопряжённая форма ед.ч. דֶּגֶם־, поэтому объяснять Dgam как construct неверно. Pealim: https://www.pealim.com/dict/5134-degem/; Academy term60564_1. Независимо подтверждено проверка.

Доказательства: [файл1](sources/source.pdf#page=152)

### A151-203-F003
Подтверждённое отклонение атласа. Страницы: 156. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p156:b009; a97001:p156:img01:label:strain

**Исходник:**
מאמץ מעוות; מעוות

**Текущая запись:**
מַאֲמָץ מְעוּוָּת; מְעוּוָּת; Me’uvat

**Исправление / интерпретация:**
В контексте strain нужен термин מַעֲוָת / maavat, не прилагательное «искажённый» meuvat. Согласовать с уже правильной подписью p151:img01-y. Technion https://library.technion.ac.il/nano/: strain=מַעֲוָת; stress–strain curve=עֲקֻמַּת מַאֲמָץ–מַעֲוָת. Независимо подтверждено проверка.

Доказательства: [файл1](sources/source.pdf#page=156)

### A151-203-F004
Неустановленное расхождение. Страницы: 157. Важность: существенное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p157:t-alloying-elements:cell:molybdenum-uses

**Исходник:**
שיני מחרשה, [спорное чтение: מאסרים / מסורים], פלדות מהירות חיתוך

**Текущая запись:**
שיני מחרשה, מאסרים, פלדות מהירות חיתוך; RU [מאסרים: чтение и значение не установлены]; TR [unresolved: מאסרים]

**Исправление / интерпретация:**
Получить более качественный источник либо явно оставить нерешённый фрагмент. Не исправлять на מסורים без доказательства. Неполный RU и учебное чтение остаются ограничением приёмки, но ошибочная HE-транскрипция не установлена.

Доказательства: [файл1](evidence/6aa03c4dcff87baf.png)

### A151-203-F005
Подтверждённое отклонение атласа. Страницы: 169. Важность: незначительное.
Проверка: Точный исходный текст, Структура, Огласовки, Латинская транслитерация, Кириллическая транслитерация, Полнота русского перевода

Адреса: a97001:p169:img01:label:liquid

**Исходник:**
נתוכת ברזל (עם פחמן מומס)

**Текущая запись:**
נתוכת ברזל ועם פחמן מומס

**Исправление / интерпретация:**
Восстановить исходные скобки в «נתוכת ברזל (עם פחמן מומס)» и убрать вставленное ו / ve / «и». Отдельный RU-placeholder разобран вF025, без удвоения причины HE.

Доказательства: [файл1](evidence/d2b9f3157831dd14.png)

### A151-203-F006
Особенность или ошибка исходника. Страницы: 192. Важность: существенное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p192:b006

**Исходник:**
2. ערבוב האבקות – תהליך הערבוב הוא חיוני ביותר והוא נמשל מספר שעות.

**Текущая запись:**
HE совпадает; he_niqqud=null; translit=null; translit_ru=null; RU: 2. Смешивание порошков – процесс смешивания крайне важен, и он «נמשל» несколько часов.

**Исправление / интерпретация:**
Сохранить буквальный source HE и исходную опечатку. Отдельно утвердить редакторское чтение/смысл נמשך («длится») либо оставить этот фрагмент явно заблокированным; заполнить безопасную часть учебных полей. Не выдавать текущий RU за полный.

Доказательства: [файл1](sources/source.pdf#page=192)

### A151-203-F007
Подтверждённое отклонение атласа. Страницы: 198. Важность: незначительное.
Неточная передача исходного текста

Адреса: a97001:p198:img01:t-mechanical-properties:r0c7

**Исходник:**
Fatigue Endurance Limit σL

**Текущая запись:**
Fatigue Endurence Limit σL

**Исправление / интерпретация:**
В поле исходного текста восстановить Endurance; RU правильный.

Доказательства: [файл1](evidence/31259e90479adb1b.png)

### A151-203-F008
Подтверждённое отклонение атласа. Страницы: 186. Важность: существенное.
Искажена связь в переводе

Адреса: a97001:p186:b003:s01

**Исходник:**
התהליך מאפשר עליה בתכולת הפחמן בשכבה החיצונית של פלדה דלת פחמן עד 0.2%C, כך שהמרכז נשאר צמיג.

**Текущая запись:**
Процесс позволяет увеличить содержание углерода во внешнем слое низкоуглеродистой стали до 0.2%C, так что центр остаётся вязким.

**Исправление / интерпретация:**
Передать0.2%C как характеристику исходной низкоуглеродистой стали: «увеличить содержание углерода во внешнем слое низкоуглеродистой (до0.2%C) стали, так что сердцевина остаётся вязкой». Следующий b003:s04 указывает0.8%C для обогащённого внешнего слоя. Сохранить оба числа. Исходник синтаксически сжат, решение опирается на соседний абзац, не на молчаливую внешнюю научную правку.

Доказательства: [файл1](sources/source.pdf#page=186)

### A151-203-F009
Подтверждённое отклонение атласа. Страницы: 160. Важность: существенное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p160:t-steel-applications:grade-4340-application

**Исходник:**
חלקי מטוסים מיוחדים

**Текущая запись:**
חלקי מנגנונים מיוחדים / детали специальных механизмов

**Исправление / интерпретация:**
Восстановить מטוסים и чтение מְטוֹסִים / metosim / мэтосим; перевести как детали самолётов, а не механизмов. Сохранить прилагательное без добавления неуказанного специального назначения.

Доказательства: [файл1](evidence/3dd0a93a376e3cbb.png), [файл2](evidence/af49927c9033bdfe.json), [файл3](evidence/066f759746335824.jpg)

### A151-203-F010
Подтверждённое отклонение атласа. Страницы: 160. Важность: незначительное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p160:t-steel-applications:grade-6150-application

**Исходник:**
מַשְׁאֵבוֹת / mash’evot

**Текущая запись:**
машаэвот

**Исправление / интерпретация:**
Убрать лишнюю гласную после ш: машэвот или маш’эвот в выбранной системе.

Доказательства: [файл1](evidence/c677e5d443442bf7.png)
Словарные источники: [источник1](https://www.pealim.com/dict/7026-masheva/)

### A151-203-F011
Подтверждённое отклонение атласа. Страницы: 160. Важность: незначительное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p160:t-steel-applications:grade-1113-application; a97001:p160:t-steel-applications:grade-30303f-application

**Исходник:**
Unpointed source אומים; normative plural אֻמִּים

**Текущая запись:**
אוּמִים

**Исправление / интерпретация:**
Добавить обязательный дагеш в מ нормативного множественного числа אום («гайка»). Полное написание с ו само по себе не ошибка. umim / умим менять не нужно.

Доказательства: [файл1](evidence/75c9ee2dc7e8662e.png), [файл2](evidence/32d80b6997f258bf.png)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/33075_1/%D7%90%D6%B9%D7%9D), [источник2](https://www.pealim.com/dict/6610-om/)

### A151-203-F012
Подтверждённое отклонение атласа. Страницы: 160. Важность: существенное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p160:t-steel-applications:grade-o1-application

**Исходник:**
כלים בעלי קשיות יחסית גבוהה והתנגדות גבוהה לשחיקה

**Текущая запись:**
כלים בעלי קשיות […] גבוהה והתנגדות גבוהה לשחיקה / инструменты с высокой твёрдостью […] и высокой износостойкостью

**Исправление / интерпретация:**
The word יחסית is legible. Restore it with reading יַחֲסִית / yakhasit / йахасит and RU «с относительно высокой твёрдостью». This is not an inevitable source limit.

Доказательства: [файл1](evidence/dfc4a48963e2e7f7.png), [файл2](evidence/e1a4b9f3dffba1fb.json), [файл3](evidence/8c0d60c98972fba6.jpg)

### A151-203-F013
Подтверждённое отклонение атласа. Страницы: 159. Важность: незначительное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p159:steel-legend-hardened

**Исходник:**
לאחר חיסום

**Текущая запись:**
אחרי חיסום

**Исправление / интерпретация:**
Восстановить исходное לאחר и чтение לְאַחַר / le’akhar. Перевод «После закалки» уже передаёт смысл правильно.

Доказательства: [файл1](evidence/a695e652e2dbfbb2.png)

### A151-203-F014
Подтверждённое отклонение атласа. Страницы: 159. Важность: незначительное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p159:steel-legend-cold

**Исходник:**
מעובד בקר

**Текущая запись:**
מעובד קר

**Исправление / интерпретация:**
Восстановить видимый в источнике предлог ב и согласовать чтение. Не модернизировать исходное неполное написание и не угадывать огласовку בקר лишь по этой поправке. Перевод «Обработано в холодном состоянии» по смыслу верен.

Доказательства: [файл1](evidence/a695e652e2dbfbb2.png)

### A151-203-F015
Подтверждённое отклонение атласа. Страницы: 153. Важность: незначительное.
Проверка: Кириллическая транслитерация

Адреса: a97001:p153:b005:s01

**Исходник:**
מקורוזיה; NI מִקּוֹרוֹזְיָה

**Текущая запись:**
микорозйах

**Исправление / интерпретация:**
Убрать конечное х: немая конечная ה не обозначает этот звук. Латинское h может быть орфографической условностью и само по себе ошибкой не признано.

Доказательства: [файл1](sources/source.pdf#page=153)

### A151-203-F016
Подтверждённое отклонение атласа. Страницы: 155, 158, 161, 164, 166, 170. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p155:b001:s01; a97001:p155:b001:s02; a97001:p155:b001:s03; a97001:p155:b002; a97001:p155:img01:label:caption; a97001:p158:img01:label:carbon; a97001:p158:b005:s11; a97001:p158:b005:s12; a97001:p161:img01:label:carbon; a97001:p164:b003:s01; a97001:p166:b002; a97001:term:mass-percentage

**Исходник:**
אחוז הפחמן / אחוז פחמן: construct context

**Текущая запись:**
אָחוּז, including בְּאָחוּז

**Исправление / интерпретация:**
Использовать сопряжённое אֲחוּז только в перечисленных контекстах; исправить בְּאָחוּז на בַּאֲחוּז. Не менять абсолютную форму אָחוּז в «אחוז נמוך של פחמן». Произношение самой лексемы akhuz прежнее; be→ba на155/166 рассмотрено отдельно вF022.

Доказательства: [файл1](sources/source.pdf#page=155)
Словарные источники: [источник1](https://www.pealim.com/dict/6158-achuz/)

### A151-203-F017
Подтверждённое отклонение атласа. Страницы: 155, 156, 162, 164. Важность: незначительное.
Проверка: Огласовки, Латинская транслитерация, Кириллическая транслитерация

Адреса: a97001:p155:b001:s03; a97001:p156:b003:s02:s02; a97001:p156:b005:s02; a97001:p156:b007:s02; a97001:p162:t-steel-symbols:cell:H-usage; a97001:p164:b002:s02

**Исходник:**
Masculine גבוה; normative גָּבֹהַּ / gavoa(h)

**Текущая запись:**
גָּבוֹהַ / gavoha / гавоха

**Исправление / интерпретация:**
Добавить нормативный маппик к конечной ה мужского рода. В чтении беглый патах предшествует h: gavoah / гавоах либо практическое gavoa / гавоа. Перестановка a/h отличается от пропуска знака. Женское גבוהה / gvoha не менять.

Доказательства: [файл1](sources/source.pdf#page=156)
Словарные источники: [источник1](https://www.pealim.com/dict/4478-gavoah/)

### A151-203-F018
Подтверждённое отклонение атласа. Страницы: 157. Важность: незначительное.
Проверка: Латинская транслитерация, Кириллическая транслитерация

Адреса: a97001:p157:t-alloying-elements:cell:cobalt-uses

**Исходник:**
כרסומים; NI כִּרְסוּמִים

**Текущая запись:**
kirsummim / кирсуммим

**Исправление / интерпретация:**
Убрать лишнее m/м: kirsumim / кирсумим. Это рассогласование полей, не изменение технического смысла.

Доказательства: [файл1](sources/source.pdf#page=157)

### A151-203-F019
Подтверждённое отклонение атласа. Страницы: 157. Важность: незначительное.
Проверка: editorial_metadata

Адреса: r-a24bf888900dae43cdf5e37f

**Исходник:**
Current HE abbreviations טמפ׳ / פלב״ם; NI/TR fields expand them

**Текущая запись:**
Editor note: «Аббревиатуры טמפ׳/פלב״ם сохранены без произношения.»

**Исправление / интерпретация:**
Привести примечание в соответствие с фактически раскрытыми чтениями либо согласовать поля с принятой политикой. Не утверждать отсутствие произношения сокращений, если поля содержат полное раскрытие.

Доказательства: [файл1](sources/source.pdf#page=157)

### A151-203-F020
Подтверждённое отклонение атласа. Страницы: 154. Важность: существенное.
Проверка: Термины

Адреса: a97001:p154:b006

**Исходник:**
רך [footnote8]: חומר המתעוות בקלות תחת הפעלה כוח חיצוני.

**Текущая запись:**
Footnote is present and translated, but terms=[], no canonical רך/רכות/חומר רך or softness entry in any section

**Исправление / интерпретация:**
Добавить или связать явно определённое понятие мягкости/мягкого материала с154:b006. Сохранить существующие сноску, ID и исходную ссылку. Здесь пропуск в терминах, а не отсутствие текста сноски.

Доказательства: [файл1](sources/source.pdf#page=154)

### A151-203-F021
Подтверждённое отклонение атласа. Страницы: 154. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p154:b002:s02

**Исходник:**
מהחומרים הנלווים

**Текущая запись:**
he_niqqud: מֵהַחוֹמָרִים הַנִּלְווִים
translit: mehakhomarim hanilvim
translit_ru: мэхахомарим ханилвим

**Исправление / интерпретация:**
В этом определённом plural заменить гласный артикля a на e: нормативное מֵהֶחֳמָרִים / mehekhomarim / мэхэхомарим. Это точечная правка prefix, не массовая замена написания с ו и не исправление HE оригинала.

Доказательства: [файл1](sources/source.pdf#page=154), [файл2](evidence/26186620746fa2ab.txt)
Словарные источники: [источник1](https://www.pealim.com/dict/3209-khomer/)

### A151-203-F022
Подтверждённое отклонение атласа. Страницы: 155, 166. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p155:img01:label:caption; a97001:p166:b002

**Исходник:**
כתלות באחוז הפחמן

**Текущая запись:**
niqqud: בְּאָחוּז
translit: be’akhuz
translit_ru: бэ’ахуз

**Исправление / интерпретация:**
В construct אֲחוּז приставка ב берёт a: בַּאֲחוּז / ba’akhuz / ба’ахуз. Не распространять TR-fail на неприставочное akhuz.

Доказательства: [файл1](evidence/ec51ec41ca289ebe.txt)
Словарные источники: [источник1](https://www.pealim.com/dict/6158-achuz/)

### A151-203-F023
Подтверждённое отклонение атласа. Страницы: 166, 171, 172, 173. Важность: существенное.
Расхождение учебного чтения

Адреса: a97001:p166:b001; a97001:p166:b004:s01; a97001:p166:b004:s02; a97001:p166:b004:s03; a97001:term:phase; a97001:term:phase-diagram; a97001:p171:b001:s08; a97001:p171:b002; a97001:p171:b005:s02; a97001:p171:b006; a97001:p172:t-phase-lines:cell:B-H-name; a97001:p172:t-phase-lines:cell:undivided-final-col-1; a97001:p173:source-heading-three-phases; a97001:p173:t-phase-points:cell:C-property; a97001:p173:t-phase-points:cell:E-property; a97001:p173:t-three-phases:cell:head-structures

**Исходник:**
פאזה / פאזות

**Текущая запись:**
niqqud: פָּאזָה / פָּאזוֹת
translit: Paza / pazot / bepaza
translit_ru: паза / пазот / бэпаза

**Исправление / интерпретация:**
Техническое phase произносится faza/fazot, с פ без dagesh. Сохранить исходный alef. В b004:s03 NI уже בְּפָאזָה без dagesh, поэтому там ошибочны только две TR.

Доказательства: [файл1](evidence/ec51ec41ca289ebe.txt), [файл2](evidence/4bfb1ea55166a829.txt), [файл3](evidence/5fe73510afbc0d3b.txt), [файл4](evidence/33d6cbe8738e5bbb.txt)
Словарные источники: [источник1](https://www.milononline.net/%D7%A4%D7%96%D7%94), [источник2](https://he.wiktionary.org/wiki/%D7%A4%D7%96%D7%94)

### A151-203-F024
Подтверждённое отклонение атласа. Страницы: 169. Важность: незначительное.
Проверка: Латинская транслитерация, Кириллическая транслитерация

Адреса: a97001:p169:img01:label:austenite-ledeburite; a97001:p169:img01:label:austenite-cementite; a97001:p169:img01:label:pearlite-ledeburite; a97001:p169:img01:label:pearlite-cementite

**Исходник:**
גבול הגרגר

**Текущая запись:**
niqqud: גְּבוּל הַגַּרְגֵּר
translit: gvul hagerger
translit_ru: гвул хагэргэр

**Исправление / интерпретация:**
Первая гласная גרגר в самом NI равна a: garger/hagarger, гаргэр/хагаргэр. Обе TR сейчас подменяют её e; согласовать только четыре указанные подписи.

Доказательства: [файл1](evidence/65cc23b37808e2d2.txt)
Словарные источники: [источник1](https://www.pealim.com/dict/8304-garger/)

### A151-203-F025
Подтверждённое отклонение атласа. Страницы: 169. Важность: существенное.
Перевод читаемого фрагмента не заполнен

Адреса: a97001:p169:img01:label:liquid; a97001:p169:img01:label:liquid-austenite; a97001:p169:img01:label:liquid-cementite

**Исходник:**
נתוכת ברזל

**Текущая запись:**
ru: [נתוכת: неуверенное чтение растрового слова] железа
niqqud: נְתֹכֶת בַּרְזֶל
translit: netokhet barzel

**Исправление / интерпретация:**
Заменить устаревший RU-placeholder на «расплав железа» во всех трёх подписях, сохранив остальное содержание. NI netokhet подтверждена; НЕ менять на гипотетическое netukhat. Скобка/ו в liquid — отдельнаяF005.

Доказательства: [файл1](evidence/5878d7a29871dc44.png), [файл2](evidence/65cc23b37808e2d2.txt), [файл3](evidence/cfbda7bc50652c1b.json), [файл4](evidence/05e9ce8abeb630e2.jpg), [файл5](evidence/b1cf7468d7029a53.json)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/8349_1), [источник2](https://terms.hebrew-academy.org.il/munnah/8815_2/bath)

### A151-203-F026
Подтверждённое отклонение атласа. Страницы: 170. Важность: существенное.
Пропущена часть исходной подписи

Адреса: a97001:p170:img01:label:eutectoid

**Исходник:**
⟦первое слово не аттестовано полностью⟧-פרליט

**Текущая запись:**
he: אוטקטואידית
ru: Эвтектоидная

**Исправление / интерпретация:**
Восстановить явно читаемое ядро «-פרליט» / «перлит» и связанные поля. Первое слово остаётся disputed; полную реконструкцию не выдумывать.

Доказательства: [файл1](evidence/d1652261ec8cf172.png), [файл2](evidence/45b254ba3186dcb8.png), [файл3](evidence/72391039f88c5fe9.json), [файл4](evidence/e989416b624db33b.jpg)

### A151-203-F027
Подтверждённое отклонение атласа. Страницы: 174. Важность: незначительное.
Расхождение учебного чтения

Адреса: a97001:p174:b007:s02; a97001:p174:img01:label:hold

**Исходник:**
השהיית / השהיה

**Текущая запись:**
niqqud: הַשְׁהָיַת / הַשְׁהָיָה
translit: Hashayat / Hashaya
translit_ru: хашайат / хашайа

**Исправление / интерпретация:**
Согласовать учебное чтение с выбранной нормативной лексемой: hashhayat / hashhaya, хашхайат / хашхайа. Не утверждается невозможность разговорного выпадения h.

Доказательства: [файл1](sources/source.pdf#page=174), [файл2](evidence/b94864a1be4d24e2.txt)
Словарные источники: [источник1](https://www.pealim.com/dict/3838-hashhaya/), [источник2](https://www.milononline.net/%D7%94%D7%A9%D7%94%D7%99%D7%94)

### A151-203-F028
Подтверждённое отклонение атласа. Страницы: 175. Важность: незначительное.
Расхождение учебного чтения

Адреса: a97001:p175:b002

**Исходник:**
לת.ז. / לטמפ'

**Текущая запись:**
translit: לת.ז. / לטמפ'
translit_ru: לת.ז. / לטמפ'

**Исправление / интерпретация:**
Сохранить исходные сокращения в HE, но дать оговорённое буквенное либо полное чтение в учебных полях. Это отдельный известный пробел, не тождественный нерешённой форме המרחשים. Не навязывать единственное расширение.

Доказательства: [файл1](sources/source.pdf#page=175), [файл2](evidence/ac17683d2828b017.txt)

### A151-203-F029
Подтверждённое отклонение атласа. Страницы: 176. Важность: незначительное.
Проверка: Полнота русского перевода

Адреса: a97001:p176:b002

**Исходник:**
מרטנזיט

**Текущая запись:**
структуры мартензита

**Исправление / интерпретация:**
В RU: структуры мартенсита. Исходный HE и его буквальное чтение с z не менять.

Доказательства: [файл1](sources/source.pdf#page=176), [файл2](evidence/8730fdf31c090bc7.txt)
Словарные источники: [источник1](https://gramota.ru/storage/public/normdicts/orfograficheskij_slovar.pdf)

### A151-203-F030
Подтверждённое отклонение атласа. Страницы: 153, 165, 176, 190. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p153:b005:s02; a97001:p165:t-stainless-types:s04; a97001:term:stress-corrosion-cracking; a97001:term:residual-stress; a97001:term:stress-concentration

**Исходник:**
המאמצים המתפתחים / קורוזית מאמצים

**Текущая запись:**
הַמַּאֲמָצִים / מַאֲמָצִים

**Исправление / интерпретация:**
В этих noun-plural контекстах нормативно מַאֲמַצִּים: pataḥ под второй מ и dagesh в צ. TR /a/ не меняется. Правильные176 מַאֲמַצִּים не затрагивать.

Доказательства: [файл1](evidence/6b548b5d0dd2bf7d.txt), [файл2](evidence/fe363238bd75a06e.txt)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/)

### A151-203-F031
Подтверждённое отклонение атласа. Страницы: 178. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p178:b003:s04

**Исходник:**
יסודות המסגים (twice)

**Текущая запись:**
יְסוֹדוֹת הַמְסַגִּים

**Исправление / интерпретация:**
Для noun plural מסג нормативно מְסָגִים: qamats под ס и отсутствие dagesh в ג. Современное /a/ и TR не меняются. Не заменять исходное מסג на סגסוגת.

Доказательства: [файл1](sources/source.pdf#page=178), [файл2](evidence/de03d6b2b1f0dd06.txt)
Словарные источники: [источник1](https://www.milononline.net/%D7%9E%D7%A1%D7%92/994480)

### A151-203-F032
Подтверждённое отклонение атласа. Страницы: 179. Важность: незначительное.
Расхождение учебного чтения

Адреса: a97001:p179:b002:s02; a97001:p179:b002:s03; a97001:term:jominy-distance

**Исходник:**
ג'ומני

**Текущая запись:**
niqqud: ג'וֹמְנִי
translit: jomni
translit_ru: джомни

**Исправление / интерпретация:**
Сохранить defective source spelling ג'ומני, огласовать ג'וֹמִנִי и читать jomini/джомини. На той же странице английское Jominy и полное ג'ומיני устанавливают имя; отсутствие mater י не требует выпадения гласного. Добавить редакционную оговорку, HE не переписывать.

Доказательства: [файл1](sources/source.pdf#page=179), [файл2](evidence/e23ce530b2ac232a.txt)

### A151-203-F033
Подтверждённое отклонение атласа. Страницы: 183, 184. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p183:b011:s01; a97001:p184:b002:s01; a97001:term:surface-hardening

**Исходник:**
השהייה / הקשייה

**Текущая запись:**
הַשְׁהָיָּיה / הַקְשָׁיָּיה

**Исправление / интерпретация:**
Сохранить source plene השהייה, но убрать dagesh в י для выбранного чтения hashhaya / הַשְׁהָיָה. Обе TR уже правильны. Не смешивать с иной лексемой שְׁהִייָּה/shehiya. Для184 отдельно подтверждено הַקְשָׁיָה; убрать только dagesh в י, не менять source plene, обе TR уже правильны.

Доказательства: [файл1](sources/source.pdf#page=183), [файл2](evidence/d8077cc97f280e42.txt), [файл3](sources/source.pdf#page=184), [файл4](evidence/afb7c48979239ee4.txt)
Словарные источники: [источник1](https://www.pealim.com/dict/3838-hashhaya/), [источник2](https://terms.hebrew-academy.org.il/munnah/21376_1)

### A151-203-F034
Подтверждённое отклонение атласа. Страницы: 189. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p189:b003:s03

**Исходник:**
מתכות אל ברזליות / מתכות אל ברזיליות

**Текущая запись:**
niqqud: מַתָּכוֹת אֶל בַּרְזֶלִיּוֹת / מַתָּכוֹת אֶל ברזיליות
translit: matakhot el barzeliyot / matakhot el [unresolved reading: ברזיליות]
translit_ru: матахот эл барзэлийот / матахот эл [неразрешённое чтение: ברזיליות]

**Исправление / интерпретация:**
В читаемом первом обороте отрицательный prefix אַל- / al-, прилагательное בַּרְזִלִּיּוֹת / barziliyot. Во втором обороте установить al- для אל; source-форма ברזיליות остаётся отдельным reading-blocker, её не переписывать. Canonical nonferrous-metal уже правильно al barzilit.

Доказательства: [файл1](sources/source.pdf#page=189), [файл2](evidence/1b8ee4a131db22d9.txt)
Словарные источники: [источник1](https://benyehuda.org/dict/24412/39432), [источник2](https://terms.hebrew-academy.org.il/munnah?kodErekhIvrit=13957)

### A191-203-F001
Подтверждённое отклонение атласа. Страницы: 197. Важность: незначительное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p197:img02:composition-heading

**Исходник:**
Composition in weight precent (wt.%)

**Текущая запись:**
Composition in weight percent (wt.%)

**Исправление / интерпретация:**
Сохранить исходное precent в поле точного текста. Если требуется исправленное percent, обозначить его отдельно как редакторскую поправку. Русский смысл передан верно.

Доказательства: [файл1](evidence/255defcf23e4be67.png), [файл2](evidence/07c48dc9be15b082.png), [файл3](evidence/c8b5b3b0e2bb1e12.json)

### A191-203-F002
Подтверждённое отклонение атласа. Страницы: 197. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p197:t-product-key:r8c1

**Исходник:**
C = Cold finished rod, bar and wire = מוט, קנה וחוט בגימור בעיבוד בקר

**Текущая запись:**
בְּקַר / bekar / бэкар

**Исправление / интерпретация:**
В данном контексте использовать существительное קֹר: בְּקֹר / bekor / бэкор. Сохранить исходное написание בקר без добавления ו в точный HE.

Доказательства: [файл1](evidence/999e094d28685da5.png), [файл2](evidence/c17367eec8d5fa8d.txt), [файл3](evidence/c8b5b3b0e2bb1e12.json)
Словарные источники: [источник1](https://www.pealim.com/dict/5977-kor/)

### A191-203-F003
Подтверждённое отклонение атласа. Страницы: 197, 201. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p197:img01:t-strain-hardening:r1c1; a97001:p197:img01:t-strain-hardening:r2c1; a97001:p197:img01:t-strain-hardening:r3c1; a97001:p201:b002:s04

**Исходник:**
הקשייה באופן מכאני

**Текущая запись:**
הַקְשָׁיָּיה

**Исправление / интерпретация:**
Убрать ненормативный дагеш в йод согласно הַקְשָׁיָה. Само полное написание с двумя י не считать ошибкой; транслитерация hakshaya верна.

Доказательства: [файл1](evidence/0269afc717a850d2.png), [файл2](evidence/49a51e0a8ea39734.txt), [файл3](evidence/9e3eb19ecb337de7.txt), [файл4](sources/source.pdf#page=201), [файл5](evidence/c8b5b3b0e2bb1e12.json)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah?kodErekhIvrit=22510)

### A191-203-F004
Подтверждённое отклонение атласа. Страницы: 200. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p200:img02:t-applications:r3c1

**Исходник:**
מאפייני גימור

**Текущая запись:**
מַאֲפַיְּינֵי / ma'afaynei / ма’афайнэй

**Исправление / интерпретация:**
Использовать сопряжённое множественное מְאַפְיְנֵי / me'afyenei / мэафьенэй. Сохранить исходное полное написание в HE. Это не просто допустимое сокращение начальной шва.

Доказательства: [файл1](evidence/b4f7be66374ef22a.png), [файл2](evidence/2c23fdad74223492.txt), [файл3](evidence/c8b5b3b0e2bb1e12.json)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/70304_1/מְאַפְיֵן), [источник2](https://www.pealim.com/dict/135/), [источник3](https://www.milononline.net/מאפיין/1041090)

### A191-203-F005
Подтверждённое отклонение атласа. Страницы: 203. Важность: существенное.
Расхождение учебного чтения

Адреса: a97001:p203:b002:s01; a97001:p203:b004

**Исходник:**
לחומרים המרוכבים / בחומרים אלו

**Текущая запись:**
לַחוֹמָרִים / Lakhomarim / Лахомарим; בַּחוֹמָרִים / Bakhomarim / Бахомарим

**Исправление / интерпретация:**
Перед множественным חֳמָרִים артикль имеет e: לֶחֳמָרִים / lekhomarim; בֶּחֳמָרִים / bekhomarim. Сохранённое полное написание с ו само по себе не отвергается.

Доказательства: [файл1](sources/source.pdf#page=203), [файл2](evidence/3aeeab9203bd0431.txt), [файл3](evidence/c8b5b3b0e2bb1e12.json)
Словарные источники: [источник1](https://www.pealim.com/dict/3209-khomer/), [источник2](https://msradio.huji.ac.il/hagiya.html)

### A191-203-F006
Подтверждённое отклонение атласа. Страницы: 192, 201, 202. Важность: существенное.
Проверка: Огласовки, Латинская транслитерация, Кириллическая транслитерация

Адреса: a97001:p192:b003:s03; a97001:p201:b003:s04; a97001:p202:b001

**Исходник:**
דיאגרמת הפאזות / וליצור פאזה / הפאזה רווית יתר

**Текущая запись:**
הַפָּאזוֹת / hapazot; פָּאזָה / paza; הַפָּאזָה / hapaza; canonical פָּאזָה / Paza / паза

**Исправление / интерпретация:**
Использовать פָאזָה / faza / фаза и соответствующие контексту hafazot, faza, hafaza. Неогласованный исходный HE не менять.

Доказательства: [файл1](sources/source.pdf#page=192), [файл2](sources/source.pdf#page=201), [файл3](sources/source.pdf#page=202), [файл4](evidence/a9680c07ea27e258.txt), [файл5](evidence/9e3eb19ecb337de7.txt), [файл6](evidence/f5f84f3a72ca99ef.txt), [файл7](evidence/c8b5b3b0e2bb1e12.json)
Словарные источники: [источник1](https://www.milononline.net/פזה)

### A191-203-L001
Не подтверждено как ошибка атласа. Страницы: 191. Важность: незначительное.
Расхождение учебного чтения

Адреса: a97001:p191:b002:s01; a97001:p191:b006:s01

**Исходник:**
גורוז / במעקבי חמצון

**Текущая запись:**
Exact source preserved; NI unpointed at these words, TR/TR-RU use explicit unresolved markers; RU gives contextual greasing/inhibitors meanings.

**Исправление / интерпретация:**
Сохранить источник и явные ограничения. Возможное исправленное чтение устанавливать отдельно, не нормализуя молча גורוז или במעקבי.

Доказательства: [файл1](sources/source.pdf#page=191), [файл2](evidence/d3152748cf414028.txt), [файл3](evidence/c8b5b3b0e2bb1e12.json)

### A191-203-L002
Не подтверждено как ошибка атласа. Страницы: 196. Важность: незначительное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p196:img01:t-alloy-series:r0c0

**Исходник:**
Alloy (AA [right boundary overlaps possible closing mark]

**Текущая запись:**
Alloy (AA

**Исправление / интерпретация:**
Не добавлять вымышленную закрывающую скобку. Сохранить неопределённость при отсутствии более качественного оригинала. Читаемые буквы совпадают.

Доказательства: [файл1](evidence/3c3172eb4c8788a9.png), [файл2](evidence/c8b5b3b0e2bb1e12.json)

### A191-203-L003
Не подтверждено как ошибка атласа. Страницы: 203. Важность: незначительное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p203:b005:s03

**Исходник:**
Third legend physically clipped in PDF

**Текущая запись:**
אפוקסי משוריין בסיבי אלומינה קצרים

**Исправление / интерпретация:**
Сохранить оговорку о текстовом слое. Не утверждать визуальное подтверждение всей строки. Лингвистическая проверка доступной строки текстового слоя — отдельный результат.

Доказательства: [файл1](sources/source.pdf#page=203), [файл2](evidence/3aeeab9203bd0431.txt), [файл3](evidence/4773090cee8e7f7f.png), [файл4](evidence/c8b5b3b0e2bb1e12.json)

### A191-203-S001
Подтверждённое отклонение атласа. Страницы: 197. Важность: незначительное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p197:t-product-key:r6c1; a97001:p197:t-product-key:r7c1; a97001:p197:t-product-key:r8c1; a97001:p197:t-product-key:r9c1; a97001:p197:t-product-key:r10c1

**Исходник:**
Пять отдельных записей легенды продукции: ES, ET, C, DT, FG.

**Текущая запись:**
r6c1 [53,476,220,486]; r7c1 [220,476,380,486]; r8c1 [53,486,311,495]; r9c1 [311,486,438,495]; r10c1 [438,486,499,495]

**Исправление / интерпретация:**
Заново определить начальную и конечную координаты каждой из пяти записей легенды, сохранив правильный HE и исходный растр. Это ошибка данных привязки; сбой подсветки в реальном интерфейсе не утверждается.

Доказательства: [файл1](evidence/4645888b0693f54d.png), [файл2](evidence/082489c44759da8b.png), [файл3](evidence/f52f929bbf3a43f8.png), [файл4](evidence/7077b13572f0c6ec.png), [файл5](evidence/c411a924b1a7b263.png), [файл6](evidence/f34dec9448a44bd2.png), [файл7](evidence/c8b5b3b0e2bb1e12.json)

### A191-203-S002
Подтверждённое отклонение атласа. Страницы: 191, 200, 201, 202. Важность: незначительное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p191:b002:s01; a97001:p191:b002:s03; a97001:p191:b003; a97001:p191:b004:s01; a97001:p191:b004:s02; a97001:p191:b005; a97001:p191:b006:s01; a97001:p191:b006:s02; a97001:p200:img01:t-applications:r1c1; a97001:p200:img01:t-applications:r2c1; a97001:p200:img01:t-applications:r3c1; a97001:p200:img01:t-applications:r4c1; a97001:p200:img01:t-applications:r5c1; a97001:p200:img02:t-applications:r1c1; a97001:p200:img02:t-applications:r2c1; a97001:p200:img02:t-applications:r3c1; a97001:p200:img02:t-applications:r4c1; a97001:p201:b002:s02; a97001:p201:b002:s03; a97001:p202:b001; a97001:p202:b002

**Исходник:**
Полужирные начала определений на191/201/202 и технические характеристики внутри девяти описательных абзацев200. Точные фрагменты перечислены по каждой единице в данных.

**Текущая запись:**
В21 активной записи нет source_emphasis либо представления inline span/style. Исходные изображения и текст HE сохранены.

**Исправление / интерпретация:**
Закодировать точные исходные полужирные фрагменты внутри перечисленных записей, сохранив их текст и структуру. Это подтверждённый пропуск данных выделения; отсутствие выделения в фактически открытом интерфейсе здесь не утверждается.

Доказательства: [файл1](evidence/fd0519e96b1f9c02.png), [файл2](evidence/58f33f0b31f3256d.png), [файл3](evidence/266081376d0fab52.png), [файл4](evidence/64ae2354f95b52a3.txt), [файл5](evidence/fb8df8154c94abaa.txt), [файл6](evidence/2572955333c607f8.txt), [файл7](evidence/4a20970242bd1ca2.png), [файл8](evidence/4de1740223b1d56f.txt), [файл9](evidence/1ef1dcc6a6889742.png), [файл10](evidence/a64793f7851c24da.png), [файл11](evidence/2850b3dc01bd8b45.png), [файл12](evidence/503c5ed9bd94ad22.png), [файл13](evidence/face28ad99df4948.png), [файл14](evidence/e7970557efa2ad58.png), [файл15](evidence/3daad4c82c1371d9.png), [файл16](evidence/f8787078289e729f.png), [файл17](evidence/6aab224730b72602.png), [файл18](evidence/c8b5b3b0e2bb1e12.json)

### A51-100-001
Подтверждённое отклонение атласа. Страницы: 86. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p86:b003; a97001:p86:b004

**Наблюдение:**
Добавленное чтение מעוף как מְעוּף / me’uf и המעוף как הַמְּעוּף / hame’uf не соответствует современной норме в этих контекстах. Неогласованный исходник передан верно.

**Исходник:**
בנקודה זו משתנה מעוף הקלע / המהירות וזווית המעוף תהיה שוות אך הפוכות בכיוונם.

**Текущая запись:**
id: a97001:p86:b003
he: מצבו של הקלע תלוי בנקודה בה הוא נמצא לאורך המסלול. בשלב העלייה זווית הקלע עם האופק היא חיובית והולכת וקטנה עד שהקלע מגיע לשיא הגובה, שם הזווית מקבילה לקו האופקי. בנקודה זו משתנה מעוף הקלע והוא מתחיל לנוע כלפי מטה, הזווית עם הציר האופקי הופכת שלילית ומהירות הקלע הולכת וקטנה (סימן המהירות שלילי) כלפי מטה.
he_niqqud: מַצָּבוֹ שֶׁל הַקֶּלַע תָּלוּי בַּנְּקוּדָּה בָּהּ הוּא נִמְצָא לְאוֹרֶךְ הַמַּסְלוּל. בִּשְׁלַב הָעֲלִיָּה זָוִית הַקֶּלַע עִם הָאוֹפֶק הִיא חִיּוּבִית וְהוֹלֶכֶת וּקְטֵנָה עַד שֶׁהַקֶּלַע מַגִּיעַ לְשִׂיא הַגּוֹבַהּ, שָׁם הַזָּוִית מַקְבִּילָה לַקַּו הָאוֹפְקִי. בַּנְּקוּדָּה זוֹ מִשְׁתַּנֶּה מְעוּף הַקֶּלַע וְהוּא מַתְחִיל לָנוּעַ כְּלַפֵּי מַטָּה, הַזָּוִית עִם הַצִּיר הָאוֹפְקִי הוֹפֶכֶת שְׁלִילִית וּמְהִירוּת הַקֶּלַע הוֹלֶכֶת וּקְטֵנָה (סִימַן הַמְּהִירוּת שְׁלִילִי) כְּלַפֵּי מַטָּה.
translit: Matsavo shel hakela talui banekuda ba hu nimtsa le'orekh hamaslul. Bishlav ha'aliya zavit hakela im ha'ofek hi khiyuvit veholekhet uktena ad shehakela magi'a lesi hagovah, sham hazavit makbila lakav ha'ofki. Banekuda zo mishtane me'uf hakela vehu matkhil lanu'a klapei mata, hazavit im hatsir ha'ofki hofekhet shlilit umehirut hakela holekhet uktena (siman hamehirut shlili) klapei mata.
translit_ru: мацаво шэл хакэла талуи банэкуда ба ху нимца лэ’орэх хамаслул. бишлав ха’алийа завит хакэла им ха’офэк хи хийувит вэхолэхэт уктэна ад шэхакэла маги’а лэси хаговах, шам хазавит макбила лакав ха’офки. банэкуда зо миштанэ мэ’уф хакэла вэху матхил лану’а клапэи мата, хазавит им хацир ха’офки хофэхэт шлилит умэхирут хакэла холэхэт уктэна (симан хамэхирут шлили) клапэи мата.
ru: Состояние снаряда зависит от точки, в которой он находится вдоль траектории. На этапе подъёма угол снаряда с горизонтом положителен и всё уменьшается, пока снаряд не достигнет наибольшей высоты, где угол параллелен горизонтальной линии. В этой точке полёт снаряда изменяется, и он начинает двигаться вниз; угол с горизонтальной осью становится отрицательным, а скорость снаряда всё уменьшается (знак скорости отрицательный) вниз.
id: a97001:p86:b004
he: את מהירות השיגור ניתן לפרק לשני רכיבי מהירות: בציר x ובציר y. המהירות בציר x נשארת קבועה ואינה משתנה לאורך המסלול. המהירות האנכית משתנה והמהירות השקולה משנה את כיוונה בכל נקודה ונקודה. בשיא הגובה המהירות האנכית של הקלע אפס (0) ומשם מתחיל הקלע את תנועתו מטה. במשך תנועת הקלע הוא יעבור כל גובה פעמיים: פעם בעליה ופעם בירידה פרט לשיא הגובה אליו יגיע הקלע פעם אחת בלבד. באותו גובה, המהירות וזווית המעוף תהיה שוות אך הפוכות בכיוונם.
he_niqqud: אֶת מְהִירוּת הַשִּׁיגּוּר נִיתָּן לְפָרֵק לִשְׁנֵי רְכִיבֵי מְהִירוּת: בְּצִיר x וּבְצִיר y. הַמְּהִירוּת בְּצִיר x נִשְׁאֶרֶת קְבוּעָה וְאֵינָהּ מִשְׁתַּנָּה לְאוֹרֶךְ הַמַּסְלוּל. הַמְּהִירוּת הָאֲנָכִית מִשְׁתַּנָּה וְהַמְּהִירוּת הַשְּׁקוּלָה מְשַׁנָּה אֶת כִּיוּוּנָהּ בְּכָל נְקוּדָּה וּנְקוּדָּה. בְּשִׂיא הַגּוֹבַהּ הַמְּהִירוּת הָאֲנָכִית שֶׁל הַקֶּלַע אֶפֶס (0) וּמִשָּׁם מַתְחִיל הַקֶּלַע אֶת תְּנוּעָתוֹ מַטָּה. בְּמֶשֶׁךְ תְּנוּעַת הַקֶּלַע הוּא יַעֲבוֹר כָּל גּוֹבַהּ פַּעֲמַיִם: פַּעַם בַּעֲלִיָּה וּפַעַם בִּירִידָה פְּרָט לְשִׂיא הַגּוֹבַהּ אֵלָיו יַגִּיעַ הַקֶּלַע פַּעַם אַחַת בִּלְבַד. בְּאוֹתוֹ גּוֹבַהּ, הַמְּהִירוּת וְזָוִית הַמְּעוּף תִּהְיֶה שָׁווֹת אַךְ הֲפוּכוֹת בְּכִיוּוּנָם.
translit: Et mehirut hashigur nitan lefarek lishnei rekhivei mehirut: betsir x uvetsir y. Hamehirut betsir x nish'eret kvu'a ve'eina mishtana le'orekh hamaslul. Hamehirut ha'anakhit mishtana vehamehirut hashkula meshana et kivuna bekhol nekuda unekuda. Besi hagovah hamehirut ha'anakhit shel hakela efes (0) umisham matkhil hakela et tnu'ato mata. Bemeshekh tnu'at hakela hu ya'avor kol govah pa'amayim: pa'am ba'aliya ufa'am birida prat lesi hagovah elav yagi'a hakela pa'am akhat bilvad. Be'oto govah, hamehirut vezavit hame'uf tihye shavot akh hafukhot bekivunam.
translit_ru: эт мэхирут хашигур нитан лэфарэк лишнэи рэхивэи мэхирут: бэцир x увэцир y. хамэхирут бэцир x ниш’эрэт кву’а вэ’эина миштана лэ’орэх хамаслул. хамэхирут ха’анахит миштана вэхамэхирут хашкула мэшана эт кивуна бэхол нэкуда унэкуда. бэси хаговах хамэхирут ха’анахит шэл хакэла эфэс (0) умишам матхил хакэла эт тну’ато мата. бэмэшэх тну’ат хакэла ху йа’авор кол говах па’амайим: па’ам ба’алийа уфа’ам бирида прат лэси хаговах элав йаги’а хакэла па’ам ахат билвад. бэ’ото говах, хамэхирут вэзавит хамэ’уф тихйэ шавот ах хафухот бэкивунам.
ru: Скорость запуска можно разложить на две составляющие скорости: по оси x и по оси y. Скорость по оси x остаётся постоянной и не изменяется вдоль траектории. Вертикальная скорость изменяется, а результирующая скорость изменяет своё направление в каждой точке. На наибольшей высоте вертикальная скорость снаряда равна нулю (0), и оттуда снаряд начинает движение вниз. Во время движения снаряд пройдёт каждую высоту дважды: один раз при подъёме и один раз при спуске, кроме наибольшей высоты, которой снаряд достигнет только один раз. На одной и той же высоте скорость и угол полёта будут равны, но противоположны по своему направлению.

**Исправление / интерпретация:**
В b003: מְעוֹף הַקֶּלַע, me’of hakela, мэ’оф хакэла. В b004: הַמָּעוֹף, hama’of, хама’оф. Согласованно исправить только добавленные учебные поля.

Доказательства: [файл1](sources/source.pdf#page=86), [файл2](evidence/b24d3842c9e6ce5a.json)

### A51-100-002
Подтверждённое отклонение атласа. Страницы: 87. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p87:b007

**Наблюдение:**
В заголовке формулы и каноническом термине flight-angle повторено чтение מְעוּף / me’uf, в то время как здесь требуется абсолютная форма מָעוֹף / ma’of.

**Исходник:**
זווית מעוף

**Текущая запись:**
id: a97001:p87:b007
he: זווית מעוף
he_niqqud: זָוִית מְעוּף
translit: Zavit me'uf
translit_ru: завит мэ’уф
ru: Угол полёта

**Исправление / интерпретация:**
זָוִית מָעוֹף; Zavit ma’of; завит ма’оф. Исправить a97001:term:flight-angle и все действующие отображаемые языковые поля согласованно.

Доказательства: [файл1](sources/source.pdf#page=87), [файл2](evidence/5e291f4fe8e6465f.json)

### A51-100-003
Подтверждённое отклонение атласа. Страницы: 91. Важность: существенное.
Расхождение символа или формулы

Адреса: a97001:p91:img01:label:tangent-velocity

**Наблюдение:**
В source_text/he/производных полях записано VA. У исходного нижнего индекса видны вертикальная левая стойка и две округлые правые части B, а не A. Наличие точки A рядом не разрешает исправлять подпись по смыслу.

**Исходник:**
V_B (зелёная подпись вектора касательной скорости; нижний индекс B)

**Текущая запись:**
id: a97001:p91:img01:label:tangent-velocity
he: VA
he_niqqud: VA
translit: VA
translit_ru: VA
ru: VA

**Исправление / интерпретация:**
Сохранить исходное V_B во всех технических полях. Если источник подразумевает точку A, объяснить несогласованность отдельно, не заменять B. Сверить фактическое UI-представление.

**Ограничения:**
Сама надпись растровая низкого разрешения; увеличение не добавляет пиксельных данных.

Доказательства: [файл1](sources/source.pdf#page=91), [файл2](evidence/bc01e256703f2bc9.json), [файл3](evidence/39ca54fe543151fa.png), [файл4](evidence/37b74b3cbf551fc0.json), [файл5](evidence/2a9f2689dad64933.jpg), [файл6](evidence/e6167db8fc9c4fa7.json), [файл7](evidence/45d1c0e4cea7f3c7.jpg)

### A51-100-005
Подтверждённое отклонение атласа. Страницы: 81. Важность: существенное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p81:f04; a97001:p81:f11

**Наблюдение:**
Первая учебная формульная строка UI отображает отрицательный корень без зачёркивания; первичные узлы уже хранят отметки исключения. Слева сохранён оригинал с крестами. Вторая строка также подтверждена текущими screenshot, outerHTML и computedStyles none (phase4).

**Исходник:**
t₁ = 1 sec; t₂ = −1 sec и t₁ = 0.82 sec; t₂ = −1.22 sec. На обоих отрицательных корнях в оригинале стоят синие диагональные кресты.

**Текущая запись:**
id: a97001:p81:f04
he: t_1 = 1 sec ; t_2 = −1 sec
he_niqqud: t_1 = 1 sec ; t_2 = −1 sec
translit: t_1 = 1 sec ; t_2 = −1 sec
translit_ru: t_1 = 1 sec ; t_2 = −1 sec
ru: t_1 = 1 sec ; t_2 = −1 sec
id: a97001:p81:f11
he: t_1 = 0.82 sec ; t_2 = −1.22 sec
he_niqqud: t_1 = 0.82 sec ; t_2 = −1.22 sec
translit: t_1 = 0.82 sec ; t_2 = −1.22 sec
translit_ru: t_1 = 0.82 sec ; t_2 = −1.22 sec
ru: t_1 = 0.82 sec ; t_2 = −1.22 sec

**Исправление / интерпретация:**
Отобразить уже сохранённые source_annotations/source_marks как исключение отрицательного корня в учебной формульной строке. Сохранить исходные числа и оригинальное изображение.

**Ограничения:**
Учебный формульный слойUI, не весь атлас
Both targeted formula rows on each page verified. First rows retain independent archived visual confirmation; second rows confirmed by current phase4 screenshots, outerHTML and computedStyles none. Historical independent15 archive remains narrowly scoped; no whole-page UI acceptance.
Primary nodes already contain source_annotations/source_marks for source strikethroughs; this finding does not allege missing structured data.
a97001:p81:f04: confirmed_visual_independent
a97001:p81:f11: confirmed_current_screenshot_outerHTML_computedStyles

Доказательства: [файл1](sources/source.pdf#page=81), [файл2](evidence/67e0b0c857b68e0a.json), [файл3](evidence/b922efdf012b168f.png), [файл4](evidence/d2e9259e61cd1dd4.json), [файл5](evidence/2a579e32ad735ca1.jpg), [файл6](evidence/12ba6d75b58214e1.jpg), [файл7](evidence/c452e9d356151bc4.jpg), [файл8](evidence/b16f899a1f038cb4.json)

### A51-100-006
Подтверждённое отклонение атласа. Страницы: 85. Важность: незначительное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p85:f03; a97001:p85:f09

**Наблюдение:**
Первая формульная строка UI показывает отрицательный корень без исключения, хотя primary source_annotations/source_marks сохранены. Оригинал и редакторское примечание сохраняют смысл зачёркивания, поэтому тяжесть minor. Вторая строка также подтверждена текущими screenshot, outerHTML и computedStyles none (phase4).

**Исходник:**
Отрицательные корни t₂ = −1 sec и t₂ = −0.433 sec перечёркнуты синими крестами.

**Текущая запись:**
id: a97001:p85:f03
he: t1 = 1 sec; t2 = −1 sec
he_niqqud: t1 = 1 sec; t2 = −1 sec
translit: t1 = 1 sec; t2 = −1 sec
translit_ru: t1 = 1 sec; t2 = −1 sec
ru: t1 = 1 sec; t2 = −1 sec
id: a97001:p85:f09
he: t1 = 0.433 sec; t2 = −0.433 sec
he_niqqud: t1 = 0.433 sec; t2 = −0.433 sec
translit: t1 = 0.433 sec; t2 = −0.433 sec
translit_ru: t1 = 0.433 sec; t2 = −0.433 sec
ru: t1 = 0.433 sec; t2 = −0.433 sec

**Исправление / интерпретация:**
Отобразить уже сохранённые source_annotations/source_marks как исключение отрицательного корня в учебной формульной строке. Сохранить исходные числа и оригинальное изображение.

**Ограничения:**
Учебный формульный слойUI, не весь атлас
Both targeted formula rows on each page verified. First rows retain independent archived visual confirmation; second rows confirmed by current phase4 screenshots, outerHTML and computedStyles none. Historical independent15 archive remains narrowly scoped; no whole-page UI acceptance.
Primary nodes already contain source_annotations/source_marks for source strikethroughs; this finding does not allege missing structured data.
a97001:p85:f03: confirmed_visual_independent
a97001:p85:f09: confirmed_current_screenshot_outerHTML_computedStyles
about: page
id: r-f13e74f322c4e342983e0475
ref: 
source_note_id: s10-projectile-motion:p85:note:p85-source-quadratic
text: Источник печатает знак минус под корнем и результаты ±0.433 sec. Эти результаты не следуют из напечатанного выражения; ни формула, ни числа не исправлены. Отрицательные корни на странице перечёркнуты синим, отметки сохранены.

Доказательства: [файл1](sources/source.pdf#page=85), [файл2](evidence/7b44cd4936e564ab.json), [файл3](evidence/30fd6e9cfb25bf06.png), [файл4](evidence/96713c8526f477d8.json), [файл5](evidence/045518d87c6f2c05.jpg), [файл6](evidence/55c7ed07d0f1e136.jpg), [файл7](evidence/e669e4c7107129cc.json)

### A51-100-D01
Подтверждённое отклонение атласа. Страницы: 67, 69, 73. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p67:b002; a97001:p69:b002:s01; a97001:p73:b002:s01

**Исходник:**
נקודה (в исходнике неогласовано)

**Текущая запись:**
נְקוּדָה / וּנְקוּדָה / בַּנְּקוּדָה

**Исправление / интерпретация:**
Добавить обязательный дагеш דּ: נְקוּדָּה, וּנְקוּדָּה, בַּנְּקוּדָּה (сохраняя pleneו).

**Ограничения:**
Не меняет современную фонемную транслитерацию. Независимо подтверждены p69/p73; p67 тот же контекст absolute feminine singular, выявлен далее в short01.

Доказательства: [файл1](sources/source.pdf#page=67), [файл2](sources/source.pdf#page=69), [файл3](sources/source.pdf#page=73), [файл4](evidence/8f00ca4222ab6e8a.json), [файл5](evidence/9d4545e890c34898.json), [файл6](evidence/645c9d40a5ae9184.json)
Словарные источники: [источник1](https://www.pealim.com/dict/2866-nekuda/)

### A51-100-D02
Подтверждённое отклонение атласа. Страницы: 96, 99. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p96:b005:s01; a97001:p99:b004

**Исходник:**
היטל (в исходнике неогласовано)

**Текущая запись:**
בְּהֶיטֵל / הֶיטֵל

**Исправление / интерпретация:**
Восстановить обязательный дагеш טּ. Canonical словарная форма הֶטֵּל. Если сохраняется source full spellingי, использовать согласованный вариант הֶיטֵּל, не изменяя HE-оригинал.

**Ограничения:**
Независимо подтверждено координатором. Само сохранениеי не объявлено дефектом; современное hetel не меняется.

Доказательства: [файл1](sources/source.pdf#page=96), [файл2](sources/source.pdf#page=99), [файл3](evidence/efdb7e344cbae8b1.json), [файл4](evidence/4824f32c65a5f7bb.json)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/6215_1/%D7%94%D6%B6%D7%98%D6%BC%D6%B5%D7%9C)

### A51-100-D04
Неустановленное расхождение. Страницы: 69. Важность: незначительное.
Проверка: Точный исходный текст

Адреса: a97001:p69:b002:s02:heading

**Исходник:**
На увеличенном исходном изображении точка шурука расположена возлеו; не внутриא.

**Текущая запись:**
HE תְאּוצָה – a (U+05BC привязан кא); NI תְּאוּצָה – a

**Исправление / интерпретация:**
Уточнить точную кодировку source-огласовки по изображению и фактический rawHE-рендер. Вероятная source-форма תְאוּצָה; не объявлять PDF ошибочным из-за некорректного Unicode attachment.

**Ограничения:**
Второй проверяющий подтвердил позицию точки возлеו. До проверки фактического текущего рендераHE ось оставленаpartial. Нормализованное NI читается правильно.

Доказательства: [файл1](sources/source.pdf#page=69), [файл2](evidence/9d4545e890c34898.json), [файл3](evidence/08523cee1899571b.jpg), [файл4](evidence/6d389628f04f06a7.json), [файл5](evidence/673e9efe8308a1c9.json)

### A51-100-D05
Неустановленное расхождение. Страницы: 69, 72. Важность: незначительное.
Несоответствие транслитерации

Адреса: a97001:p69:b003; a97001:p69:b004; a97001:p72:b002:s01

**Исходник:**
ביחידת / ליחידות (source unpointed)

**Текущая запись:**
בִּיחִידַת → biykhidat / бийхидат; לִיחִידוֹת → liykhidot / лийхидот

**Исправление / интерпретация:**
Согласовать системный способ передачи materי после приставки. Нормативное слияние prefix+יְ даётi, но глобальная утверждённая схема не найдена. Сравнить p122:b004:s02 לִיחִידַת → likhidat.

**Ограничения:**
Не навязывается новая транслитерационная система. Это consistency/reading-convention pending, не установленная ошибка произношения.

Доказательства: [файл1](sources/source.pdf#page=69), [файл2](sources/source.pdf#page=72), [файл3](evidence/9d4545e890c34898.json), [файл4](evidence/bd9fc95e3099ccb4.json)

### A51-100-D06
Подтверждённое отклонение атласа. Страницы: 68. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p68:b002:s02

**Исходник:**
לשיפוע הגרף

**Текущая запись:**
לְשִׁיפּוּעַ הַגְּרַף

**Исправление / интерпретация:**
Использовать qamats в определённой absolute форме הַגְּרָף, согласно словарному גְּרָף. Не переносить автоматически на construct заголовка גרף תנועה.

**Ограничения:**
Координатор независимо открыл Academy59242_1 и подтвердил контекст. Это minor normative niqqud deviation, не ошибка TR graf.

Доказательства: [файл1](sources/source.pdf#page=68), [файл2](evidence/48922d9c1fdfbdda.json)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/59242_1/%D7%92%D6%BC%D6%B0%D7%A8%D6%B8%D7%A3)

### A51-100-D07
Подтверждённое отклонение атласа. Страницы: 57. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p57:b002:s01

**Исходник:**
בין החומרים הבאים במגע

**Текущая запись:**
בֵּין הַחוֹמָרִים הַבָּאִים בְּמַגָּע / bein hakhomarim haba'im bemaga / бэин хахомарим хаба’им бэмага

**Исправление / интерпретация:**
В этом определённом абсолютном множественном нужен артикль הֶ: нормативно הֶחֳמָרִים, hekhomarim / хэхомарим. В принятом полном написании можно сохранить ו; замечание касается гласной артикля.

**Ограничения:**
Re-review correction to an earlier PASS; original HE and complete Russian semantic translation remain correct.

Доказательства: [файл1](evidence/50f81e0632633b7e.png), [файл2](evidence/5571d8c4c4d31d1e.json), [файл3](evidence/1d9a3691f98b7740.json), [файл4](evidence/8334cc4e0d443b6e.json), [файл5](evidence/67c352a18976639a.jpg)
Словарные источники: [источник1](https://www.pealim.com/dict/3209-chomer/), [источник2](https://msradio.huji.ac.il/hagiya.html)

### A51-100-E01
Подтверждённое отклонение атласа. Страницы: 73, 75, 76, 78, 79. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p73:b003; a97001:p73:b008; a97001:p75:b003; a97001:p76:b002-s04:value; a97001:p78:b002; a97001:p78:b004:s03; a97001:p79:b003

**Исходник:**
בנקודה / מנקודה / נקודת / לנקודת (source unpointed)

**Текущая запись:**
בַּנְּקוּדָה / מִנְּקוּדָה / נְקוּדַת / לִנְקוּדַת

**Исправление / интерпретация:**
Добавить обязательный דּ: בַּנְּקוּדָּה / מִנְּקוּדָּה / נְקוּדַּת / לִנְקוּדַּת. Не менять современную транслитерацию из-за нефонемного удвоения.

**Ограничения:**
7 дополнительных записей,9 словоформ. Абсолютные и construct формы проверены по соответствующим предложениям.

Доказательства: [файл1](sources/source.pdf#page=73), [файл2](sources/source.pdf#page=75), [файл3](sources/source.pdf#page=76), [файл4](sources/source.pdf#page=78), [файл5](sources/source.pdf#page=79), [файл6](evidence/6b511fffc5bf66dc.json)
Словарные источники: [источник1](https://www.pealim.com/dict/2866-nekuda/)

### A51-100-E02
Подтверждённое отклонение атласа. Страницы: 77. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p77:b005

**Исходник:**
הערה: כל עוד לא צוין אחרת, השתמש בערכה של תאוצת הכובד

**Текущая запись:**
הֶעָרָה: כָּל עוֹד לֹא צֻוַּין אַחֶרֶת, הִשְׁתַּמֵּשׁ בְּעֶרְכָּהּ שֶׁל תְּאוּצַת הַכּוֹבֶד

**Исправление / интерпретация:**
Форма puʿal past3ms: צֻיַּן, либо согласованная plene форма צוּיַּן. Patah+dagesh должны быть уי, неו; нельзя сохранять צֻוַּין как огласованный эквивалент.

**Ограничения:**
Источник неогласован, HE faithfully copied. TR tsuyan/цуян правильны и не относятся к дефекту. Ошибка added reading с потенциальным фонетическим влиянием, отдельно от minor normative dagesh omissions.

Доказательства: [файл1](sources/source.pdf#page=77), [файл2](evidence/6b511fffc5bf66dc.json)
Словарные источники: [источник1](https://www.pealim.com/dict/1790-letzayen/)

### A51-100-F01
Подтверждённое отклонение атласа. Страницы: 94, 95, 97, 100. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p94:b003:s05; a97001:p94:b004; a97001:p95:b001; a97001:p97:b002; a97001:p100:b003; a97001:p100:b004:s01; a97001:p100:b004:s02

**Исходник:**
היטל / היטלים (source unpointed)

**Текущая запись:**
בְּהֶיטֵל / הַהֵיטֵלִים / הֵיטֵלִים

**Исправление / интерпретация:**
Восстановить טּ во всех7 единицах; plural нормативно הֶטֵּלִים, не הֵיטֵלִים. Сохранять source pleneי при принятом соглашении.

**Ограничения:**
7 дополнительных единиц,8 словоформ. Singular согласуется с D02; plural подтверждён Academy מישור הֶטֵּלִים. Современное hetelim не меняется.

Доказательства: [файл1](sources/source.pdf#page=94), [файл2](sources/source.pdf#page=95), [файл3](sources/source.pdf#page=97), [файл4](sources/source.pdf#page=100), [файл5](evidence/ce059a0edcf9f25c.json)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/6215_1/%D7%94%D6%B6%D7%98%D6%BC%D6%B5%D7%9C), [источник2](https://terms.hebrew-academy.org.il/munnah?kodErekhIvrit=22480)

### A51-100-F02
Подтверждённое отклонение атласа. Страницы: 94. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p94:b003:s01

**Исходник:**
פעולה דמיונית שמטרה הבנת הפרטים הנסתרים בגוף.

**Текущая запись:**
שֶׁמַּטְּרָה / shematra / шэматра

**Исправление / интерпретация:**
Для буквально сохранённого source שמטרה читать שֶׁמַּטָּרָה / shematara / шэматара. Не добавлять отсутствующие source буквыתה. Грамматическую проблему source отдельно объяснить.

**Ограничения:**
Source grammar typo отмечена editor. Она не лицензирует новую несловарную форму matra; independent confirmation координатора.

Доказательства: [файл1](sources/source.pdf#page=94), [файл2](evidence/ce059a0edcf9f25c.json)
Словарные источники: [источник1](https://www.pealim.com/he/dict/4123-matara/)

### A51-100-F03
Подтверждённое отклонение атласа. Страницы: 100. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p100:b002:s03

**Исходник:**
בו החלק משורטט

**Текущая запись:**
מְשׁוּרְטָט / meshurtat / мэшуртат

**Исправление / интерпретация:**
Син, не шин: מְשׂוּרְטָט (canonical מְשֻׂרְטָט) / mesurtat / мэсуртат. HE unpointed сохранить.

**Ограничения:**
Подтверждено по passive present3ms и независимо координатором. Не вопрос схемы sheva или full spelling. p96:b003 тот же корень נשרטט прочитан nesartet правильно.

Доказательства: [файл1](sources/source.pdf#page=100), [файл2](evidence/ce059a0edcf9f25c.json)
Словарные источники: [источник1](https://www.pealim.com/dict/2318-lesartet/), [источник2](https://terms.hebrew-academy.org.il/munnah/111045_1/%D7%A9%D7%82%D6%B4%D7%A8%D6%B0%D7%98%D7%95%D6%BC%D7%98)

### A51-100-F04
Подтверждённое отклонение атласа. Страницы: 100. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p100:b002:s06

**Исходник:**
מידות מרביות

**Текущая запись:**
מִידּוֹת מְרַבִּיוֹת

**Исправление / интерпретация:**
Добавить dagesh вי у feminine plural -יּוֹת: מְרַבִּיּוֹת допустимо; מֵרַבִּיּוֹת также словарный вариант. Начальное sheva не считать ошибкой. TR merabiyot уже правильна.

**Ограничения:**
Minor NI deviation now scoped only to omitted yod dagesh. Academy explicitly supports מְרַבִּי; earlier demand for initial tsere was overbroad and is withdrawn with history.

Доказательства: [файл1](sources/source.pdf#page=100), [файл2](evidence/ce059a0edcf9f25c.json), [файл3](evidence/d3ce73fb16f3167f.json)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/99191_1/), [источник2](https://www.pealim.com/dict/6841-merabi/)

### A51-100-F05
Подтверждённое отклонение атласа. Страницы: 100. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p100:b004:s04

**Исходник:**
מנקודת יחוס אחת / מנקודות יחוס שונות

**Текущая запись:**
מִנְּקוּדַת / מִנְּקוּדוֹת

**Исправление / интерпретация:**
Добавить דּ в обеих формах: מִנְּקוּדַּת / מִנְּקוּדּוֹת.

**Ограничения:**
Продолжение D01/E01; обе формы имеют ясный singular/plural контекст. TR остаётся правильной.

Доказательства: [файл1](sources/source.pdf#page=100), [файл2](evidence/ce059a0edcf9f25c.json)
Словарные источники: [источник1](https://www.pealim.com/dict/2866-nekuda/)

### A51-100-F06
Неустановленное расхождение. Страницы: 100. Важность: незначительное.
Несоответствие транслитерации

Адреса: a97001:p100:b002:s02

**Исходник:**
ביחידות

**Текущая запись:**
בִּיחִידוֹת → biykhidot / бийхидот

**Исправление / интерпретация:**
Согласовать reading convention, сравнить p122:b004:s02 לִיחִידַת→likhidat. Нормативное prefix+יְ даётi, но утверждённая схема не обнаружена.

**Ограничения:**
Continuation D05. Не объявлено доказанной фонетической ошибкой.

Доказательства: [файл1](sources/source.pdf#page=100), [файл2](evidence/ce059a0edcf9f25c.json)

### A51-100-GF01
Подтверждённое отклонение атласа. Страницы: 54. Важность: незначительное.
Добавлена отсутствующая в источнике подпись

Адреса: a97001:p54:img03:region:triangle:label:01

**Исходник:**
The lower right triangle has an unlabelled left vertical axis, right x, and the dimensions 60, 20, 210, 30, 90. No printed y is present above the vertical axis.

**Текущая запись:**
source_he/source_text/he = y; notes=[]

**Исправление / интерпретация:**
Удалить отсутствующую в источнике подпись y либо явно обозначить её как редакторское добавление вне точного исходного слоя. Сам рисунок сохранить.

Доказательства: [файл1](evidence/ef6a8921991d7511.png), [файл2](evidence/b3e87991acda754e.png), [файл3](evidence/b77a122f223c3d64.json), [файл4](evidence/170d9453121d2f46.json), [файл5](evidence/63d2de79ff704e30.jpg)

### A51-100-GF02
Подтверждённое отклонение атласа. Страницы: 51. Важность: незначительное.
Обрезанная область подписи

Адреса: a97001:p51:img01:region:general-triangle:label:01; a97001:p51:img01:region:right-triangle:label:01; a97001:p51:img01:region:rectangle:label:01; a97001:p51:img01:region:square:label:01

**Исходник:**
Each of the four top-table shapes has y above its vertical axis.

**Текущая запись:**
general-triangle [190,175,292,274], right-triangle [190,290,292,399], rectangle [389,175,490,274], square [389,289,490,399]. Their upper edges remove all or most of y.

**Исправление / интерпретация:**
Расширить source_bbox каждого из четырёх подрисунков вверх до фактической подписи y и перепроверить их отдельно. Правильный текст y не менять.

Доказательства: [файл1](evidence/7acbdb0d91f5c83f.png), [файл2](evidence/64cf812b22628d61.png)

### A51-100-GF03
Подтверждённое отклонение атласа. Страницы: 99. Важность: незначительное.
Область подписи указывает в другое место

Адреса: a97001:p99:img03:label-arrow-bottom

**Исходник:**
The bottom A lies left and below the bottom section arrow.

**Текущая запись:**
source_bbox=[132,643,150,664] covers blank space below the arrow, not A.

**Исправление / интерпретация:**
Сдвинуть область подписи влево, чтобы она охватывала нижнюю A. Правильный текст A и родительский рисунок не менять.

Доказательства: [файл1](evidence/9886266be5b115f2.png), [файл2](evidence/82bc21deddaddbf8.png)

### A51-100-GL01
Не подтверждено как ошибка атласа. Страницы: 99. Важность: pending.
Отдельный исходный знак не аттестован

Адреса: a97001:p99:img01; source-only:p99:img01:green-plane-mark

**Исходник:**
A small green mark appears on the left part of the cutting plane; native raster does not allow confident identification as a particular letter.

**Текущая запись:**
figure labels=[]; the mark remains in the original raster asset.

**Исправление / интерпретация:**
До добавления подписи получить более чёткий оригинал или надёжное независимое чтение. Не выводить α из смысла секущей плоскости.

Доказательства: [файл1](evidence/29176b7ee354ad6c.png), [файл2](evidence/ce0ce32847fe3675.png), [файл3](evidence/e4788d501dfecd19.png)

### A51-100-L01
Особенность или ошибка исходника. Страницы: 82. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p82:b002

**Наблюдение:**
В источнике ביחיד вместо ожидаемого היחיד. Атлас не подменяет источник: RU и транслитерация оставляют ⟦ביחיד⟧, editor объясняет опечатку. Это прозрачное ограничение источника, но полного RU/произносительного слоя для токена нет.

**Исходник:**
הכוח ביחיד הפועל על הקלע הוא משקלו mg.

**Текущая запись:**
id: a97001:p82:b002
he: תנועת הקלע מתבצעת במישור, בציר x ובציר y. הנתיב בו נע הקלע נקרא ‘מסלול’. הכוח ביחיד הפועל על הקלע הוא משקלו mg. נוכל לתאר את תנועת הגוף כצירוף של שתי תנועות: אופקית במהירות קבועה, ותנועה אנכית בתאוצה קבועה g (נפילה חופשית).
he_niqqud: תְּנוּעַת הַקֶּלַע מִתְבַּצַּעַת בַּמִּישׁוֹר, בְּצִיר x וּבְצִיר y. הַנָּתִיב בּוֹ נָע הַקֶּלַע נִקְרָא ‘מַסְלוּל’. הַכּוֹחַ ביחיד הַפּוֹעֵל עַל הַקֶּלַע הוּא מִשְׁקָלוֹ mg. נוּכַל לְתָאֵר אֶת תְּנוּעַת הַגּוּף כְּצֵרוּף שֶׁל שְׁתֵּי תְּנוּעוֹת: אוֹפְקִית בִּמְהִירוּת קְבוּעָה, וּתְנוּעָה אֲנָכִית בִּתְאוּצָה קְבוּעָה g (נְפִילָה חוֹפְשִׁית).
translit: Tnu'at hakela mitbatsa'at bamishor, betsir x uvetsir y. Hanativ bo na hakela nikra ‘maslul’. Hakoakh ⟦ביחיד⟧ hapo'el al hakela hu mishkalo mg. Nukhal leta'er et tnu'at haguf ketseruf shel shtei tnu'ot: ofkit bimhirut kvu'a, utnu'a anakhit bite'utsa kvu'a g (nefila khofshit).
translit_ru: тну’ат хакэла митбаца’ат бамишор, бэцир x увэцир y. ханатив бо на хакэла никра ‘маслул’. хакоах ⟦ביחיד⟧ хапо’эл ал хакэла ху мишкало mg. нухал лэта’эр эт тну’ат хагуф кэцэруф шэл штэи тну’от: офкит бимхирут кву’а, утну’а анахит битэ’уца кву’а g (нэфила хофшит).
ru: Движение снаряда происходит в плоскости, по оси x и по оси y. Путь, по которому движется снаряд, называется «траекторией». Сила ⟦ביחיד⟧, действующая на снаряд, является его весом mg. Мы можем описать движение тела как сочетание двух движений: горизонтального с постоянной скоростью и вертикального с постоянным ускорением g (свободное падение).

**Исправление / интерпретация:**
Сохранить буквальный source HE. Возможна отдельная редакторская формулировка «по смыслу единственная сила»; не выдавать её за перевод исправленного источника.

**Ограничения:**
about: page
id: r-0faeee9b39aa60004a4f9ba1
ref: 
source_note_id: s10-projectile-motion:p82:note:p82-source-typo
text: В исходнике напечатано ביחיד. Ожидаемое по смыслу היחיד не подменяет источник; один токен оставлен без предлагаемого чтения. Все остальные слова прочитаны.

Доказательства: [файл1](sources/source.pdf#page=82), [файл2](evidence/ffdf63e16e781c6c.json)

### A51-100-L02
Особенность или ошибка исходника. Страницы: 100. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p100:img04:label-total-unresolved

**Наблюдение:**
Atlas явно оставляет ⟦неразборчивый фрагмент источника⟧ и объясняет, что число не восстановлено арифметически. Это корректная маркировка ограничения, не доказанный пропуск читаемого текста.

**Исходник:**
Нижний суммарный размер в ступенчатом чертеже: пикселизированная цифровая надпись, уверенное чтение полного числа не подтверждено.

**Текущая запись:**
id: a97001:p100:img04:label-total-unresolved
he: ⟦неразборчивый фрагмент источника⟧
he_niqqud: ⟦неразборчивый фрагмент источника⟧
translit: ⟦неразборчивый фрагмент источника⟧
translit_ru: ⟦неразборчивый фрагмент источника⟧
ru: ⟦неразборчивый фрагмент источника⟧

**Исправление / интерпретация:**
Не угадывать по геометрии или сумме размеров. Для полного закрытия нужен более качественный источник.

**Ограничения:**
about: page
id: r-b4aa573ea5da280b91f19d44
ref: 
source_note_id: a97001:p100:limit-total
text: Номинал суммарного размера в нижнем чертеже распался на пиксельные фрагменты; число не восстановлено по сумме соседних размеров.
about: page
id: r-d0853ac4a020a7b2d0a33af7
ref: a97001:p100:b005
source_note_id: s13-note-chain-conflict
text: Пункт11 разрешает цепочку частичных размеров, пункт13 запрещает цепные размеры. Обе формулировки источника сохранены без попытки согласовать их.

Доказательства: [файл1](sources/source.pdf#page=100), [файл2](evidence/0a2e62a7feb03628.json), [файл3](evidence/f9ec15f1e33acce0.png)

### A51-100-S01
Особенность или ошибка исходника. Страницы: 55. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p55:f07; a97001:p55:f08; a97001:p55:f10

**Наблюдение:**
В исходнике x_C квадрата указан90, затем в моменте используется30. В y-момент вместо площади−3600 подставлено−108000, получено−16200000. Копирование в атлас точное. На странице нет текущего editor-пояснения.

**Исходник:**
x_C = 90 mm / x_c·A = 30·(−3600) = −108000 mm³ / y_c·A = 150·(−108000) = −16200000 mm³

**Текущая запись:**
id: a97001:p55:f07
he: x_C = 90 mm
he_niqqud: x_C = 90 mm
translit: x_C = 90 mm
translit_ru: x_C = 90 mm
ru: x_C = 90 mm
id: a97001:p55:f08
he: x_c·A = 30·(−3600) = −108000 mm³
he_niqqud: x_c·A = 30·(−3600) = −108000 mm³
translit: x_c·A = 30·(−3600) = −108000 mm³
translit_ru: x_c·A = 30·(−3600) = −108000 mm³
ru: x_c·A = 30·(−3600) = −108000 mm³
id: a97001:p55:f10
he: y_c·A = 150·(−108000) = −16200000 mm³
he_niqqud: y_c·A = 150·(−108000) = −16200000 mm³
translit: y_c·A = 150·(−108000) = −16200000 mm³
translit_ru: y_c·A = 150·(−108000) = −16200000 mm³
ru: y_c·A = 150·(−108000) = −16200000 mm³

**Исправление / интерпретация:**
Не исправлять буквальный source HE. Отдельно объяснить x_C=30 mm; y_C·A=150·(−3600)=−540000 mm³ и зависимость итогов от этой ошибки.

Доказательства: [файл1](sources/source.pdf#page=55), [файл2](evidence/ebd34fb924148e63.json)

### A51-100-S02
Особенность или ошибка исходника. Страницы: 56. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p56:t-centroid-example-original:cell:4:6; a97001:p56:t-centroid-example-original:cell:6:6

**Наблюдение:**
Таблица точно повторяет ошибочный момент квадрата−16200000, но итог1254948.5 соответствует использованию−540000, а не напечатанному слагаемому.

**Исходник:**
−16200000 / 1254948.5

**Текущая запись:**
id: a97001:p56:t-centroid-example-original:cell:4:6
he: −16200000
he_niqqud: −16200000
translit: −16200000
translit_ru: −16200000
ru: −16200000
id: a97001:p56:t-centroid-example-original:cell:6:6
he: 1254948.5
he_niqqud: 1254948.5
translit: 1254948.5
translit_ru: 1254948.5
ru: 1254948.5

**Исправление / интерпретация:**
Сохранить исходную таблицу; связать с редакторским пояснением к p55. Не объявлять ошибкой переноса таблицы.

Доказательства: [файл1](sources/source.pdf#page=56), [файл2](evidence/4e6ee637890bdd65.json)

### A51-100-S03
Особенность или ошибка исходника. Страницы: 64, 66. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p64:b004:s02

**Наблюдение:**
Вопрос b в оригинале требует максимальную силу, при которой тело не скользит вниз; расчёт на p66 соответствует нижнему, минимальному пределу удерживающей силы. Русский перевод faithfully сохраняет «максимальное».

**Исходник:**
ב. ערך מרבי של כוח P שבו הגוף לא יחליק במורד המשטח.

**Текущая запись:**
id: a97001:p64:b004:s02
he: ב. ערך מרבי של כוח P שבו הגוף לא יחליק במורד המשטח.
he_niqqud: ב. עֵרֶךְ מֵרַבִּי שֶׁל כּוֹחַ P שֶׁבּוֹ הַגּוּף לֹא יַחְלִיק בְּמוֹרַד הַמִּשְׁטָח.
translit: bet. erekh merabi shel koakh P shebo haguf lo yakhlik bemorad hamishtakh.
translit_ru: бэт. эрэх мэраби шэл коах P шэбо хагуф ло яхлик бэморад хамиштах.
ru: б. Максимальное значение силы P, при котором тело не соскользнёт вниз по поверхности.

**Исправление / интерпретация:**
Сохранить исходный текст, отдельно пояснить, что для условия отсутствия скольжения вниз рассматривается минимальная необходимая сила. Связать p66:b002.

Доказательства: [файл1](sources/source.pdf#page=64), [файл2](evidence/1f03108a9b50e63d.json)

### A51-100-S04
Особенность или ошибка исходника. Страницы: 67. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p67:f04

**Наблюдение:**
Источник ошибочно печатает перевод1 m/sec в(1/3.6)km/h. Atlas сохраняет его буквально; editor на странице пуст.

**Исходник:**
1 m/sec = (1/3.6) km/h (kmh)

**Текущая запись:**
id: a97001:p67:f04
he: 1 m/sec = (1/3.6) km/h (kmh)
he_niqqud: 1 m/sec = (1/3.6) km/h (kmh)
translit: 1 m/sec = (1/3.6) km/h (kmh)
translit_ru: 1 m/sec = (1/3.6) km/h (kmh)
ru: 1 m/sec = (1/3.6) km/h (kmh)

**Исправление / интерпретация:**
Отдельная явно редакторская поправка:1m/s=3.6km/h;1km/h=(1/3.6)m/s. Не менять source-цитату.

Доказательства: [файл1](sources/source.pdf#page=67), [файл2](evidence/8f00ca4222ab6e8a.json)

### A51-100-S05
Особенность или ошибка исходника. Страницы: 68. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p68:b002:s02

**Наблюдение:**
В источнике сама функция x=Vt названа постоянной величиной, равной наклону графика. Постоянной является V, не x(t). RU точно передаёт ошибочное утверждение.

**Исходник:**
הפונקציה x = V · t היא גודל קבוע השווה לשיפוע הגרף, הזמן t הוא משתנה בלתי תלוי והמרחק x הוא משתנה תלוי זמן.

**Текущая запись:**
id: a97001:p68:b002:s02
he: הפונקציה x = V · t היא גודל קבוע השווה לשיפוע הגרף, הזמן t הוא משתנה בלתי תלוי והמרחק x הוא משתנה תלוי זמן.
he_niqqud: הַפּוּנְקְצְיָה x = V · t הִיא גּוֹדֶל קָבוּעַ הַשָּׁוֶוה לְשִׁיפּוּעַ הַגְּרַף, הַזְּמַן t הוּא מִשְׁתַּנֶּה בִּלְתִּי תָּלוּי וְהַמֶּרְחָק x הוּא מִשְׁתַּנֶּה תְּלוּי זְמַן.
translit: hafunktsya x = V · t hi godel kavua hashave leshipua hagraf, hazman t hu mishtane bilti talui vehamerkhak x hu mishtane tlui zman.
translit_ru: хафункця x = V · t хи годэл кавуа хашавэ лэшипуа хаграф, хазман t ху миштанэ билти талуи вэхамэрхак x ху миштанэ тлуи зман.
ru: Функция x = V · t является постоянной величиной, равной наклону графика, время t является независимой переменной, а расстояние x переменной, зависящей от времени.

**Исправление / интерпретация:**
Добавить пояснение о постоянной скорости и наклоне dx/dt, сохранив исходное предложение.

Доказательства: [файл1](sources/source.pdf#page=68), [файл2](evidence/48922d9c1fdfbdda.json)

### A51-100-S06
Особенность или ошибка исходника. Страницы: 70. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p70:f03; a97001:p70:f06

**Наблюдение:**
Последняя часть выражения координаты теряет x0. В формуле времени под корнем напечатан минус перед2a(xt−x0), а из исходного квадратного уравнения следует плюс. Перенос точный.

**Исходник:**
x_t = x_0 + V_0 · t + (a · t²)/2 = (V_t² − V_0²)/(2 · a) / t_(1,2) = (−V_0 ± √(V_0² − 2 · a · (x_t − x_0)))/a

**Текущая запись:**
id: a97001:p70:f03
he: x_t = x_0 + V_0 · t + (a · t²)/2 = (V_t² − V_0²)/(2 · a)
he_niqqud: x_t = x_0 + V_0 · t + (a · t²)/2 = (V_t² − V_0²)/(2 · a)
translit: x_t = x_0 + V_0 · t + (a · t²)/2 = (V_t² − V_0²)/(2 · a)
translit_ru: x_t = x_0 + V_0 · t + (a · t²)/2 = (V_t² − V_0²)/(2 · a)
ru: x_t = x_0 + V_0 · t + (a · t²)/2 = (V_t² − V_0²)/(2 · a)
id: a97001:p70:f06
he: t_(1,2) = (−V_0 ± √(V_0² − 2 · a · (x_t − x_0)))/a
he_niqqud: t_(1,2) = (−V_0 ± √(V_0² − 2 · a · (x_t − x_0)))/a
translit: t_(1,2) = (−V_0 ± √(V_0² − 2 · a · (x_t − x_0)))/a
translit_ru: t_(1,2) = (−V_0 ± √(V_0² − 2 · a · (x_t − x_0)))/a
ru: t_(1,2) = (−V_0 ± √(V_0² − 2 · a · (x_t − x_0)))/a

**Исправление / интерпретация:**
В редакторском слое: x_t=x_0+(V_t²−V_0²)/(2a); t=[−V_0±sqrt(V_0²+2a(x_t−x_0))]/a для a≠0. Сохранить source literal.

Доказательства: [файл1](sources/source.pdf#page=70), [файл2](evidence/77b018b9b25a6edc.json)

### A51-100-S07
Особенность или ошибка исходника. Страницы: 75. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p75:f02

**Наблюдение:**
При суммировании времени автобусного примера источник использует2 вместо7сек ускоренного участка (дано на p73 и расчёт p74), результат309.15 вместо314.15sec.

**Исходник:**
t_AB = 2 + 300 + 7.15 = 309.15 sec = 5.15 min

**Текущая запись:**
id: a97001:p75:f02
he: t_AB = 2 + 300 + 7.15 = 309.15 sec = 5.15 min
he_niqqud: t_AB = 2 + 300 + 7.15 = 309.15 sec = 5.15 min
translit: t_AB = 2 + 300 + 7.15 = 309.15 sec = 5.15 min
translit_ru: t_AB = 2 + 300 + 7.15 = 309.15 sec = 5.15 min
ru: t_AB = 2 + 300 + 7.15 = 309.15 sec = 5.15 min

**Исправление / интерпретация:**
Сохранить цитату, указать в редакторском пояснении7+300+7.15=314.15sec≈5.24min.

Доказательства: [файл1](sources/source.pdf#page=75), [файл2](evidence/315d017d92d03615.json)

### A51-100-S08
Особенность или ошибка исходника. Страницы: 77. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p77:f01; a97001:p77:f02; a97001:p77:f05

**Наблюдение:**
В одной системе знаков формулы V_t и V_t² несовместимы: под корнем f01 стоит−2gy, а f02 содержит+2gy. Формула времени повторяет ошибочный знак дискриминанта.

**Исходник:**
V_t = V_0 + g · t = √(V_0² − 2 · g · y_t) = (2 · y + g · t²)/(2 · t) / V_t² = V_0² + 2 · g · y_t / t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y_t))/g

**Текущая запись:**
id: a97001:p77:f01
he: V_t = V_0 + g · t = √(V_0² − 2 · g · y_t) = (2 · y + g · t²)/(2 · t)
he_niqqud: V_t = V_0 + g · t = √(V_0² − 2 · g · y_t) = (2 · y + g · t²)/(2 · t)
translit: V_t = V_0 + g · t = √(V_0² − 2 · g · y_t) = (2 · y + g · t²)/(2 · t)
translit_ru: V_t = V_0 + g · t = √(V_0² − 2 · g · y_t) = (2 · y + g · t²)/(2 · t)
ru: V_t = V_0 + g · t = √(V_0² − 2 · g · y_t) = (2 · y + g · t²)/(2 · t)
id: a97001:p77:f02
he: V_t² = V_0² + 2 · g · y_t
he_niqqud: V_t² = V_0² + 2 · g · y_t
translit: V_t² = V_0² + 2 · g · y_t
translit_ru: V_t² = V_0² + 2 · g · y_t
ru: V_t² = V_0² + 2 · g · y_t
id: a97001:p77:f05
he: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y_t))/g
he_niqqud: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y_t))/g
translit: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y_t))/g
translit_ru: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y_t))/g
ru: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y_t))/g

**Исправление / интерпретация:**
Отдельно зафиксировать выбранное направление оси и знак g, затем дать согласованные формулы. Не превращать строгий перенос в молчаливое исправление.

Доказательства: [файл1](sources/source.pdf#page=77), [файл2](evidence/252ee8f0ceb6084a.json)

### A51-100-S09
Особенность или ошибка исходника. Страницы: 81. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p81:f02; a97001:p81:f04; a97001:p81:f05; a97001:p81:f06; a97001:p81:f09; a97001:p81:f11

**Наблюдение:**
Сохраняются ошибки исходного примера: отрицательное подкоренное выражение с последующим действительным±1sec; произвольное0.5sec вместо времени вершины;0.85 в расчёте и0.83 в итоговой высоте; выбранный0.82sec при броске вверх соответствует неверному знаку начальной скорости.

**Исходник:**
t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y))/g = (−0 ± √(0² − 2 · 10 · 5))/10 / t_1 = 1 sec ; t_2 = −1 sec / y = V_0 · t − (g · t²)/2 = 4.2 · 0.5 − (10 · 0.5²)/2 = 0.85 m / y_max = 5 + 0.83 = 5.83 m / t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y))/g = (−2 ± √(2² − 2 · 10 · (−5)))/10 / t_1 = 0.82 sec ; t_2 = −1.22 sec

**Текущая запись:**
id: a97001:p81:f02
he: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y))/g = (−0 ± √(0² − 2 · 10 · 5))/10
he_niqqud: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y))/g = (−0 ± √(0² − 2 · 10 · 5))/10
translit: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y))/g = (−0 ± √(0² − 2 · 10 · 5))/10
translit_ru: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y))/g = (−0 ± √(0² − 2 · 10 · 5))/10
ru: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y))/g = (−0 ± √(0² − 2 · 10 · 5))/10
id: a97001:p81:f04
he: t_1 = 1 sec ; t_2 = −1 sec
he_niqqud: t_1 = 1 sec ; t_2 = −1 sec
translit: t_1 = 1 sec ; t_2 = −1 sec
translit_ru: t_1 = 1 sec ; t_2 = −1 sec
ru: t_1 = 1 sec ; t_2 = −1 sec
id: a97001:p81:f05
he: y = V_0 · t − (g · t²)/2 = 4.2 · 0.5 − (10 · 0.5²)/2 = 0.85 m
he_niqqud: y = V_0 · t − (g · t²)/2 = 4.2 · 0.5 − (10 · 0.5²)/2 = 0.85 m
translit: y = V_0 · t − (g · t²)/2 = 4.2 · 0.5 − (10 · 0.5²)/2 = 0.85 m
translit_ru: y = V_0 · t − (g · t²)/2 = 4.2 · 0.5 − (10 · 0.5²)/2 = 0.85 m
ru: y = V_0 · t − (g · t²)/2 = 4.2 · 0.5 − (10 · 0.5²)/2 = 0.85 m
id: a97001:p81:f06
he: y_max = 5 + 0.83 = 5.83 m
he_niqqud: y_max = 5 + 0.83 = 5.83 m
translit: y_max = 5 + 0.83 = 5.83 m
translit_ru: y_max = 5 + 0.83 = 5.83 m
ru: y_max = 5 + 0.83 = 5.83 m
id: a97001:p81:f09
he: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y))/g = (−2 ± √(2² − 2 · 10 · (−5)))/10
he_niqqud: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y))/g = (−2 ± √(2² − 2 · 10 · (−5)))/10
translit: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y))/g = (−2 ± √(2² − 2 · 10 · (−5)))/10
translit_ru: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y))/g = (−2 ± √(2² − 2 · 10 · (−5)))/10
ru: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y))/g = (−2 ± √(2² − 2 · 10 · (−5)))/10
id: a97001:p81:f11
he: t_1 = 0.82 sec ; t_2 = −1.22 sec
he_niqqud: t_1 = 0.82 sec ; t_2 = −1.22 sec
translit: t_1 = 0.82 sec ; t_2 = −1.22 sec
translit_ru: t_1 = 0.82 sec ; t_2 = −1.22 sec
ru: t_1 = 0.82 sec ; t_2 = −1.22 sec

**Исправление / интерпретация:**
Не переписывать источник. Добавить доступные адресные пояснения расчётов и знаков. Точные ожидаемые числа должны рассчитываться при явном выборе знаков и исходных округлений.

Доказательства: [файл1](sources/source.pdf#page=81), [файл2](evidence/67e0b0c857b68e0a.json)

### A51-100-S10
Особенность или ошибка исходника. Страницы: 83. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p83:f04; a97001:p83:f06

**Наблюдение:**
В формулах оригинала Vy²=−2gt имеет неверную размерность (t вместо перемещения); второй дроби вертикальной координаты недостаёт минуса. Нынешний editor эти проблемы явно раскрывает.

**Исходник:**
Vy² = −2 · g · t / yt = −(g · t²)/2 = (g · x²)/(2 · V0²)

**Текущая запись:**
id: a97001:p83:f04
he: Vy² = −2 · g · t
he_niqqud: Vy² = −2 · g · t
translit: Vy² = −2 · g · t
translit_ru: Vy² = −2 · g · t
ru: Vy² = −2 · g · t
id: a97001:p83:f06
he: yt = −(g · t²)/2 = (g · x²)/(2 · V0²)
he_niqqud: yt = −(g · t²)/2 = (g · x²)/(2 · V0²)
translit: yt = −(g · t²)/2 = (g · x²)/(2 · V0²)
translit_ru: yt = −(g · t²)/2 = (g · x²)/(2 · V0²)
ru: yt = −(g · t²)/2 = (g · x²)/(2 · V0²)

**Исправление / интерпретация:**
Сохранить исходные формулы и текущее редакторское пояснение; проверить показ пояснения в UI.

**Ограничения:**
about: page
id: r-31a935227cec3715d7cf9fac
ref: 
source_note_id: s10-projectile-motion:p83:note:p83-source-equations
text: Источник печатает Vy² = −2·g·t, а во второй дроби yt отсутствует начальный минус. Формулы высоты и времени используют знаки неоднородно. Записи сохранены, вычислительный слой не включён.

Доказательства: [файл1](sources/source.pdf#page=83), [файл2](evidence/c11bd402c4f5b12f.json)

### A51-100-S11
Особенность или ошибка исходника. Страницы: 85. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p85:f07

**Наблюдение:**
Исходное подкоренное8.66²−2·10·5 отрицательно, но далее напечатаны действительные±0.433. Это явно объяснено editor.

**Исходник:**
t1,2 = (−V0 ± √(V0² − 2 · g · yt))/g = (−8.66 ± √(8.66² − 2 · 10 · 5))/10

**Текущая запись:**
id: a97001:p85:f07
he: t1,2 = (−V0 ± √(V0² − 2 · g · yt))/g = (−8.66 ± √(8.66² − 2 · 10 · 5))/10
he_niqqud: t1,2 = (−V0 ± √(V0² − 2 · g · yt))/g = (−8.66 ± √(8.66² − 2 · 10 · 5))/10
translit: t1,2 = (−V0 ± √(V0² − 2 · g · yt))/g = (−8.66 ± √(8.66² − 2 · 10 · 5))/10
translit_ru: t1,2 = (−V0 ± √(V0² − 2 · g · yt))/g = (−8.66 ± √(8.66² − 2 · 10 · 5))/10
ru: t1,2 = (−V0 ± √(V0² − 2 · g · yt))/g = (−8.66 ± √(8.66² − 2 · 10 · 5))/10

**Исправление / интерпретация:**
Сохранить оригинал и пояснение; не считать точное копирование дефектом атласа.

**Ограничения:**
about: page
id: r-f13e74f322c4e342983e0475
ref: 
source_note_id: s10-projectile-motion:p85:note:p85-source-quadratic
text: Источник печатает знак минус под корнем и результаты ±0.433 sec. Эти результаты не следуют из напечатанного выражения; ни формула, ни числа не исправлены. Отрицательные корни на странице перечёркнуты синим, отметки сохранены.

Доказательства: [файл1](sources/source.pdf#page=85), [файл2](evidence/7b44cd4936e564ab.json)

### A51-100-S12
Особенность или ошибка исходника. Страницы: 86. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p86:b003; a97001:p86:b004

**Наблюдение:**
Источник содержит научно нестрогие утверждения о «параллельном угле», уменьшении скорости при спуске и противоположных скоростях/углах на одинаковой высоте. Строгий RU сохраняет содержание; editor объясняет проблему.

**Исходник:**
מצבו של הקלע תלוי בנקודה בה הוא נמצא לאורך המסלול. בשלב העלייה זווית הקלע עם האופק היא חיובית והולכת וקטנה עד שהקלע מגיע לשיא הגובה, שם הזווית מקבילה לקו האופקי. בנקודה זו משתנה מעוף הקלע והוא מתחיל לנוע כלפי מטה, הזווית עם הציר האופקי הופכת שלילית ומהירות הקלע הולכת וקטנה (סימן המהירות שלילי) כלפי מטה. / את מהירות השיגור ניתן לפרק לשני רכיבי מהירות: בציר x ובציר y. המהירות בציר x נשארת קבועה ואינה משתנה לאורך המסלול. המהירות האנכית משתנה והמהירות השקולה משנה את כיוונה בכל נקודה ונקודה. בשיא הגובה המהירות האנכית של הקלע אפס (0) ומשם מתחיל הקלע את תנועתו מטה. במשך תנועת הקלע הוא יעבור כל גובה פעמיים: פעם בעליה ופעם בירידה פרט לשיא הגובה אליו יגיע הקלע פעם אחת בלבד. באותו גובה, המהירות וזווית המעוף תהיה שוות אך הפוכות בכיוונם.

**Текущая запись:**
id: a97001:p86:b003
he: מצבו של הקלע תלוי בנקודה בה הוא נמצא לאורך המסלול. בשלב העלייה זווית הקלע עם האופק היא חיובית והולכת וקטנה עד שהקלע מגיע לשיא הגובה, שם הזווית מקבילה לקו האופקי. בנקודה זו משתנה מעוף הקלע והוא מתחיל לנוע כלפי מטה, הזווית עם הציר האופקי הופכת שלילית ומהירות הקלע הולכת וקטנה (סימן המהירות שלילי) כלפי מטה.
he_niqqud: מַצָּבוֹ שֶׁל הַקֶּלַע תָּלוּי בַּנְּקוּדָּה בָּהּ הוּא נִמְצָא לְאוֹרֶךְ הַמַּסְלוּל. בִּשְׁלַב הָעֲלִיָּה זָוִית הַקֶּלַע עִם הָאוֹפֶק הִיא חִיּוּבִית וְהוֹלֶכֶת וּקְטֵנָה עַד שֶׁהַקֶּלַע מַגִּיעַ לְשִׂיא הַגּוֹבַהּ, שָׁם הַזָּוִית מַקְבִּילָה לַקַּו הָאוֹפְקִי. בַּנְּקוּדָּה זוֹ מִשְׁתַּנֶּה מְעוּף הַקֶּלַע וְהוּא מַתְחִיל לָנוּעַ כְּלַפֵּי מַטָּה, הַזָּוִית עִם הַצִּיר הָאוֹפְקִי הוֹפֶכֶת שְׁלִילִית וּמְהִירוּת הַקֶּלַע הוֹלֶכֶת וּקְטֵנָה (סִימַן הַמְּהִירוּת שְׁלִילִי) כְּלַפֵּי מַטָּה.
translit: Matsavo shel hakela talui banekuda ba hu nimtsa le'orekh hamaslul. Bishlav ha'aliya zavit hakela im ha'ofek hi khiyuvit veholekhet uktena ad shehakela magi'a lesi hagovah, sham hazavit makbila lakav ha'ofki. Banekuda zo mishtane me'uf hakela vehu matkhil lanu'a klapei mata, hazavit im hatsir ha'ofki hofekhet shlilit umehirut hakela holekhet uktena (siman hamehirut shlili) klapei mata.
translit_ru: мацаво шэл хакэла талуи банэкуда ба ху нимца лэ’орэх хамаслул. бишлав ха’алийа завит хакэла им ха’офэк хи хийувит вэхолэхэт уктэна ад шэхакэла маги’а лэси хаговах, шам хазавит макбила лакав ха’офки. банэкуда зо миштанэ мэ’уф хакэла вэху матхил лану’а клапэи мата, хазавит им хацир ха’офки хофэхэт шлилит умэхирут хакэла холэхэт уктэна (симан хамэхирут шлили) клапэи мата.
ru: Состояние снаряда зависит от точки, в которой он находится вдоль траектории. На этапе подъёма угол снаряда с горизонтом положителен и всё уменьшается, пока снаряд не достигнет наибольшей высоты, где угол параллелен горизонтальной линии. В этой точке полёт снаряда изменяется, и он начинает двигаться вниз; угол с горизонтальной осью становится отрицательным, а скорость снаряда всё уменьшается (знак скорости отрицательный) вниз.
id: a97001:p86:b004
he: את מהירות השיגור ניתן לפרק לשני רכיבי מהירות: בציר x ובציר y. המהירות בציר x נשארת קבועה ואינה משתנה לאורך המסלול. המהירות האנכית משתנה והמהירות השקולה משנה את כיוונה בכל נקודה ונקודה. בשיא הגובה המהירות האנכית של הקלע אפס (0) ומשם מתחיל הקלע את תנועתו מטה. במשך תנועת הקלע הוא יעבור כל גובה פעמיים: פעם בעליה ופעם בירידה פרט לשיא הגובה אליו יגיע הקלע פעם אחת בלבד. באותו גובה, המהירות וזווית המעוף תהיה שוות אך הפוכות בכיוונם.
he_niqqud: אֶת מְהִירוּת הַשִּׁיגּוּר נִיתָּן לְפָרֵק לִשְׁנֵי רְכִיבֵי מְהִירוּת: בְּצִיר x וּבְצִיר y. הַמְּהִירוּת בְּצִיר x נִשְׁאֶרֶת קְבוּעָה וְאֵינָהּ מִשְׁתַּנָּה לְאוֹרֶךְ הַמַּסְלוּל. הַמְּהִירוּת הָאֲנָכִית מִשְׁתַּנָּה וְהַמְּהִירוּת הַשְּׁקוּלָה מְשַׁנָּה אֶת כִּיוּוּנָהּ בְּכָל נְקוּדָּה וּנְקוּדָּה. בְּשִׂיא הַגּוֹבַהּ הַמְּהִירוּת הָאֲנָכִית שֶׁל הַקֶּלַע אֶפֶס (0) וּמִשָּׁם מַתְחִיל הַקֶּלַע אֶת תְּנוּעָתוֹ מַטָּה. בְּמֶשֶׁךְ תְּנוּעַת הַקֶּלַע הוּא יַעֲבוֹר כָּל גּוֹבַהּ פַּעֲמַיִם: פַּעַם בַּעֲלִיָּה וּפַעַם בִּירִידָה פְּרָט לְשִׂיא הַגּוֹבַהּ אֵלָיו יַגִּיעַ הַקֶּלַע פַּעַם אַחַת בִּלְבַד. בְּאוֹתוֹ גּוֹבַהּ, הַמְּהִירוּת וְזָוִית הַמְּעוּף תִּהְיֶה שָׁווֹת אַךְ הֲפוּכוֹת בְּכִיוּוּנָם.
translit: Et mehirut hashigur nitan lefarek lishnei rekhivei mehirut: betsir x uvetsir y. Hamehirut betsir x nish'eret kvu'a ve'eina mishtana le'orekh hamaslul. Hamehirut ha'anakhit mishtana vehamehirut hashkula meshana et kivuna bekhol nekuda unekuda. Besi hagovah hamehirut ha'anakhit shel hakela efes (0) umisham matkhil hakela et tnu'ato mata. Bemeshekh tnu'at hakela hu ya'avor kol govah pa'amayim: pa'am ba'aliya ufa'am birida prat lesi hagovah elav yagi'a hakela pa'am akhat bilvad. Be'oto govah, hamehirut vezavit hame'uf tihye shavot akh hafukhot bekivunam.
translit_ru: эт мэхирут хашигур нитан лэфарэк лишнэи рэхивэи мэхирут: бэцир x увэцир y. хамэхирут бэцир x ниш’эрэт кву’а вэ’эина миштана лэ’орэх хамаслул. хамэхирут ха’анахит миштана вэхамэхирут хашкула мэшана эт кивуна бэхол нэкуда унэкуда. бэси хаговах хамэхирут ха’анахит шэл хакэла эфэс (0) умишам матхил хакэла эт тну’ато мата. бэмэшэх тну’ат хакэла ху йа’авор кол говах па’амайим: па’ам ба’алийа уфа’ам бирида прат лэси хаговах элав йаги’а хакэла па’ам ахат билвад. бэ’ото говах, хамэхирут вэзавит хамэ’уф тихйэ шавот ах хафухот бэкивунам.
ru: Скорость запуска можно разложить на две составляющие скорости: по оси x и по оси y. Скорость по оси x остаётся постоянной и не изменяется вдоль траектории. Вертикальная скорость изменяется, а результирующая скорость изменяет своё направление в каждой точке. На наибольшей высоте вертикальная скорость снаряда равна нулю (0), и оттуда снаряд начинает движение вниз. Во время движения снаряд пройдёт каждую высоту дважды: один раз при подъёме и один раз при спуске, кроме наибольшей высоты, которой снаряд достигнет только один раз. На одной и той же высоте скорость и угол полёта будут равны, но противоположны по своему направлению.

**Исправление / интерпретация:**
Сохранить разделение цитаты и научного комментария. Не исправлять source HE под видом перевода.

**Ограничения:**
about: page
id: r-36edce12f96f178ea178cae1
ref: 
source_note_id: s10-projectile-motion:p86:note:p86-source-claims
text: Утверждения «угол параллелен горизонтальной линии», об уменьшении скорости при спуске и об одинаковых, но противоположных скорости и угле переведены без научной коррекции. Источник смешивает модуль, проекцию и направление скорости. Ошибки согласования תהיה שוות и בכיוונם сохранены в HE.

Доказательства: [файл1](sources/source.pdf#page=86), [файл2](evidence/b24d3842c9e6ce5a.json)

### A51-100-S13
Особенность или ошибка исходника. Страницы: 87. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p87:f02; a97001:p87:f04; a97001:p87:f07; a97001:p87:f09

**Наблюдение:**
Источник пропускает знак между sinθ0 иgt, использует sin²(2θ0) в зависимости от ymax, пропускает t в первой частиyt и помещает формулу горизонтального броска в таблицу наклонного. Atlas совпадает; editor раскрывает ошибки.

**Исходник:**
Vy = V0 · sin(θ0) g · t / V0 = √(−(ymax · 2 · g)/sin²(2 · θ0)) / yt = V0 · sin(θ0) + (g · t²)/2 / x = V0 · √((2 · y)/g)

**Текущая запись:**
id: a97001:p87:f02
he: Vy = V0 · sin(θ0) g · t
he_niqqud: Vy = V0 · sin(θ0) g · t
translit: Vy = V0 · sin(θ0) g · t
translit_ru: Vy = V0 · sin(θ0) g · t
ru: Vy = V0 · sin(θ0) g · t
id: a97001:p87:f04
he: V0 = √(−(ymax · 2 · g)/sin²(2 · θ0))
he_niqqud: V0 = √(−(ymax · 2 · g)/sin²(2 · θ0))
translit: V0 = √(−(ymax · 2 · g)/sin²(2 · θ0))
translit_ru: V0 = √(−(ymax · 2 · g)/sin²(2 · θ0))
ru: V0 = √(−(ymax · 2 · g)/sin²(2 · θ0))
id: a97001:p87:f07
he: yt = V0 · sin(θ0) + (g · t²)/2
he_niqqud: yt = V0 · sin(θ0) + (g · t²)/2
translit: yt = V0 · sin(θ0) + (g · t²)/2
translit_ru: yt = V0 · sin(θ0) + (g · t²)/2
ru: yt = V0 · sin(θ0) + (g · t²)/2
id: a97001:p87:f09
he: x = V0 · √((2 · y)/g)
he_niqqud: x = V0 · √((2 · y)/g)
translit: x = V0 · √((2 · y)/g)
translit_ru: x = V0 · √((2 · y)/g)
ru: x = V0 · √((2 · y)/g)

**Исправление / интерпретация:**
Сохранить исходную таблицу, дать объяснение отдельно. Проверить доступность editor при чтении формул.

**Ограничения:**
about: page
id: r-43a4669ceac17fcf3109e00e
ref: 
source_note_id: s10-projectile-motion:p87:note:p87-source-equations
text: В Vy напечатано sin(θ0) g·t без знака между множителями; в формуле запуска через ymax стоит sin²(2·θ0); в первом слагаемом yt отсутствует t. Формула x = V0√(2y/g) оставлена именно в напечатанной колонке x напротив зависимости вертикального расстояния. Никакие знаки, аргументы или множители не исправлены.

Доказательства: [файл1](sources/source.pdf#page=87), [файл2](evidence/5e291f4fe8e6465f.json)

### A51-100-S14
Особенность или ошибка исходника. Страницы: 89. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p89:f01; a97001:p89:f02; a97001:p89:f03; a97001:p89:f04; a97001:p89:f05; a97001:p89:f06; a97001:p89:f07; a97001:p89:f08; a97001:p89:f09

**Наблюдение:**
В решении исходника знакиg и результаты несогласованы (например, положительный числитель делится на отрицательный знаменатель при положительном результате). Точный перенос, а editor прямо раскрывает противоречие.

**Исходник:**
Vy = 0 m/sec / Vx = V0 · cos(θ0) / 0.5 · V0 = V0 · cos(θ0) / θ0 = 60° / ymax = (V0² · sin²(θ0))/(2 · g) = (20² · sin²(60°))/(2 · −10) = 15 m / t = −(2 · V0 · sin(θ0))/g = −(2 · 20 · sin(60))/10 = 3.465 sec / R = −(V0² · sin(2 · θ0))/g = −(20² · sin(2 · 60))/10 = 34.64 m < 40 m / 40 = −(V0² · sin(2 · 60))/10 / V0 = 21.5 m/sec

**Текущая запись:**
id: a97001:p89:f01
he: Vy = 0 m/sec
he_niqqud: Vy = 0 m/sec
translit: Vy = 0 m/sec
translit_ru: Vy = 0 m/sec
ru: Vy = 0 m/sec
id: a97001:p89:f02
he: Vx = V0 · cos(θ0)
he_niqqud: Vx = V0 · cos(θ0)
translit: Vx = V0 · cos(θ0)
translit_ru: Vx = V0 · cos(θ0)
ru: Vx = V0 · cos(θ0)
id: a97001:p89:f03
he: 0.5 · V0 = V0 · cos(θ0)
he_niqqud: 0.5 · V0 = V0 · cos(θ0)
translit: 0.5 · V0 = V0 · cos(θ0)
translit_ru: 0.5 · V0 = V0 · cos(θ0)
ru: 0.5 · V0 = V0 · cos(θ0)
id: a97001:p89:f04
he: θ0 = 60°
he_niqqud: θ0 = 60°
translit: θ0 = 60°
translit_ru: θ0 = 60°
ru: θ0 = 60°
id: a97001:p89:f05
he: ymax = (V0² · sin²(θ0))/(2 · g) = (20² · sin²(60°))/(2 · −10) = 15 m
he_niqqud: ymax = (V0² · sin²(θ0))/(2 · g) = (20² · sin²(60°))/(2 · −10) = 15 m
translit: ymax = (V0² · sin²(θ0))/(2 · g) = (20² · sin²(60°))/(2 · −10) = 15 m
translit_ru: ymax = (V0² · sin²(θ0))/(2 · g) = (20² · sin²(60°))/(2 · −10) = 15 m
ru: ymax = (V0² · sin²(θ0))/(2 · g) = (20² · sin²(60°))/(2 · −10) = 15 m
id: a97001:p89:f06
he: t = −(2 · V0 · sin(θ0))/g = −(2 · 20 · sin(60))/10 = 3.465 sec
he_niqqud: t = −(2 · V0 · sin(θ0))/g = −(2 · 20 · sin(60))/10 = 3.465 sec
translit: t = −(2 · V0 · sin(θ0))/g = −(2 · 20 · sin(60))/10 = 3.465 sec
translit_ru: t = −(2 · V0 · sin(θ0))/g = −(2 · 20 · sin(60))/10 = 3.465 sec
ru: t = −(2 · V0 · sin(θ0))/g = −(2 · 20 · sin(60))/10 = 3.465 sec
id: a97001:p89:f07
he: R = −(V0² · sin(2 · θ0))/g = −(20² · sin(2 · 60))/10 = 34.64 m < 40 m
he_niqqud: R = −(V0² · sin(2 · θ0))/g = −(20² · sin(2 · 60))/10 = 34.64 m < 40 m
translit: R = −(V0² · sin(2 · θ0))/g = −(20² · sin(2 · 60))/10 = 34.64 m < 40 m
translit_ru: R = −(V0² · sin(2 · θ0))/g = −(20² · sin(2 · 60))/10 = 34.64 m < 40 m
ru: R = −(V0² · sin(2 · θ0))/g = −(20² · sin(2 · 60))/10 = 34.64 m < 40 m
id: a97001:p89:f08
he: 40 = −(V0² · sin(2 · 60))/10
he_niqqud: 40 = −(V0² · sin(2 · 60))/10
translit: 40 = −(V0² · sin(2 · 60))/10
translit_ru: 40 = −(V0² · sin(2 · 60))/10
ru: 40 = −(V0² · sin(2 · 60))/10
id: a97001:p89:f09
he: V0 = 21.5 m/sec
he_niqqud: V0 = 21.5 m/sec
translit: V0 = 21.5 m/sec
translit_ru: V0 = 21.5 m/sec
ru: V0 = 21.5 m/sec

**Исправление / интерпретация:**
Сохранить источник и действующий комментарий; UI-показ комментария требует отдельной проверки.

**Ограничения:**
about: page
id: r-4213ea316503f8ce97873335
ref: 
source_note_id: s10-projectile-motion:p89:note:p89-source-signs
text: Знаки g, численные подстановки и положительные результаты в исходном решении не согласованы. В частности положительный числитель делится на 2·−10, но указан ответ 15 m; отрицательные выражения с знаменателем 10 дают напечатанные положительные ответы. Сохранены ровно исходные записи, включая 3.465 sec и 21.5 m/sec; вычисления не исправлялись.

Доказательства: [файл1](sources/source.pdf#page=89), [файл2](evidence/69712312ab0ce736.json)

### A51-100-S15
Особенность или ошибка исходника. Страницы: 93. Важность: особенность исходника.
Исходный текст: отклонение или ограничение

Адреса: a97001:p93:cell:b002-s02-unit; a97001:p93:cell:b002-s03-unit; a97001:p93:cell:b002-s04-unit; a97001:p93:cell:b002-s05-unit

**Наблюдение:**
Источник печатает rad/sec² для всех ускорений, в том числе линейных. Подпись полного ускорения называет угловое вместо радиального. Atlas faithfully сохраняет, editor объясняет оба дефекта.

**Исходник:**
rad/sec² / rad/sec² / rad/sec² / rad/sec²

**Текущая запись:**
id: a97001:p93:cell:b002-s02-unit
he: rad/sec²
he_niqqud: rad/sec²
translit: rad/sec²
translit_ru: rad/sec²
ru: rad/sec²
id: a97001:p93:cell:b002-s03-unit
he: rad/sec²
he_niqqud: rad/sec²
translit: rad/sec²
translit_ru: rad/sec²
ru: rad/sec²
id: a97001:p93:cell:b002-s04-unit
he: rad/sec²
he_niqqud: rad/sec²
translit: rad/sec²
translit_ru: rad/sec²
ru: rad/sec²
id: a97001:p93:cell:b002-s05-unit
he: rad/sec²
he_niqqud: rad/sec²
translit: rad/sec²
translit_ru: rad/sec²
ru: rad/sec²

**Исправление / интерпретация:**
Не исправлять source table; сохранять редакторское пояснение оm/sec² ирадиальной составляющей.

**Ограничения:**
about: page
id: r-e7764e257940e67504a53569
ref: 
source_note_id: s11-circular-motion:p93:note:p93-source-units
text: Источник во всех четырёх строках печатает rad/sec². Для линейных ускорений единицы в источнике ошибочны; они не заменены на m/sec² ни в таблице, ни в переводе. Старый встроенный редакторский блок b002:s06 выведен из учебного слоя и сохранён в evidence.
about: page
id: r-f084cd84b1f8fff2b1b8ebd9
ref: 
source_note_id: s11-circular-motion:p93:note:p93-source-total-definition
text: В определении общего ускорения напечатано «результирующее касательного и углового ускорения», тогда как в формуле под корнем стоят at² и ar². Слово «углового» сохранено в строгом переводе, не заменено на «радиального».

Доказательства: [файл1](sources/source.pdf#page=93), [файл2](evidence/6737c2749b913aae.json)

### A51-100-SF01
Подтверждённое отклонение атласа. Страницы: 67. Важность: существенное.
Неверная область привязки к источнику

Адреса: a97001:p67:f01; a97001:p67:b007:formula; a97001:p67:f02; a97001:p67:f04; a97001:p67:f05

**Наблюдение:**
All five standalone formula coordinate boxes on page 67 point to wrong or incomplete source regions; formula strings remain faithful.

**Исходник:**
V=x/t; x=V·t; t=x/V; 1 m/sec=(1/3.6) km/h (kmh); 1 km=1000 m.

**Текущая запись:**
id: a97001:p67:f01
source_bbox: 48.024
309.656
142.214
342.31
he: V = x/t
exact_problem: Box includes denominator t and next x=V·t row rather than whole V=x/t.
id: a97001:p67:b007:formula
source_bbox: 48.024
349.016
142.166
373.75
he: x = V · t
exact_problem: Box points to t=x/V and זמן, not x=Vt.
id: a97001:p67:f02
source_bbox: 71.064
369.196
79.472
383.13
he: t = x/V
exact_problem: Box encloses only V denominator.
id: a97001:p67:f04
source_bbox: 238.66
511.112
319.56
531.044
he: 1 m/sec = (1/3.6) km/h (kmh)
exact_problem: Numerators m,1,km and suffix (kmh) excluded.
id: a97001:p67:f05
source_bbox: 0
556
596
574
he: 1 km = 1000 m
exact_problem: Box lies below formula in blank source area.

**Исправление / интерпретация:**
Заново привязать координаты к пяти фактическим областям формул. Исходную ошибку перевода единиц не исправлять молча.

Доказательства: [файл1](evidence/38e8d7e31c232b7c.png), [файл2](evidence/30f9e42e9fa0a647.png), [файл3](evidence/9aaafa8876b233d7.png)

### A51-100-SF02
Подтверждённое отклонение атласа. Страницы: 54, 55, 70, 77, 79, 81, 83, 87, 93. Важность: незначительное.
Обрезанная область формулы

Адреса: a97001:p54:f06; a97001:p54:f07; a97001:p55:f04; a97001:p70:f06; a97001:p77:f05; a97001:p79:f02; a97001:p79:f03; a97001:p81:f02; a97001:p81:f09; a97001:p83:f06; a97001:p83:f09; a97001:p87:f04; a97001:p87:f05; a97001:p87:f09; a97001:p87:f10:s01; a97001:p87:f10:s02; a97001:p87:f12; a97001:p87:f13; a97001:p87:f14; a97001:p93:f05

**Наблюдение:**
20 formula boxes clip denominators, radicals or the final argument. Formula text and LaTeX remain complete; defect is source-region geometry, not demonstrated UI loss.

**Исходник:**
Complete formulas are visible in source page renders. Exact cropped coordinates visibly truncate the identified glyphs.

**Текущая запись:**
id: a97001:p54:f06
source_bbox: 42
590
239
612
he: A = (b·h)/2 = (90·60)/2 = 2700 mm²
exact_problem: Both denominators 2 are clipped.
id: a97001:p54:f07
source_bbox: 42
634
239
656
he: x_C = 210 + 90/3 = 240 mm
exact_problem: Denominator 3 clipped.
id: a97001:p55:f04
source_bbox: 42
261
280
288
he: y_C = (4·R)/(3π) = (4·60)/(3π) = 25.5 mm
exact_problem: Bottom of both 3π denominators clipped.
id: a97001:p70:f06
source_bbox: 42.504
681.986
256.437
727.63
he: t_(1,2) = (−V_0 ± √(V_0² − 2 · a · (x_t − x_0)))/a
exact_problem: Radical overbar excluded above box.
id: a97001:p77:f05
source_bbox: 42.504
355.496
214.731
401.37
he: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y_t))/g
exact_problem: Radical overbar excluded above box.
id: a97001:p79:f02
source_bbox: 42.504
473.672
148.534
493.604
he: V_t = √(V_0² − 2 · g · y_t)
exact_problem: Radical overbar and lower hook clipped.
id: a97001:p79:f03
source_bbox: 42.504
516.076
152.614
530.485
he: 0 = √(15² − 2 · 10 · y_t)
exact_problem: Radical overbar clipped.
id: a97001:p81:f02
source_bbox: 42.504
242.002
310.368
281.374
he: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y))/g = (−0 ± √(0² − 2 · 10 · 5))/10
exact_problem: First radical overbar clipped.
id: a97001:p81:f09
source_bbox: 42.504
512.072
330.54
551.474
he: t_(1,2) = (−V_0 ± √(V_0² − 2 · g · y))/g = (−2 ± √(2² − 2 · 10 · (−5)))/10
exact_problem: First radical overbar clipped.
id: a97001:p83:f06
source_bbox: 81
187
217
225
he: yt = −(g · t²)/2 = (g · x²)/(2 · V0²)
exact_problem: Subscript 0 in second denominator clipped.
id: a97001:p83:f09
source_bbox: 82
339
184
383
he: t = √((2 · y)/g) = x/V0
exact_problem: Radical overbar excluded.
id: a97001:p87:f04
source_bbox: 286
208
415
249
he: V0 = √(−(ymax · 2 · g)/sin²(2 · θ0))
exact_problem: Lower radical hook clipped.
id: a97001:p87:f05
source_bbox: 287
252
409
290
he: V0 = (y − 0.5 · g · t²)/(sin(θ0) · t)
exact_problem: Nearly entire denominator sin(θ0)·t excluded.
id: a97001:p87:f09
source_bbox: 286
349
377
394
he: x = V0 · √((2 · y)/g)
exact_problem: Lower radical hook clipped.
id: a97001:p87:f10:s01
source_bbox: 64
397
210
435
he: ymax = −(V0² · sin²(θ0))/(2 · g)
exact_problem: Denominator g loses lower loop/descender.
id: a97001:p87:f10:s02
source_bbox: 64
442
211
480
he: R = −(V0² · sin(2 · θ0))/g
exact_problem: Denominator g descender clipped.
id: a97001:p87:f12
source_bbox: 64
527
173
563
he: t = −(V0 · sin(θ0))/g
exact_problem: Denominator g descender clipped.
id: a97001:p87:f13
source_bbox: 64
570
179
605
he: t = −(2 · V0 · sin(θ0))/g
exact_problem: Right closing parenthesis and denominator g descender clipped.
id: a97001:p87:f14
source_bbox: 64
617
349
663
he: t1,2 = (−V0 · sin(θ0) ± √(V0² · sin²(θ0) + 2 · g · y))/g
exact_problem: Denominator g descender clipped.
id: a97001:p93:f05
source_bbox: 40
577
236
614
he: atotal = √(at² + ar²); θ = tan⁻¹(ar/at)
exact_problem: Entire final ratio (ar/at) after tan^-1 excluded.

**Исправление / интерпретация:**
Расширить области до полных формул, включая черты и крючки корней, индексы и отношение после tan^-1.

Доказательства: [файл1](evidence/30f9e42e9fa0a647.png), [файл2](evidence/9aaafa8876b233d7.png), [файл3](evidence/b34cb8faf8ed2f17.png), [файл4](evidence/b1643d62a97c2db9.png), [файл5](evidence/a1a127dfe7f84352.png), [файл6](evidence/eb9b570cc50c46af.png)

### A51-100-SF03
Не подтверждено как ошибка атласа. Страницы: 90. Важность: существенное.
Исходный текст: отклонение или ограничение

Адреса: a97001:p90:f01; a97001:p90:cell:b003-s03-unit

**Наблюдение:**
The arc-length formula requires angle in radians, while the adjacent source symbol table assigns degrees. This is an original-source unit inconsistency, not a transcription error.

**Исходник:**
θ unit °; ΔS = Δθ · R.

**Текущая запись:**
Same ° and ΔS = Δθ · R faithfully reproduced.

**Исправление / интерпретация:**
Сохранить исходный текст; отдельным редакторским примечанием указать, что Δθ должно быть в радианах либо для градусов нужен множитель π/180.

Доказательства: [файл1](sources/source.pdf#page=90), [файл2](evidence/b070772dac0d5838.png)

### A51-100-ST01
Подтверждённое отклонение атласа. Страницы: 67. Важность: существенное.
Неверная область привязки к источнику

Адреса: a97001:p67:b008-s02:unit; a97001:p67:b008-s02:name; a97001:p67:b008-s02:symbol; a97001:p67:b008-s03:unit; a97001:p67:b008-s03:name; a97001:p67:b008-s03:symbol; a97001:p67:b008-s04:unit; a97001:p67:b008-s04:name; a97001:p67:b008-s04:symbol; a97001:p67:symbols

**Наблюдение:**
All nine source boxes are displaced; names and symbols map to the next source row, and final-row boxes map to blank space. Table container omits first row and includes unrelated conversion heading. Logical table text is correct.

**Исходник:**
First row V / מהירות / m/sec; second x / דרך / m; third t / זמן / sec.

**Текущая запись:**
מהירות bbox [295.08,438.54,320.364,451.92] encloses דרך; V bbox [330.84,440.292,336.636,452.304] encloses x; table bbox [257.62,420.132,553.15,486.02].

**Исправление / интерпретация:**
Заново определить девять областей по соответствующим символам и сузить контейнер до таблицы обозначений (примерно[253,400,342,471]). Текущий текст сохранить.

Доказательства: [файл1](evidence/45bc6e09873dc676.png), [файл2](sources/source.pdf#page=67)

### A51-100-ST02
Подтверждённое отклонение атласа. Страницы: 71. Важность: незначительное.
Неверная область привязки к источнику

Адреса: a97001:p71:b003-s03:unit

**Наблюдение:**
Source crop excludes the exponent 2 of acceleration unit.

**Исходник:**
m/sec²

**Текущая запись:**
bbox [208.15,338.272,225.166,367.324] yields m/sec only; text field remains m/sec².

**Исправление / интерпретация:**
Расширить правую границу, включив степень2; единицу измерения не менять.

Доказательства: [файл1](evidence/f93bab905e9dd77c.png), [файл2](evidence/cd9c4682a39ac1c3.png)

### A51-100-ST03
Подтверждённое отклонение атласа. Страницы: 76. Важность: незначительное.
Неверная область привязки к источнику

Адреса: a97001:p76:b002-s04:name

**Наблюдение:**
Name-cell source box also contains the adjacent value; the two source regions overlap.

**Исходник:**
ראשית הצירים (name) | נקודת הזריקה (value)

**Текущая запись:**
name source_bbox [221.86,247.69,381.78,261.07] encloses both phrases.

**Исправление / интерпретация:**
Область исходного имени должна охватывать только ראשית הצירים. Отдельную ячейку значения сохранить.

Доказательства: [файл1](evidence/b7f0a4281a1c5957.png), [файл2](evidence/3af07792a87c140f.png)

### A51-100-ST04
Подтверждённое отклонение атласа. Страницы: 87. Важность: незначительное.
Неверная область привязки к источнику

Адреса: a97001:p87:cell:f03-f04-f05; a97001:p87:cell:f09

**Наблюдение:**
Semantic row bounding boxes clip bottom portions of formulas (third launch-speed denominator; radical hook in range expression). Text is complete.

**Исходник:**
V0 = (y − 0.5·g·t²)/(sin(θ0)·t); x = V0·√((2·y)/g)

**Текущая запись:**
bbox [283,145,419,298] and [283,345,419,396] crop bottoms.

**Исправление / интерпретация:**
Расширить смысловые границы строк до полных формул, не добавляя несуществующих печатных линий.

Доказательства: [файл1](evidence/5feddcd78893dce0.png), [файл2](evidence/ff7ae58560248a07.png)

### A51-100-ST05
Подтверждённое отклонение атласа. Страницы: 51, 52. Важность: существенное.
Вместо отдельного подрисунка показан общий растр

Адреса: a97001:p51:t-centroid-shapes:diagram:rectangle; a97001:p51:t-centroid-shapes:diagram:square; a97001:p51:t-centroid-shapes:diagram:general-triangle; a97001:p51:t-centroid-shapes:diagram:right-triangle; a97001:p51:t-centroid-shapes:diagram:trapezoid; a97001:p51:t-centroid-shapes:diagram:circle; a97001:p52:t-centroid-circular-parts:diagram-row:1; a97001:p52:t-centroid-circular-parts:diagram-row:2

**Наблюдение:**
Confirmed live UI renders whole multi-shape source rasters in named individual region cells rather than the intended region. Original source is preserved.

**Исходник:**
p51 separate shape regions; p52 four semicircles in row1, four quadrants in row2.

**Текущая запись:**
p52 each of eight region entries uses 0c92ab...png, containing entire two-row table. p51 top-four entries use whole four-shape c597ad...png.

**Исправление / интерпретация:**
В отдельных ячейках показывать проверенные фрагменты соответствующих подрисунков либо показать общую исходную таблицу один раз с правильными структурными связями. Исходный растр сохранить.

Доказательства: [файл1](evidence/e57a454eedf9104e.json), [файл2](evidence/ac9bbd2f4eb37c1f.json), [файл3](evidence/0c92ab3281ae5991.png), [файл4](evidence/673e9efe8308a1c9.json), [файл5](evidence/b0c92fd77358e009.jpg), [файл6](evidence/424474af6228181d.jpg), [файл7](evidence/5678505cdd7fab92.jpg), [файл8](evidence/8fc75788b6aa3c36.jpg), [файл9](evidence/b0425882091ba1a6.jpg), [файл10](evidence/e53ee6104dbca28f.json)

### A51-100-T01
Подтверждённое отклонение атласа. Страницы: 94, 95. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:term:frontal-section; a97001:term:horizontal-section; a97001:term:profile-section

**Исходник:**
חתך בהיטל פנים / חתך בהיטל על / חתך בהיטל צד

**Текущая запись:**
חֲתָךְ בְּהֶיטֵל פָּנִים / חֲתָךְ בְּהֶיטֵל עַל / חֲתָךְ בְּהֶיטֵל צַד

**Исправление / интерпретация:**
Добавить дагеш в ט формы הֶטֵּל. При принятом полном написании возможно בְּהֶיטֵּל; наличие י не является этим дефектом. Латинское и кириллическое чтение behetel уже верно.

Доказательства: [файл1](evidence/0a8dd9219d6d5a2c.txt), [файл2](evidence/e9541af73f201b9d.json), [файл3](sources/source.pdf#page=94), [файл4](sources/source.pdf#page=95)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/6215_1/)

### A51-100-T02
Подтверждённое отклонение атласа. Страницы: 94. Важность: незначительное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:term:hatched-area

**Исходник:**
השטח המקווקו

**Текущая запись:**
שֶׁטַח מְקֻוְקָּו

**Исправление / интерпретация:**
Убрать дагеш из второй ק: מְקֻוְקָו по терминологии Академии. Сохранить mekuvkav / мекувкав; изменение современного произношения не утверждается.

**Ограничения:**
Four-consonant root קווקו, unlike triliteral intensive verbs. Secondary pointed spellings differ; finding is scoped normative deviation under primary source, not nonexistent-word claim. Source paragraph has correct undoubled qof and is not newly failed.

Доказательства: [файл1](evidence/0a8dd9219d6d5a2c.txt), [файл2](evidence/e9541af73f201b9d.json), [файл3](sources/source.pdf#page=94)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/69426_1/)

### A51-100-TL01
Неустановленное расхождение. Страницы: 60. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:term:incline-angle

**Исходник:**
זווית המישור המשופע

**Текущая запись:**
זָוִוית הַמִּישׁוֹר הַמְשׁוּפָּע

**Исправление / интерпретация:**
Уточнить принятую в атласе систему сочетания полного написания и огласовок и выбор ו для хирика. Не менять согласные и не объявлять фонетическую ошибку только из-за удвоения.

Доказательства: [файл1](evidence/2cbcf80613c8d4a9.txt), [файл2](sources/source.pdf#page=60)

### D101-114-AKUM
Подтверждённое отклонение атласа. Страницы: 106. Важность: существенное.
Проверка: Огласовки, translit, translit_ru

Адреса: a97001:p106:b002:s02

**Наблюдение:**
Article a must be e before unstressed עָ for this chosen reading. Do not change source grammar or flag historical akum versus modern akom.

**Исходник:**
העקום

**Текущая запись:**
he_niqqud: הָעָקוּם
translit: haakum
translit_ru: хаакум

**Исправление / интерпретация:**
he_niqqud: הֶעָקוּם
translit: heakum / he’akum
translit_ru: хэакум / хэ’акум

Доказательства: [файл1](evidence/8195c623172d31a7.png)
Словарные источники: [источник1](https://msradio.huji.ac.il/hagiya.html)

### D101-114-DIE-FORGING
Подтверждённое отклонение атласа. Страницы: 111. Важность: существенное.
Проверка: Огласовки, translit, translit_ru

Адреса: a97001:p111:t-stock-roughness:die-forging-method

**Наблюдение:**
Technical die noun טַבָּע, plural טַבָּעִים; current body reads a different form. Canonical die-forging already has the correct technical reading. HE and RU are retained.

**Исходник:**
חישול בטבעים

**Текущая запись:**
he_niqqud: חִישּׁוּל בִּטְבָעִים
translit: Khishul bitvaim
translit_ru: хишул битваим

**Исправление / интерпретация:**
he_niqqud: חִישּׁוּל בְּטַבָּעִים
translit: Khishul betabaim
translit_ru: хишул бэтабаим

Доказательства: [файл1](evidence/f7526c18820c1942.png)
Словарные источники: [источник1](https://www.milononline.net/%D7%98%D7%91%D7%A2/1639424)

### D101-114-SECTION-left
Подтверждённое отклонение атласа. Страницы: 108. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p108:t-profile-left:header-profile

**Наблюдение:**
Normative construct vowel patah, not absolute qamats. Both modern transliterations khatakh remain correct.

**Исходник:**
חתך הפרופיל

**Текущая запись:**
חֲתָךְ הַפְּרוֹפִיל

**Исправление / интерпретация:**
חֲתַךְ הַפְּרוֹפִיל

Доказательства: [файл1](evidence/91cfbc771f7a6728.png)
Словарные источники: [источник1](https://www.pealim.com/dict/5617-chatach/)

### D101-114-SECTION-right
Подтверждённое отклонение атласа. Страницы: 108. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p108:t-profile-right:header-profile

**Наблюдение:**
Normative construct vowel patah, not absolute qamats. Both modern transliterations khatakh remain correct.

**Исходник:**
חתך הפרופיל

**Текущая запись:**
חֲתָךְ הַפְּרוֹפִיל

**Исправление / интерпретация:**
חֲתַךְ הַפְּרוֹפִיל

Доказательства: [файл1](evidence/9e2b0dbf9cf7dc7b.png)
Словарные источники: [источник1](https://www.pealim.com/dict/5617-chatach/)

### D115-123-CHOMARIM-115-b001
Подтверждённое отклонение атласа. Страницы: 115. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p115:b001

**Наблюдение:**
В данном контексте определённое множественное число materials: статья e перед חֳ, либо её свёртка в ב. Полное написание ו не объявляется дефектом само по себе. Различаются именно a/e префикса; контекст каждой из6строк проверен отдельно.

**Исходник:**
תורת החומרים

**Текущая запись:**
he_niqqud: הַחוֹמָרִים
translit: hakhomarim
translit_ru: хахомарим

**Исправление / интерпретация:**
he_niqqud: הֶחֳמָרִים
translit: hekhomarim
translit_ru: хэхомарим

Доказательства: [файл1](evidence/99599c2157503092.png)
Словарные источники: [источник1](https://www.pealim.com/dict/3209-chomer/), [источник2](https://msradio.huji.ac.il/hagiya.html)

### D115-123-CHOMARIM-115-b003-s01
Подтверждённое отклонение атласа. Страницы: 115. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p115:b003:s01

**Наблюдение:**
В данном контексте определённое множественное число materials: статья e перед חֳ, либо её свёртка в ב. Полное написание ו не объявляется дефектом само по себе. Различаются именно a/e префикса; контекст каждой из6строк проверен отдельно.

**Исходник:**
בפיתוח ובייצור של כל המוצרים שאנו מכירים - מטוסים, גורדי שחקים, גשרים, פלאפונים, שתלים רפואיים ועוד הביצועים ואמינות המוצר יקבעו על ידי תכונות החומרים מהם המוצר עשוי.

**Текущая запись:**
he_niqqud: הַחוֹמָרִים
translit: hakhomarim
translit_ru: хахомарим

**Исправление / интерпретация:**
he_niqqud: הֶחֳמָרִים
translit: hekhomarim
translit_ru: хэхомарим

Доказательства: [файл1](evidence/15f33b6dbc1d1272.png)
Словарные источники: [источник1](https://www.pealim.com/dict/3209-chomer/), [источник2](https://msradio.huji.ac.il/hagiya.html)

### D115-123-CHOMARIM-117-b003-s02
Подтверждённое отклонение атласа. Страницы: 117. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p117:b003:s02

**Наблюдение:**
В данном контексте определённое множественное число materials: статья e перед חֳ, либо её свёртка в ב. Полное написание ו не объявляется дефектом само по себе. Различаются именно a/e префикса; контекст каждой из6строк проверен отдельно.

**Исходник:**
תערובת – ערבוב של שני חומרים טהורים לפחות משני סוגים שונים, היחס בין החומרים יכול להשתנות מתערובת לתערובת. לתערובת אין נקודת רתיחה והתכה קבועות כי הרכב החומר לא קבוע.

**Текущая запись:**
he_niqqud: הַחוֹמָרִים
translit: hakhomarim
translit_ru: хахомарим

**Исправление / интерпретация:**
he_niqqud: הֶחֳמָרִים
translit: hekhomarim
translit_ru: хэхомарим

Доказательства: [файл1](evidence/e99cbfefa60cfbda.png)
Словарные источники: [источник1](https://www.pealim.com/dict/3209-chomer/), [источник2](https://msradio.huji.ac.il/hagiya.html)

### D115-123-CHOMARIM-117-b003-s03
Подтверждённое отклонение атласа. Страницы: 117. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p117:b003:s03

**Наблюдение:**
В данном контексте определённое множественное число materials: статья e перед חֳ, либо её свёртка в ב. Полное написание ו не объявляется дефектом само по себе. Различаются именно a/e префикса; контекст каждой из6строк проверен отдельно.

**Исходник:**
תערובת הומוגנית – תערובת אחידה, לא ניתן להבחין בחומרים היוצרים אותה.

**Текущая запись:**
he_niqqud: בַּחוֹמָרִים
translit: bakhomarim
translit_ru: бахомарим

**Исправление / интерпретация:**
he_niqqud: בֶּחֳמָרִים
translit: bekhomarim
translit_ru: бэхомарим

Доказательства: [файл1](evidence/ca755a663512ee82.png)
Словарные источники: [источник1](https://www.pealim.com/dict/3209-chomer/), [источник2](https://msradio.huji.ac.il/hagiya.html)

### D115-123-CHOMARIM-117-b003-s04
Подтверждённое отклонение атласа. Страницы: 117. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p117:b003:s04

**Наблюдение:**
В данном контексте определённое множественное число materials: статья e перед חֳ, либо её свёртка в ב. Полное написание ו не объявляется дефектом само по себе. Различаются именно a/e префикса; контекст каждой из6строк проверен отдельно.

**Исходник:**
תערובת הטרוגנית – תערובת לא אחידה, ניתן להבחין בחומרים היוצרים אותה. דוגמאות: מים ובוץ, מים וחול, פלדה.

**Текущая запись:**
he_niqqud: בַּחוֹמָרִים
translit: bakhomarim
translit_ru: бахомарим

**Исправление / интерпретация:**
he_niqqud: בֶּחֳמָרִים
translit: bekhomarim
translit_ru: бэхомарим

Доказательства: [файл1](evidence/155f9e483f08063c.png)
Словарные источники: [источник1](https://www.pealim.com/dict/3209-chomer/), [источник2](https://msradio.huji.ac.il/hagiya.html)

### D115-123-CHOMARIM-117-b008
Подтверждённое отклонение атласа. Страницы: 117. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p117:b008

**Наблюдение:**
В данном контексте определённое множественное число materials: статья e перед חֳ, либо её свёртка в ב. Полное написание ו не объявляется дефектом само по себе. Различаются именно a/e префикса; контекст каждой из6строк проверен отдельно.

**Исходник:**
סגסוגת (מסג או נתך) – חומר בסיס המעורבב עם חומרי מסג (חומרים שמוסיפים למתכות בזמן הפקתן, כאשר הן במצב מותך) כדי לשפר את תכונותיו. הסגסוגת "יורשת" חלק מתכונות היסודות המרכיבים אותה, בדרך כלל תכונות פיזיקליות כגון: צפיפות. לעומת זאת, תכונות הנדסיות כגון מאמץ מתיחה, מודול יאנג וכוח גזירה עשויות להיות שונות בתכלית מתכונות החומרים המרכיבים את הסגסוגת.

**Текущая запись:**
he_niqqud: הַחוֹמָרִים
translit: hakhomarim
translit_ru: хахомарим

**Исправление / интерпретация:**
he_niqqud: הֶחֳמָרִים
translit: hekhomarim
translit_ru: хэхомарим

Доказательства: [файл1](evidence/e3f83ff253aa014d.png)
Словарные источники: [источник1](https://www.pealim.com/dict/3209-chomer/), [источник2](https://msradio.huji.ac.il/hagiya.html)

### D115-123-ELASTICITY
Подтверждённое отклонение атласа. Страницы: 123. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p123:b007

**Наблюдение:**
Начальный segol отличается от нормативного tsere и от собственного канонического термина. Современное произношение не меняется.

**Исходник:**
אלסטיות

**Текущая запись:**
אֶלַסְטִיּוּת

**Исправление / интерпретация:**
אֵלַסְטִיּוּת

Доказательства: [файл1](evidence/7fa2a796de343c00.png)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/2896_1/אֵלַסְטִי)

### D115-123-KEMERKAZIM
Подтверждённое отклонение атласа. Страницы: 118. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p118:b004

**Наблюдение:**
Absolute plural מֶרְכָּזִים сохраняет первую гласную e. Основания превращать prefix כְּ в כִּ нет. Не смешивать с корректным construct כִּבְסִיס на114.

**Исходник:**
כמרכזים

**Текущая запись:**
he_niqqud: כִּמְרְכָּזִים
translit: kimerkazim
translit_ru: кимэрказим

**Исправление / интерпретация:**
he_niqqud: כְּמֶרְכָּזִים
translit: kemerkazim
translit_ru: кэмэрказим

Доказательства: [файл1](evidence/d4e5ca6f30f88d83.png)
Словарные источники: [источник1](https://www.pealim.com/dict/3850-merkaz/)

### D115-123-MESHUSHE-BODY
Подтверждённое отклонение атласа. Страницы: 120. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p120:b012

**Наблюдение:**
В добавленном reading layer отсутствует сильный дагеш во втором ש. Форма на108 в profile-hex уже правильна; обе современные TR не меняются. Исходная частично огласованная форма120:b011 рассматривается отдельно.

**Исходник:**
משושה

**Текущая запись:**
מִבְנֶה גְּבִישִׁי מְשׁוּשֶׁה צָפוּף, שֶׁבּוֹ כָּל אָטוֹם נוֹגֵעַ בְּ-12 אָטוֹמִים: 6 אָטוֹמִים סוֹבְבִים סְבִיבוֹ, 3 מְצוּיִים מֵעָלָיו, 3 מִתַּחְתָּיו. סה"כ מֵכִיל הַגָּבִישׁ 17 אָטוֹמִים.

**Исправление / интерпретация:**
מְשׁוּשֶּׁה / מְשֻׁשֶּׁה

Доказательства: [файл1](evidence/daaa54330c89bdaa.png)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/51958_1/)

### D115-123-MESHUSHE-TERM
Подтверждённое отклонение атласа. Страницы: 120. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:term:hcp

**Наблюдение:**
В добавленном reading layer отсутствует сильный дагеш во втором ש. Форма на108 в profile-hex уже правильна; обе современные TR не меняются. Исходная частично огласованная форма120:b011 рассматривается отдельно.

**Исходник:**
משושה

**Текущая запись:**
מְשׁוּשֶׁה צְפוּף אֲרִיזָה

**Исправление / интерпретация:**
מְשׁוּשֶּׁה / מְשֻׁשֶּׁה

Доказательства: [файл1](sources/source.pdf#page=120)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/51958_1/)

### D115-123-RU-TERM-chemical-properties
Подтверждённое отклонение атласа. Страницы: 123. Важность: незначительное.
Непонятная или неточная формулировка перевода

Адреса: a97001:term:chemical-properties

**Наблюдение:**
source_definition_ru канонического термина повторяет тот же текст. Русская конструкция «реакция, описывающие» неграмматична. Источник сам содержит תגובת המתארות; HE оставить, опечатку пояснить отдельно, RU дать понятным. Это minor quality, не новый major научный дефект.

**Исходник:**
תכונות כימיות – תגובת המתארות את תגובת החומר לסביבה תוך שינויים בהרכבו.

**Текущая запись:**
Химические свойства – реакция, описывающие реакцию материала на окружающую среду с изменениями его состава.

**Исправление / интерпретация:**
Химические свойства описывают реакцию материала на окружающую среду, сопровождаемую изменениями его состава.

Доказательства: [файл1](sources/source.pdf#page=123)

### D115-123-RU-TERM-fatigue
Подтверждённое отклонение атласа. Страницы: 123. Важность: незначительное.
Непонятная или неточная формулировка перевода

Адреса: a97001:term:fatigue

**Наблюдение:**
source_definition_ru канонического термина повторяет тот же текст. כוח...לעמוד здесь означает способность выдерживать, а не отдельную механическую силу материала. Научное смешение усталости с сопротивлением циклам принадлежит исходнику и должно обсуждаться отдельной оговоркой.

**Исходник:**
התעייפות (מכנית) – כוח החומר לעמוד בכוח מחזורי.

**Текущая запись:**
Усталость (механическая) – сила материала выдерживать циклическую силу.

**Исправление / интерпретация:**
Усталость (механическая) – способность материала выдерживать циклически действующую силу.

Доказательства: [файл1](sources/source.pdf#page=123)

### D115-123-RU-chemical-properties
Подтверждённое отклонение атласа. Страницы: 123. Важность: незначительное.
Непонятная или неточная формулировка перевода

Адреса: a97001:p123:b001

**Наблюдение:**
Русская конструкция «реакция, описывающие» неграмматична. Источник сам содержит תגובת המתארות; HE оставить, опечатку пояснить отдельно, RU дать понятным. Это minor quality, не новый major научный дефект.

**Исходник:**
תכונות כימיות – תגובת המתארות את תגובת החומר לסביבה תוך שינויים בהרכבו.

**Текущая запись:**
Химические свойства – реакция, описывающие реакцию материала на окружающую среду с изменениями его состава.

**Исправление / интерпретация:**
Химические свойства описывают реакцию материала на окружающую среду, сопровождаемую изменениями его состава.

Доказательства: [файл1](evidence/86e54cc01aea27dc.png)

### D115-123-RU-fatigue
Подтверждённое отклонение атласа. Страницы: 123. Важность: незначительное.
Непонятная или неточная формулировка перевода

Адреса: a97001:p123:b010:s02

**Наблюдение:**
כוח...לעמוד здесь означает способность выдерживать, а не отдельную механическую силу материала. Научное смешение усталости с сопротивлением циклам принадлежит исходнику и должно обсуждаться отдельной оговоркой.

**Исходник:**
התעייפות (מכנית) – כוח החומר לעמוד בכוח מחזורי.

**Текущая запись:**
Усталость (механическая) – сила материала выдерживать циклическую силу.

**Исправление / интерпретация:**
Усталость (механическая) – способность материала выдерживать циклически действующую силу.

Доказательства: [файл1](evidence/6934bf556a0d2c15.png)

### D115-123-TMISA-TERM-solid-solution
Подтверждённое отклонение атласа. Страницы: 117. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:term:solid-solution

**Наблюдение:**
Канонический термин повторяет отсутствие сильного дагеша. Aqueous-solution уже имеет правильное תְּמִסָּה.

**Исходник:**
תמיסה מוצקה

**Текущая запись:**
תְּמִיסָה מוּצָקָה

**Исправление / интерпретация:**
תְּמִיסָּה מוּצָקָה

Доказательства: [файл1](sources/source.pdf#page=117)
Словарные источники: [источник1](https://www.pealim.com/he/dict/3796-tmisa/)

### D115-123-TMISA-TERM-solution
Подтверждённое отклонение атласа. Страницы: 117. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:term:solution

**Наблюдение:**
Канонический термин повторяет отсутствие сильного дагеша. Aqueous-solution уже имеет правильное תְּמִסָּה.

**Исходник:**
תמיסה

**Текущая запись:**
תְּמִיסָה

**Исправление / интерпретация:**
תְּמִיסָּה

Доказательства: [файл1](sources/source.pdf#page=117)
Словарные источники: [источник1](https://www.pealim.com/he/dict/3796-tmisa/)

### D115-123-TMISA-b004
Подтверждённое отклонение атласа. Страницы: 117. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p117:b004

**Наблюдение:**
В огласованном слое отсутствует сильный дагеш в ס. b006 содержит две такие формы; другая нерешённая исходная опечатка ממוס учитывается отдельно. Современные обе TR tmisa верны.

**Исходник:**
תמיסה (Solution) – תערובת הומוגנית, בדרך כלל, בצורת נוזל, המורכבת משני חומרים שונים או יותר.

**Текущая запись:**
תְּמִיסָה

**Исправление / интерпретация:**
תְּמִיסָּה (или нормативное неполное תְּמִסָּה)

Доказательства: [файл1](evidence/2e52c06dcf4380ff.png)
Словарные источники: [источник1](https://www.pealim.com/he/dict/3796-tmisa/)

### D115-123-TMISA-b005
Подтверждённое отклонение атласа. Страницы: 117. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p117:b005

**Наблюдение:**
В огласованном слое отсутствует сильный дагеш в ס. b006 содержит две такие формы; другая нерешённая исходная опечатка ממוס учитывается отдельно. Современные обе TR tmisa верны.

**Исходник:**
דוגמה, תמיסה מימית היא תערובת של מים עם חומר אחר. המים מכונים ממס והחומר האחר מכונה מומס.

**Текущая запись:**
תְּמִיסָה

**Исправление / интерпретация:**
תְּמִיסָּה (или нормативное неполное תְּמִסָּה)

Доказательства: [файл1](evidence/23cb188c118ead57.png)
Словарные источники: [источник1](https://www.pealim.com/he/dict/3796-tmisa/)

### D115-123-TMISA-b006
Подтверждённое отклонение атласа. Страницы: 117. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p117:b006

**Наблюдение:**
В огласованном слое отсутствует сильный дагеш в ס. b006 содержит две такие формы; другая нерешённая исходная опечатка ממוס учитывается отдельно. Современные обе TR tmisa верны.

**Исходник:**
תמיסה מוצקה – תערובת הומוגנית בין ממוס וממס הנמצאת בפאזה מוצקה. התערובת נחשבת תמיסה ולא תרכובת כאשר המבנה הגבישי של הממס אינו משתנה וגם יש פאזה הומוגנית משותפת לתערובת.

**Текущая запись:**
תְּמִיסָה

**Исправление / интерпретация:**
תְּמִיסָּה (или нормативное неполное תְּמִסָּה)

Доказательства: [файл1](evidence/7c340d620f4121ee.png)
Словарные источники: [источник1](https://www.pealim.com/he/dict/3796-tmisa/)

### D124-128-AREA-126-b005
Подтверждённое отклонение атласа. Страницы: 126. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p126:b005

**Наблюдение:**
Singular שטח has normative segol in absolute and construct. Current sheva and Shtakh/штах conflict with that educational reading and the correct canonical area term. Plurals and משטח are not affected.

**Исходник:**
מאמץ מרבי – σᵤₜₛ
זהו המאמץ המכסימלי המתפתח בדגם לפני שבירתו, לאחריו מופיע צוואר המקטין את שטח החתך המתנגד לכוח המתיחה עד שהדגם נקרע. העיבור שנשאר בדגם לאחר קריעתו מכונה עיבור השבר.

**Текущая запись:**
he_niqqud: מַאֲמָץ מְרַבִּי – σᵤₜₛ
זֶהוּ הַמַּאֲמָץ הַמַּכְסִימָלִי הַמִּתְפַּתֵּחַ בַּדֶּגֶם לִפְנֵי שְׁבִירָתוֹ, לְאַחֲרָיו מוֹפִיעַ צַוָּאר הַמַּקְטִין אֶת שְׁטַח הַחֲתָךְ הַמִּתְנַגֵּד לַכּוֹחַ הַמְּתִיחָה עַד שֶׁהַדֶּגֶם נִקְרָע. הָעִיבּוּר שֶׁנִּשְׁאָר בַּדֶּגֶם לְאַחַר קְרִיעָתוֹ מְכוּנֶּה עִיבּוּר הַשֶּׁבֶר.
translit: Ma'amats Merabi – σᵤₜₛ
Zehu Hama'amats Hamaksimali Hamitpateakh Badegem Lifnei Shvirato, Le'akharav Mofia Tsavar Hamaktin Et Shtakh Hakhatakh Hamitnaged Lakoakh Hametikha Ad Shehadegem Nikra. Ha'ibur Shenish'ar Badegem Le'akhar Kri'ato Mekhune Ibur Hashever.
translit_ru: ма'амац мэраби – σᵤₜₛ
зэху хама'амац хамаксимали хамитпатэах бадэгэм лифнэи швирато, лэ'ахарав мофиа цавар хамактин эт штах хахатах хамитнагэд лакоах хамэтиха ад шэхадэгэм никра. ха'ибур шэниш'ар бадэгэм лэ'ахар кри'ато мэхунэ ибур хашэвэр.

**Исправление / интерпретация:**
he_niqqud: שֶׁטַח (replace שְׁטַח only)
translit: Shetakh (replace Shtakh only)
translit_ru: шэтах (replace штах only)

Доказательства: [файл1](evidence/b329d44e8ca72d16.png)
Словарные источники: [источник1](https://www.pealim.com/dict/6095-shetach/)

### D124-128-AREA-127-b007-s03
Подтверждённое отклонение атласа. Страницы: 127. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p127:b007:s03

**Наблюдение:**
Singular שטח has normative segol in absolute and construct. Current sheva and Shtakh/штах conflict with that educational reading and the correct canonical area term. Plurals and משטח are not affected.

**Исходник:**
A שטח חתך הניצב להפעלת הכוח mm²

**Текущая запись:**
he_niqqud: A שְׁטַח חֲתָךְ הַנִּיצָּב לְהַפְעָלַת הַכּוֹחַ mm²
translit: A Shtakh Khatakh Hanitsav Lehaf'alat Hakoakh mm²
translit_ru: A штах хатах ханицав лэхаф'алат хакоах mm²

**Исправление / интерпретация:**
he_niqqud: שֶׁטַח (replace שְׁטַח only)
translit: Shetakh (replace Shtakh only)
translit_ru: шэтах (replace штах only)

Доказательства: [файл1](evidence/385d17003d34e446.png)
Словарные источники: [источник1](https://www.pealim.com/dict/6095-shetach/)

### D124-128-AREA-128-b002-s04
Подтверждённое отклонение атласа. Страницы: 128. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p128:b002:s04

**Наблюдение:**
Singular שטח has normative segol in absolute and construct. Current sheva and Shtakh/штах conflict with that educational reading and the correct canonical area term. Plurals and משטח are not affected.

**Исходник:**
שטח חתך מתנגד למתיחה

**Текущая запись:**
he_niqqud: שְׁטַח חֲתָךְ מִתְנַגֵּד לִמְתִיחָה
translit: Shtakh Khatakh Mitnaged Limtikha
translit_ru: штах хатах митнагэд лимтиха

**Исправление / интерпретация:**
he_niqqud: שֶׁטַח (replace שְׁטַח only)
translit: Shetakh (replace Shtakh only)
translit_ru: шэтах (replace штах only)

Доказательства: [файл1](evidence/d5768045ad3875a9.png)
Словарные источники: [источник1](https://www.pealim.com/dict/6095-shetach/)

### D124-128-DEGEM-b004
Подтверждённое отклонение атласа. Страницы: 124. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p124:b004

**Наблюдение:**
Образец ошибочно вокализован как דְּגַם и передан Dgam/дгам. У существительного דֶּגֶם сопряжённая форма единственного числа также דֶּגֶם־. Канонический term:tensile-specimen уже содержит degem.

**Исходник:**
דגם מתיחה

**Текущая запись:**
he_niqqud: הַמִּבְחַן מְבוּצָּע עַל דְּגַם מְתִיחָה שָׁטוּחַ אוֹ עָגוֹל (רְאֵה תְּמוּנָה מַטָּה) וְתוֹצְאוֹתָיו מְסַפְּקוֹת מֵידָע כַּמּוּתִי אוֹדוֹת חוֹזֶק מְתִיחָה שֶׁל הַחוֹמֶר, וְעַל תְּחוּם הָאֵלַסְטִיּוּת וְהַפְּלַסְטִיּוּת שֶׁל הַחוֹמֶר הַנִּבְדָּק.
translit: Hamivkhan Mevutsa Al Dgam Metikha Shatuakh O Agol (Re'e Tmuna Mata) Vetots'otav Mesapkot Meida Kamuti Odot Khozek Metikha Shel Hakhomer, Ve'al Tkhum Ha'elastiyut Vehaplastiyut Shel Hakhomer Hanivdak.
translit_ru: хамивхан мэвуца ал дгам мэтиха шатуах о агол (рэ'э тмуна мата) вэтоц'отав мэсапкот мэида камути одот хозэк мэтиха шэл хахомэр, вэ'ал тхум ха'эластийут вэхапластийут шэл хахомэр ханивдак.

**Исправление / интерпретация:**
he_niqqud: דֶּגֶם מתיחה
translit: Degem (вместо Dgam)
translit_ru: дэгэм (вместо дгам)

Доказательства: [файл1](evidence/abb8961fd6590610.png)
Словарные источники: [источник1](https://www.pealim.com/he/dict/5134-degem/)

### D124-128-DEGEM-b007
Подтверждённое отклонение атласа. Страницы: 124. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p124:b007

**Наблюдение:**
Образец ошибочно вокализован как דְּגַם и передан Dgam/дгам. У существительного דֶּגֶם сопряжённая форма единственного числа также דֶּגֶם־. Канонический term:tensile-specimen уже содержит degem.

**Исходник:**
דגם המבחן

**Текущая запись:**
he_niqqud: דְּגַם הַמִּבְחַן מוּתְקָן בִּמְכוֹנַת הַבְּדִיקָה בֵּין הַלֶּחִי הַנַּיַּחַת וְהַלֶּחִי הַנַּיֶּדֶת. בְּמַהֲלַךְ הַבְּדִיקָה נִלְקָחוֹת מְדִידוֹת שׁוֹנוֹת: הַכּוֹחַ הַמּוּפְעָל (עוֹמֶס הַמְּתִיחָה) וְהַדֵּפוֹרְמַצְיָה (שִׁינּוּי הָאוֹרֶךְ) הַמַּקְבִּילָה שֶׁל הַחוֹמֶר הַמְשׂוּרְטָטִים עַל גְּרָף.
translit: Dgam Hamivkhan Mutkan Bimkhonat Habdika Bein Halekhi Hanayakhat Vehalekhi Hanayedet. Bemahalakh Habdika Nilkakhot Medidot Shonot: Hakoakh Hamuf'al (Omes Hametikha) Vehadeformatsya (Shinuy Ha'orekh) Hamakbila Shel Hakhomer Hamesurtatim Al Graf.
translit_ru: дгам хамивхан муткан бимхонат хабдика бэин халэхи ханайахат вэхалэхи ханайэдэт. бэмахалах хабдика нилкахот мэдидот шонот: хакоах хамуф'ал (омэс хамэтиха) вэхадэформацйа (шинуй ха'орэх) хамакбила шэл хахомэр хамэсуртатим ал граф.

**Исправление / интерпретация:**
he_niqqud: דֶּגֶם המבחן
translit: Degem (вместо Dgam)
translit_ru: дэгэм (вместо дгам)

Доказательства: [файл1](evidence/6d2d7e2d5e325339.png)
Словарные источники: [источник1](https://www.pealim.com/he/dict/5134-degem/)

### D124-128-DEGEM-b008-s01
Подтверждённое отклонение атласа. Страницы: 124. Важность: существенное.
Отклонение огласовок или согласованного чтения

Адреса: a97001:p124:b008:s01

**Наблюдение:**
Образец ошибочно вокализован как דְּגַם и передан Dgam/дгам. У существительного דֶּגֶם сопряжённая форма единственного числа также דֶּגֶם־. Канонический term:tensile-specimen уже содержит degem.

**Исходник:**
דגם המתיחה

**Текущая запись:**
he_niqqud: מַפְעִילִים אֶת הַלֶּחִי הַנַּיֶּדֶת וְגוֹרְמִים לִתְנוּעָתָהּ כְּלַפֵּי מַעְלָה תַּחַת כּוֹחַ מְתִיחָה קָבוּעַ. דְּגַם הַמְּתִיחָה מִתְנַגֵּד לַכּוֹחַ וּמַתְחִיל לְהִתְאָרֵךְ.
translit: Maf'ilim Et Halekhi Hanayedet Vegormim Litnu'ata Klapei Ma'la Takhat Koakh Metikha Kavua. Dgam Hametikha Mitnaged Lakoakh Umatkhil Lehit'arekh.
translit_ru: маф'илим эт халэхи ханайэдэт вэгормим литну'ата клапэи ма'ла тахат коах мэтиха кавуа. дгам хамэтиха митнагэд лакоах уматхил лэхит'арэх.

**Исправление / интерпретация:**
he_niqqud: דֶּגֶם המתיחה
translit: Degem (вместо Dgam)
translit_ru: дэгэм (вместо дгам)

Доказательства: [файл1](evidence/6b673620b22cdc6d.png)
Словарные источники: [источник1](https://www.pealim.com/he/dict/5134-degem/)

### D124-128-MAAMATS-125-b002
Подтверждённое отклонение атласа. Страницы: 125. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p125:b002

**Наблюдение:**
מאמץ перед существительным מתיחה/כניעה стоит в сопряжённом состоянии. Камец нужно заменить на патах; современное /a/ и TR не меняются. Формы מאמץ מרבי / מאמץ מותר не включены, поскольку это noun+adjective.

**Исходник:**
בזמן ביצוע המבחן מסורטטים על גבי גרף מאמץ המתיחה המתפתח והמעוות המתפתחים בדגם. מכשיר מדידה מודד באופן רצוף את כוח המתיחה F המופעל על הדגם ואת התארכות הדגם ΔL. יחידת עיבוד הנתונים של המכונה מחשבת את מאמץ המתיחה σₜ, מידיעת מידת החתך הרוחבי A₀ ואת המעוות (עיבור) ε באמצעות מדידת שינוי האורך.

**Текущая запись:**
מַאֲמָץ הַמְּתִיחָה
מַאֲמָץ הַמְּתִיחָה

**Исправление / интерпретация:**
מַאֲמַץ הַמְּתִיחָה
מַאֲמַץ הַמְּתִיחָה

Доказательства: [файл1](evidence/21d5048b6e9b3931.png)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/), [источник2](https://terms.hebrew-academy.org.il/munnah/17318_1/)

### D124-128-MAAMATS-125-l-yield
Подтверждённое отклонение атласа. Страницы: 125. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p125:l-yield

**Наблюдение:**
מאמץ перед существительным מתיחה/כניעה стоит в сопряжённом состоянии. Камец нужно заменить на патах; современное /a/ и TR не меняются. Формы מאמץ מרבי / מאמץ מותר не включены, поскольку это noun+adjective.

**Исходник:**
מאמץ כניעה σᵧ

**Текущая запись:**
מַאֲמָץ כְּנִיעָה

**Исправление / интерпретация:**
מַאֲמַץ כְּנִיעָה

Доказательства: [файл1](evidence/8c7b8acb8fa27dcb.png)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/), [источник2](https://terms.hebrew-academy.org.il/munnah/17318_1/)

### D124-128-MAAMATS-126-b002
Подтверждённое отклонение атласа. Страницы: 126. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p126:b002

**Наблюдение:**
מאמץ перед существительным מתיחה/כניעה стоит в сопряжённом состоянии. Камец нужно заменить на патах; современное /a/ и TR не меняются. Формы מאמץ מרבי / מאמץ מותר не включены, поскольку это noun+adjective.

**Исходник:**
מאמץ כניעה – σᵧ
עד לנקודה זו הדגם מתארך ביחס ישר בין מאמץ המתיחה σₜ והמעוות ε (חוק הוק). בתחום זה הגדיר המדען תומאס יאנג מודול אלסטיות – E (התנגדות החומר לשינוי קטן בצורתו עקב כוח המופעל עליו, בתחום האלסטי).
הסרת פעולת הכוח לפני נקודה זו תגרום לחזרת העיבור לערכו ההתחלתי. לאחר נקודת הכניעה ההתארכות היא פלסטית (התחום הפלסטי של החומר), החומר לא חוזר למצבו ההתחלתי עם הפסקת העומס.

**Текущая запись:**
מַאֲמָץ כְּנִיעָה
מַאֲמָץ הַמְּתִיחָה

**Исправление / интерпретация:**
מַאֲמַץ כְּנִיעָה
מַאֲמַץ הַמְּתִיחָה

Доказательства: [файл1](evidence/e8e38d843d6277cc.png)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/), [источник2](https://terms.hebrew-academy.org.il/munnah/17318_1/)

### D124-128-MAAMATS-127-b006
Подтверждённое отклонение атласа. Страницы: 127. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p127:b006

**Наблюдение:**
מאמץ перед существительным מתיחה/כניעה стоит в сопряжённом состоянии. Камец нужно заменить на патах; современное /a/ и TR не меняются. Формы מאמץ מרבי / מאמץ מותר не включены, поскольку это noun+adjective.

**Исходник:**
מאמץ מתיחה ברגע נתון

**Текущая запись:**
מַאֲמָץ מְתִיחָה

**Исправление / интерпретация:**
מַאֲמַץ מְתִיחָה

Доказательства: [файл1](evidence/3f661b3486e2402f.png)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/), [источник2](https://terms.hebrew-academy.org.il/munnah/17318_1/)

### D124-128-MAAMATS-127-b007-s01
Подтверждённое отклонение атласа. Страницы: 127. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p127:b007:s01

**Наблюдение:**
מאמץ перед существительным מתיחה/כניעה стоит в сопряжённом состоянии. Камец нужно заменить на патах; современное /a/ и TR не меняются. Формы מאמץ מרבי / מאמץ מותר не включены, поскольку это noun+adjective.

**Исходник:**
σₜ מאמץ מתיחה MPa = N/mm²

**Текущая запись:**
מַאֲמָץ מְתִיחָה

**Исправление / интерпретация:**
מַאֲמַץ מְתִיחָה

Доказательства: [файл1](evidence/0a9704a5421c4ef4.png)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/), [источник2](https://terms.hebrew-academy.org.il/munnah/17318_1/)

### D124-128-MAAMATS-128-b001
Подтверждённое отклонение атласа. Страницы: 128. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p128:b001

**Наблюдение:**
מאמץ перед существительным מתיחה/כניעה стоит в сопряжённом состоянии. Камец нужно заменить на патах; современное /a/ и TR не меняются. Формы מאמץ מרבי / מאמץ מותר не включены, поскольку это noun+adjective.

**Исходник:**
תחום מאמץ הנמוך ממאמץ הכניעה של החומר המבטיח עבודה בטווח הרחוק ממאמץ הכניעה. היחס בין מאמץ הכניעה למאמץ המותר נקרא מקדם בטיחות (Safety Factor).

**Текущая запись:**
מִמַּאֲמָץ הַכְּנִיעָה
מִמַּאֲמָץ הַכְּנִיעָה
מַאֲמָץ הַכְּנִיעָה

**Исправление / интерпретация:**
מִמַּאֲמַץ הַכְּנִיעָה
מִמַּאֲמַץ הַכְּנִיעָה
מַאֲמַץ הַכְּנִיעָה

Доказательства: [файл1](evidence/913e9675558cf19f.png)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/), [источник2](https://terms.hebrew-academy.org.il/munnah/17318_1/)

### D124-128-MAAMATS-128-b002-s01
Подтверждённое отклонение атласа. Страницы: 128. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p128:b002:s01

**Наблюдение:**
מאמץ перед существительным מתיחה/כניעה стоит в сопряжённом состоянии. Камец нужно заменить на патах; современное /a/ и TR не меняются. Формы מאמץ מרבי / מאמץ מותר не включены, поскольку это noun+adjective.

**Исходник:**
σᵧ מאמץ כניעה במתיחה N/mm² = MPa

**Текущая запись:**
מַאֲמָץ כְּנִיעָה

**Исправление / интерпретация:**
מַאֲמַץ כְּנִיעָה

Доказательства: [файл1](evidence/b64f28c71666fe5b.png)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/), [источник2](https://terms.hebrew-academy.org.il/munnah/17318_1/)

### D124-128-SECTION-CONSTRUCT
Подтверждённое отклонение атласа. Страницы: 124. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:p124:b008:s02

**Наблюдение:**
В сопряжённом חתך החומר требуется патах, а не камац. Современное произношение khatakh и обе транслитерации этим не меняются.

**Исходник:**
חתך החומר

**Текущая запись:**
חֲתָךְ הַחוֹמֶר

**Исправление / интерпретация:**
חֲתַךְ הַחוֹמֶר

Доказательства: [файл1](evidence/bdfb22a4dd3e5884.png)
Словарные источники: [источник1](https://www.pealim.com/dict/5617-chatach/)

### D124-128-YIELD-TERM
Подтверждённое отклонение атласа. Страницы: 125, 126. Важность: незначительное.
Отклонение нормативных огласовок

Адреса: a97001:term:yield-point

**Наблюдение:**
Тот же дефект сопряжённого состояния сохранён в каноническом термине; проверенные occurrences: листы125 и126.

**Исходник:**
מאמץ כניעה

**Текущая запись:**
מַאֲמָץ כְּנִיעָה

**Исправление / интерпретация:**
מַאֲמַץ כְּנִיעָה

Доказательства: [файл1](sources/source.pdf#page=125), [файл2](sources/source.pdf#page=126)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/)

### D129-140-AREA-129-b002-s05
Подтверждённое отклонение атласа. Страницы: 129. Важность: существенное.
Проверка: Огласовки, translit, translit_ru

Адреса: a97001:p129:b002:s05

**Наблюдение:**
Normative singular absolute and construct retain segol. Current reduced reading differs from correct canonical term area; plural shtakhim, construct plural shitkhei and mishtakh not affected.

**Исходник:**
A שטח חתך הניצב להפעלת הכוח mm²

**Текущая запись:**
he_niqqud: A שְׁטַח חֲתָךְ הַנִּיצָּב לְהַפְעָלַת הַכּוֹחַ mm²
translit: A Shtakh Khatakh Hanitsav Lehaf'alat Hakoakh mm²
translit_ru: A штах хатах ханицав лэхаф'алат хакоах mm²

**Исправление / интерпретация:**
he_niqqud: שֶׁטַח (only singular שטח)
translit: Shetakh, not Shtakh
translit_ru: шэтах, not штах

Доказательства: [файл1](evidence/a1f6f7d33c78526b.png)
Словарные источники: [источник1](https://www.pealim.com/dict/6095-shetach/)

### D129-140-AREA-130-b006
Подтверждённое отклонение атласа. Страницы: 130. Важность: существенное.
Проверка: Огласовки, translit, translit_ru

Адреса: a97001:p130:b006

**Наблюдение:**
Normative singular absolute and construct retain segol. Current reduced reading differs from correct canonical term area; plural shtakhim, construct plural shitkhei and mishtakh not affected.

**Исходник:**
בשיטת בדיקה זו מפילים מגובה נתון H (10″) פטיש בעל חוד יהלום אל פני שטח מתכת נבדקת. הפטיש נתקל במתכת וקופץ חזרה. לפי הגובה h אליו הוא חזר נקבעת קשיות החומר. ככל שהקפיצה חזרה גבוהה יותר המתכת קשה יותר.

**Текущая запись:**
he_niqqud: בְּשִׁיטַת בְּדִיקָה זוֹ מַפִּילִים מִגּוֹבַהּ נָתוּן H (10″) פַּטִּישׁ בַּעַל חוֹד יַהֲלוֹם אֶל פְּנֵי שְׁטַח מַתֶּכֶת נִבְדֶּקֶת. הַפַּטִּישׁ נִתְקָל בַּמַּתֶּכֶת וְקוֹפֵץ חֲזָרָה. לְפִי הַגּוֹבַהּ h אֵלָיו הוּא חָזַר נִקְבַּעַת קַשְׁיוּת הַחוֹמֶר. כְּכָל שֶׁהַקְּפִיצָה חֲזָרָה גְּבוֹהָה יוֹתֵר הַמַּתֶּכֶת קָשֶׁה יוֹתֵר.
translit: Beshitat Bdika Zo Mapilim Migovah Natun H (10″) Patish Ba'al Khod Yahalom El Pnei Shtakh Matekhet Nivdeket. Hapatish Nitkal Bamatekhet Vekofets Khazara. Lefi Hagovah h Elav Hu Khazar Nikba'at Kashyut Hakhomer. Kekhol Shehakfitsa Khazara Gvoha Yoter Hamatekhet Kashe Yoter.
translit_ru: бэшитат бдика зо мапилим миговах натун H (10″) патиш ба'ал ход йахалом эл пнэи штах матэхэт нивдэкэт. хапатиш ниткал баматэхэт вэкофэц хазара. лэфи хаговах h элав ху хазар никба'ат кашйут хахомэр. кэхол шэхакфица хазара гвоха йотэр хаматэхэт кашэ йотэр.

**Исправление / интерпретация:**
he_niqqud: שֶׁטַח (only singular שטח)
translit: Shetakh, not Shtakh
translit_ru: шэтах, not штах

Доказательства: [файл1](evidence/51de67beae65dc13.png)
Словарные источники: [источник1](https://www.pealim.com/dict/6095-shetach/)

### D129-140-AREA-130-b010-s02
Подтверждённое отклонение атласа. Страницы: 130. Важность: существенное.
Проверка: Огласовки, translit, translit_ru

Адреса: a97001:p130:b010:s02

**Наблюдение:**
Normative singular absolute and construct retain segol. Current reduced reading differs from correct canonical term area; plural shtakhim, construct plural shitkhei and mishtakh not affected.

**Исходник:**
מחייבת שטח פנים מלוטש

**Текущая запись:**
he_niqqud: מְחַיֶּבֶת שְׁטַח פָּנִים מְלוּטָּשׁ
translit: Mekhayevet Shtakh Panim Melutash
translit_ru: мэхайэвэт штах паним мэлуташ

**Исправление / интерпретация:**
he_niqqud: שֶׁטַח (only singular שטח)
translit: Shetakh, not Shtakh
translit_ru: шэтах, not штах

Доказательства: [файл1](evidence/d2d400637425532d.png)
Словарные источники: [источник1](https://www.pealim.com/dict/6095-shetach/)

### D129-140-AREA-132-b006-s03
Подтверждённое отклонение атласа. Страницы: 132. Важность: существенное.
Проверка: Огласовки, translit, translit_ru

Адреса: a97001:p132:b006:s03

**Наблюдение:**
Normative singular absolute and construct retain segol. Current reduced reading differs from correct canonical term area; plural shtakhim, construct plural shitkhei and mishtakh not affected.

**Исходник:**
A שטח העקבה mm²

**Текущая запись:**
he_niqqud: A שְׁטַח הָעִקְבָה mm²
translit: A Shtakh Ha'ikva mm²
translit_ru: A штах ха'иква mm²

**Исправление / интерпретация:**
he_niqqud: שֶׁטַח (only singular שטח)
translit: Shetakh, not Shtakh
translit_ru: шэтах, not штах

Доказательства: [файл1](evidence/dd373c90f7224bad.png)
Словарные источники: [источник1](https://www.pealim.com/dict/6095-shetach/)

### D129-140-AREA-136-b001-s03
Подтверждённое отклонение атласа. Страницы: 136. Важность: существенное.
Проверка: Огласовки, translit, translit_ru

Адреса: a97001:p136:b001:s03

**Наблюдение:**
Normative singular absolute and construct retain segol. Current reduced reading differs from correct canonical term area; plural shtakhim, construct plural shitkhei and mishtakh not affected.

**Исходник:**
A שטח העקבה mm²

**Текущая запись:**
he_niqqud: A שְׁטַח הָעִקְבָה mm²
translit: A Shtakh Ha'ikva mm²
translit_ru: A штах ха'иква mm²

**Исправление / интерпретация:**
he_niqqud: שֶׁטַח (only singular שטח)
translit: Shetakh, not Shtakh
translit_ru: шэтах, not штах

Доказательства: [файл1](evidence/f52c6e6462739e8d.png)
Словарные источники: [источник1](https://www.pealim.com/dict/6095-shetach/)

### D129-140-AREA-137-b003
Подтверждённое отклонение атласа. Страницы: 137. Важность: существенное.
Проверка: Огласовки, translit, translit_ru

Адреса: a97001:p137:b003

**Наблюдение:**
Normative singular absolute and construct retain segol. Current reduced reading differs from correct canonical term area; plural shtakhim, construct plural shitkhei and mishtakh not affected.

**Исходник:**
בבדיקת ויקרס וברינל נמדדת הקשיות לפי שטח העקבה. בשיטת בדיקה זו נמדדת הקשיות על-פי עומק העקבה ביחידות שרירותיות.

**Текущая запись:**
he_niqqud: בִּבְדִיקַת וִיקֶרְס וּבְרִינֶל נִמְדֶּדֶת הַקַּשְׁיוּת לְפִי שְׁטַח הָעִקְבָה. בְּשִׁיטַת בְּדִיקָה זוֹ נִמְדֶּדֶת הַקַּשְׁיוּת עַל-פִּי עוֹמֶק הָעִקְבָה בִּיחִידוֹת שְׁרִירוּתִיּוֹת.
translit: Bivdikat Vikers Uvrinel Nimdedet Hakashyut Lefi Shtakh Ha'ikva. Beshitat Bdika Zo Nimdedet Hakashyut Al-Pi Omek Ha'ikva Biyekhidot Shrirutiyot.
translit_ru: бивдикат викэрс увринэл нимдэдэт хакашйут лэфи штах ха'иква. бэшитат бдика зо нимдэдэт хакашйут ал-пи омэк ха'иква бийэхидот шрирутийот.

**Исправление / интерпретация:**
he_niqqud: שֶׁטַח (only singular שטח)
translit: Shetakh, not Shtakh
translit_ru: шэтах, not штах

Доказательства: [файл1](evidence/4220a516ad61208f.png)
Словарные источники: [источник1](https://www.pealim.com/dict/6095-shetach/)

### D129-140-BRONZE
Подтверждённое отклонение атласа. Страницы: 134. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p134:b002:s07

**Наблюдение:**
Bronze and brass form a coordinated absolute noun phrase, not construct. Canonical bronze already uses the right vowel.

**Исходник:**
ארד ופליז מורפים k = 0.55

**Текущая запись:**
אֲרָד וּפְלִיז מוּרְפִּים

**Исправление / интерпретация:**
אָרָד וּפְלִיז מוּרְפִּים

Доказательства: [файл1](evidence/35b7b23359190adf.png)
Словарные источники: [источник1](https://www.pealim.com/dict/8891-arad/)

### D129-140-HARD-FEMININE
Подтверждённое отклонение атласа. Страницы: 130. Важность: существенное.
Проверка: Огласовки, translit, translit_ru

Адреса: a97001:p130:b006

**Наблюдение:**
Adjective agrees with feminine metal, not impersonal it is difficult. Source HE and RU meaning remain correct.

**Исходник:**
בשיטת בדיקה זו מפילים מגובה נתון H (10″) פטיש בעל חוד יהלום אל פני שטח מתכת נבדקת. הפטיש נתקל במתכת וקופץ חזרה. לפי הגובה h אליו הוא חזר נקבעת קשיות החומר. ככל שהקפיצה חזרה גבוהה יותר המתכת קשה יותר.

**Текущая запись:**
he_niqqud: הַמַּתֶּכֶת קָשֶׁה יוֹתֵר
translit: Hamatekhet Kashe Yoter
translit_ru: хаматэхэт кашэ йотэр

**Исправление / интерпретация:**
he_niqqud: הַמַּתֶּכֶת קָשָׁה יוֹתֵר
translit: Hamatekhet Kasha Yoter
translit_ru: хаматэхэт каша йотэр

Доказательства: [файл1](evidence/51de67beae65dc13.png), [файл2](evidence/fb41e51d6e0cdbf9.json), [файл3](evidence/8f4061d1615a41c0.jpg)
Словарные источники: [источник1](https://www.pealim.com/dict/5755-matechet/), [источник2](https://www.pealim.com/dict/4445-kashe/)

### D129-140-MEAN-131-b004
Подтверждённое отклонение атласа. Страницы: 131. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p131:b004

**Наблюдение:**
Normative average has dagesh in tsadi. Plene spelling is retained; modern memutsa and both transliterations do not change.

**Исходник:**
בדיקת קשיות בשיטת ברינל היא שיטה שכיחה לקביעת קשיות החומר, המודדת את ההתנגדות של חומר לעיוות תחת עומס מוגדר ומרוכז לפרק זמן מוגדר. הבדיקה מתבצעת באמצעות לחיצת כדורית פלדה שקוטרה נתון בכוח ידוע. קושי המתכת נקבע לפי מדידת קוטר הגומה (העקבה) בשלוש מקומות וקביעת קוטר ממוצע שהכדורית יוצרת בעזרת מיקרוסקופ המכויל בהתאם.

**Текущая запись:**
מְמוּצָע

**Исправление / интерпретация:**
מְמוּצָּע (or standard defective מְמֻצָּע)

Доказательства: [файл1](evidence/af8f32d6b3c19300.png)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/8927_1/%D7%9E%D6%B0%D7%9E%D6%BB%D7%A6%D6%BC%D6%B8%D7%A2)

### D129-140-MEAN-132-b006-s05
Подтверждённое отклонение атласа. Страницы: 132. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p132:b006:s05

**Наблюдение:**
Normative average has dagesh in tsadi. Plene spelling is retained; modern memutsa and both transliterations do not change.

**Исходник:**
d קוטר עקבה ממוצע mm

**Текущая запись:**
מְמוּצָע

**Исправление / интерпретация:**
מְמוּצָּע (or standard defective מְמֻצָּע)

Доказательства: [файл1](evidence/be4addde0f8b86e6.png)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/8927_1/%D7%9E%D6%B0%D7%9E%D6%BB%D7%A6%D6%BC%D6%B8%D7%A2)

### D129-140-MEAN-135-b003
Подтверждённое отклонение атласа. Страницы: 135. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p135:b003

**Наблюдение:**
Normative average has dagesh in tsadi. Plene spelling is retained; modern memutsa and both transliterations do not change.

**Исходник:**
החודרן בבדיקה זו הוא פירמידת יהלום מרובעת בעלת זווית חוד 136° בין הפאות המנוגדות. עומס הבדיקה יכול להשתנות בין 1 kg ל-120 kg למשך כ-15 שניות. קושי המתכת נקבע לפי מדידת ממוצע אלכסוני העקבה המרובעת שהפירמידה יוצרת. מדידת הגומה נעשית באמצעות מיקרוסקופ המכויל בהתאם.

**Текущая запись:**
מְמוּצָע

**Исправление / интерпретация:**
מְמוּצָּע (or standard defective מְמֻצָּע)

Доказательства: [файл1](evidence/8d44d0c41e1bd59d.png)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/8927_1/%D7%9E%D6%B0%D7%9E%D6%BB%D7%A6%D6%BC%D6%B8%D7%A2)

### D129-140-MEAN-136-b001-s05
Подтверждённое отклонение атласа. Страницы: 136. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p136:b001:s05

**Наблюдение:**
Normative average has dagesh in tsadi. Plene spelling is retained; modern memutsa and both transliterations do not change.

**Исходник:**
d ממוצע אורכי אלכסונים mm

**Текущая запись:**
מְמוּצָע

**Исправление / интерпретация:**
מְמוּצָּע (or standard defective מְמֻצָּע)

Доказательства: [файл1](evidence/a500631ee109437a.png)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/8927_1/%D7%9E%D6%B0%D7%9E%D6%BB%D7%A6%D6%BC%D6%B8%D7%A2)

### D129-140-MEAN-TERM
Подтверждённое отклонение атласа. Страницы: 136. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:term:mean-diagonal

**Наблюдение:**
The same missing tsadi dagesh is in canonical mean-diagonal; body and term are separate addressed records, one cause.

**Исходник:**
ממוצע אורכי אלכסונים

**Текущая запись:**
מְמוּצָע אוֹרְכֵי אֲלַכְסוֹנִים

**Исправление / интерпретация:**
מְמוּצָּע אוֹרְכֵי אֲלַכְסוֹנִים

Доказательства: [файл1](sources/source.pdf#page=136)
Словарные источники: [источник1](https://terms.hebrew-academy.org.il/munnah/8927_1/%D7%9E%D6%B0%D7%9E%D6%BB%D7%A6%D6%BC%D6%B8%D7%A2)

### D129-140-RU-SOURCE-GRAMMAR
Подтверждённое отклонение атласа. Страницы: 132. Важность: незначительное.
Проверка: Полнота русского перевода

Адреса: a97001:p132:b004:s02

**Наблюдение:**
RU «поскольку вследствие образуются пластическое течение, края…» is ungrammatical and opaque. This is readable-translation/editorial quality, not a HE omission or proof of a new scientific error. No actual editor object/notes found on this unit; UI caveat still unverified.

**Исходник:**
יש קושי במדידת המידה של העקבה (קוטר ההטבעה לא תמיד מדויק מכיוון שעקב נוצרים זרימה פלסטית שוליים המגדילים את השקע).

**Текущая запись:**
Имеется трудность в измерении размера отпечатка (диаметр вдавливания не всегда точен, поскольку вследствие образуются пластическое течение, края, увеличивающие углубление).

**Исправление / интерпретация:**
diplomatic_note: Source contains the damaged sequence שעקב נוצרים זרימה פלסטית שוליים. Keep HE unchanged and explicitly flag this grammar.
minimal_contextual_interpretation: Размер отпечатка трудно измерить: его диаметр не всегда точен; исходная фраза связывает это с пластическим течением и краями, увеличивающими углубление.
interpretation_is_not_literal_source: True

Доказательства: [файл1](evidence/3b63dc4bb03b7255.png)

### D129-140-SOURCEONLY-131-GLYPH
Подтверждённое отклонение атласа. Страницы: 131. Важность: незначительное.
Проверка: Полнота инвентаря источника, Структурированная запись

Адреса: p131:source-only:d-lower-label

**Наблюдение:**
Distinct small glyph at lower red ball has no individual current label or unresolved-label record. Entire figure retains it. Presence is certain, d is not asserted as exact.

**Исходник:**
[small dark glyph; d visually probable, exact letter unresolved]

**Текущая запись:**
No corresponding individual label; complete figure asset is present.

**Исправление / интерпретация:**
Добавлять только независимо прочитанные подписи с доказательством для каждой позиции. Для нечитаемых фрагментов сохранить явный blocked. Не выдумывать d или цифры шкалы.

Доказательства: [файл1](evidence/8472c6535c456371.png)

### D129-140-SOURCEONLY-137-DIALS
Подтверждённое отклонение атласа. Страницы: 137. Важность: незначительное.
Проверка: Полнота инвентаря источника, Структурированная запись

Адреса: p137:source-only:dial1

**Наблюдение:**
Dial numeric/central-text leaves are retained in the figure image but omitted from structured language inventory. Do not infer unreadable digits from scale sequence.

**Исходник:**
Four dial faces: readable examples 0, 120; exact position ledger separately.

**Текущая запись:**
No corresponding individual label; complete figure asset is present.

**Исправление / интерпретация:**
Добавлять только независимо прочитанные подписи с доказательством для каждой позиции. Для нечитаемых фрагментов сохранить явный blocked. Не выдумывать d или цифры шкалы.

Доказательства: [файл1](evidence/dd64c2d474bb8ac1.png), [файл2](evidence/cb888b2dc9094d9a.png), [файл3](evidence/56feb3d2ad68440b.png), [файл4](evidence/50828b6840ca219b.png)

### D129-140-STRESS-129-b002-s01
Подтверждённое отклонение атласа. Страницы: 129. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p129:b002:s01

**Наблюдение:**
Construct stress of yielding/tension/pulling requires patah. Modern a and both transliterations unchanged; adjective contexts left intact.

**Исходник:**
σₜ מאמץ מתיחה MPa = N/mm²

**Текущая запись:**
σₜ מַאֲמָץ מְתִיחָה MPa = N/mm²

**Исправление / интерпретация:**
Заменить только сопряжённое מַאֲמָץ на מַאֲמַץ перед следующим существительным.

Доказательства: [файл1](evidence/f7bddff4d18adae1.png)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/)

### D129-140-STRESS-129-b004
Подтверждённое отклонение атласа. Страницы: 129. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p129:b004

**Наблюдение:**
Construct stress of yielding/tension/pulling requires patah. Modern a and both transliterations unchanged; adjective contexts left intact.

**Исходник:**
בסגסוגות רבות חסרה נקודה ברורה של מעבר מאזור אלסטיות לאזור פלסטיות. אחת הדרכים לקביעת מאמץ הכניעה היא הנקודה בה ישנו מעוות של מעל 0.2%, קביעה זו אינה מוחלטת אך מתאימה מספר רב של מתכות.

**Текущая запись:**
בְּסַגְסוֹגוֹת רַבּוֹת חֲסֵרָה נְקוּדָּה בְּרוּרָה שֶׁל מַעֲבָר מֵאֵזוֹר אֵלַסְטִיּוּת לְאֵזוֹר פְּלַסְטִיּוּת. אַחַת הַדְּרָכִים לִקְבִיעַת מַאֲמָץ הַכְּנִיעָה הִיא הַנְּקוּדָּה בָּהּ יֶשְׁנוֹ מַעֲוָת שֶׁל מֵעַל 0.2%, קְבִיעָה זוֹ אֵינָהּ מוּחְלֶטֶת אַךְ מַתְאִימָה מִסְפַּר רַב שֶׁל מַתָּכוֹת.

**Исправление / интерпретация:**
Заменить только сопряжённое מַאֲמָץ на מַאֲמַץ перед следующим существительным.

Доказательства: [файл1](evidence/709f4c7534e95ffc.png)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/)

### D129-140-STRESS-133-b004
Подтверждённое отклонение атласа. Страницы: 133. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p133:b004

**Наблюдение:**
Construct stress of yielding/tension/pulling requires patah. Modern a and both transliterations unchanged; adjective contexts left intact.

**Исходник:**
מאמץ התעייפות

**Текущая запись:**
מַאֲמָץ הִתְעַיְּפוּת

**Исправление / интерпретация:**
Заменить только сопряжённое מַאֲמָץ на מַאֲמַץ перед следующим существительным.

Доказательства: [файл1](evidence/575b19f2889e3e73.png)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/)

### D129-140-STRESS-133-b005-s01
Подтверждённое отклонение атласа. Страницы: 133. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p133:b005:s01

**Наблюдение:**
Construct stress of yielding/tension/pulling requires patah. Modern a and both transliterations unchanged; adjective contexts left intact.

**Исходник:**
σ מאמץ התעייפות N/mm² = MPa

**Текущая запись:**
σ מַאֲמָץ הִתְעַיְּפוּת N/mm² = MPa

**Исправление / интерпретация:**
Заменить только сопряжённое מַאֲמָץ на מַאֲמַץ перед следующим существительным.

Доказательства: [файл1](evidence/1ddb516822b6e38c.png)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/)

### D129-140-STRESS-133-b006
Подтверждённое отклонение атласа. Страницы: 133. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p133:b006

**Наблюдение:**
Construct stress of yielding/tension/pulling requires patah. Modern a and both transliterations unchanged; adjective contexts left intact.

**Исходник:**
מאמץ כניעה

**Текущая запись:**
מַאֲמָץ כְּנִיעָה

**Исправление / интерпретация:**
Заменить только сопряжённое מַאֲמָץ на מַאֲמַץ перед следующим существительным.

Доказательства: [файл1](evidence/7ca950c2b2a86308.png)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/)

### D129-140-STRESS-133-b007-s01
Подтверждённое отклонение атласа. Страницы: 133. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p133:b007:s01

**Наблюдение:**
Construct stress of yielding/tension/pulling requires patah. Modern a and both transliterations unchanged; adjective contexts left intact.

**Исходник:**
σᵧ מאמץ כניעה במתיחה N/mm² = MPa

**Текущая запись:**
σᵧ מַאֲמָץ כְּנִיעָה בִּמְתִיחָה N/mm² = MPa

**Исправление / интерпретация:**
Заменить только сопряжённое מַאֲמָץ на מַאֲמַץ перед следующим существительным.

Доказательства: [файл1](evidence/cc273a57fcfeb65b.png)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/)

### D129-140-STRESS-134-b001
Подтверждённое отклонение атласа. Страницы: 134. Важность: незначительное.
Проверка: Огласовки

Адреса: a97001:p134:b001

**Наблюдение:**
Construct stress of yielding/tension/pulling requires patah. Modern a and both transliterations unchanged; adjective contexts left intact.

**Исходник:**
מאמץ משיכה מרבי

**Текущая запись:**
מַאֲמָץ מְשִׁיכָה מְרַבִּי

**Исправление / интерпретация:**
Заменить только сопряжённое מַאֲמָץ на מַאֲמַץ перед следующим существительным.

Доказательства: [файл1](evidence/43087abd8d23e95e.png)
Словарные источники: [источник1](https://www.pealim.com/dict/4080-maamatz/)

### PUB-FOOTER-S01-READING
Подтверждённое отклонение атласа. Страницы: 1. Важность: незначительное.
Проверка: he_niqqud, translit, translit_ru

Адреса: a97001:p1:audit-footer:s01

**Наблюдение:**
Source is clear vector text, not an unreadable scan. Current nonlearning_artifact classification and null reading fields do not satisfy the requested all-fragments reading scope. Existing source HE/RU are not reported missing.

**Исходник:**
מה"ט - המכון הממשלתי להכשרה בטכנולוגיה ובמדע|labor.gov.il|

**Текущая запись:**
he_niqqud: 
translit: 
translit_ru: 

**Исправление / интерпретация:**
Заполнить огласовки и обе транслитерации читаемой строки, явно оговорив чтение сокращения. Адрес сайта сохранить латиницей. Не домысливать другие сокращения в footer s02.

Доказательства: [файл1](evidence/df89dfea5720a6b6.png), [файл2](evidence/065f189d5a281f75.json)

### PUB-GAP-ACRONYM
Подтверждённое отклонение атласа. Страницы: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203. Важность: существенное.
Проверка: he, ru, he_niqqud, translit, translit_ru

Адреса: publisher:238:acronym

**Исходник:**
מה״ט

**Текущая запись:**
pages1to5: he/NI/TR/TR-RU null in source-logo artifact; RU only identifies the image.
pages6to203: No dedicated source-position language record; source persists only in page raster reference.

**Исправление / интерпретация:**
Добавить точный исходный текст, полный перевод RU и соответствующие огласовки/латинское/кириллическое чтение для данного читаемого фрагмента либо согласовать с пользователем явное исключение из охвата. Действительно неразборчивый микротекст оставить отдельным ограничением.

**Ограничения:**
readable_source_text_not_represented_in_requested_language_layers

Доказательства: [файл1](evidence/274b235b6edf5f8c.json), [файл2](evidence/851866620c93cc3b.png), [файл3](evidence/d0b4812ba526c4b6.png), [файл4](evidence/37b84610320f7097.png), [файл5](evidence/69666fdcde0adaa5.png)

### PUB-GAP-SUBTITLE
Подтверждённое отклонение атласа. Страницы: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203. Важность: существенное.
Проверка: he, ru, he_niqqud, translit, translit_ru

Адреса: publisher:236:subtitle

**Исходник:**
המכון הממשלתי להכשרה טכנולוגית

**Текущая запись:**
pages1to5: he/NI/TR/TR-RU null in source-logo artifact; RU only identifies the image.
pages6to203: No dedicated source-position language record; source persists only in page raster reference.

**Исправление / интерпретация:**
Добавить точный исходный текст, полный перевод RU и соответствующие огласовки/латинское/кириллическое чтение для данного читаемого фрагмента либо согласовать с пользователем явное исключение из охвата. Действительно неразборчивый микротекст оставить отдельным ограничением.

**Ограничения:**
readable_source_text_not_represented_in_requested_language_layers

Доказательства: [файл1](evidence/274b235b6edf5f8c.json), [файл2](evidence/4be7df9b88c2f393.png), [файл3](evidence/48e8ab05f01a4d59.png), [файл4](evidence/215eb19e81ef316a.png)

### PUB-GAP-TITLE
Подтверждённое отклонение атласа. Страницы: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203. Важность: существенное.
Проверка: he, ru, he_niqqud, translit, translit_ru

Адреса: publisher:236:title

**Исходник:**
משרד העבודה

**Текущая запись:**
pages1to5: he/NI/TR/TR-RU null in source-logo artifact; RU only identifies the image.
pages6to203: No dedicated source-position language record; source persists only in page raster reference.

**Исправление / интерпретация:**
Добавить точный исходный текст, полный перевод RU и соответствующие огласовки/латинское/кириллическое чтение для данного читаемого фрагмента либо согласовать с пользователем явное исключение из охвата. Действительно неразборчивый микротекст оставить отдельным ограничением.

**Ограничения:**
readable_source_text_not_represented_in_requested_language_layers

Доказательства: [файл1](evidence/274b235b6edf5f8c.json), [файл2](evidence/4be7df9b88c2f393.png), [файл3](evidence/48e8ab05f01a4d59.png), [файл4](evidence/215eb19e81ef316a.png)

### UI124-LEXICAL-SPECIMEN
Подтверждённое отклонение атласа. Страницы: 124. Важность: существенное.
Карточка выбирает неверное значение слова

Адреса: a97001:p124:b004

**Исходник:**
דגם in the tensile-test sentence is the noun specimen/sample.

**Текущая запись:**
Словарная форма: דגם; демонстрировать, приводить пример; корень דגם

**Исправление / интерпретация:**
В нижнем словарном разборе этого вхождения использовать существительное «образец», а не глагольное значение.

**Ограничения:**
Lower lexical gloss only. UI does not explicitly label its part of speech here. Upper canonical term and contextual AI correctly identify a specimen. Separate from the pre-existing occurrence niqqud Dgam finding.

Доказательства: [файл1](evidence/72b5a0db06274b64.json), [файл2](evidence/b12015acd8674ee1.jpg), [файл3](evidence/673e9efe8308a1c9.json)

### UI124-MORPH-METIKHA
Подтверждённое отклонение атласа. Страницы: 124. Важность: существенное.
Карточка разбирает неверную лексему

Адреса: a97001:p124:b002

**Исходник:**
In מבחן מתיחה, מתיחה is the noun stretching/tension, not adjective feminine flexible.

**Текущая запись:**
Lower context breakdown: מתיח, adjective, гибкий; в тексте гибкая, ж.р.ед.

**Исправление / интерпретация:**
Здесь существительное מתיחה в контексте испытания на растяжение. Верхний термин и пояснение ИИ уже правильно говорят о растяжении.

**Ограничения:**
Lower context word analysis only. Upper canonical term and AI contextual explanation are already correct.

Доказательства: [файл1](evidence/1e82d1b9a27afaaf.jpg)

### UI40-SOURCE-UNDERLINE
Подтверждённое отклонение атласа. Страницы: 40. Важность: незначительное.
Авторское подчёркивание смешано с оформлением ссылок

Адреса: a97001:p40:b003:s05

**Наблюдение:**
The original black solid emphasis underline is not preserved as source emphasis. The terms receive the generic interactive term style: underline 2px dotted rgb(180,113,26), weight400, like other clickable terms.

**Исправление / интерпретация:**
Сохранить авторское смысловое подчёркивание отдельно от стандартной индикации кликабельных терминов.

**Ограничения:**
Do not say these words have no underline at all. Their source emphasis is conflated with generic term highlighting. Original raster preserves source appearance.

Доказательства: [файл1](evidence/c0795a15f1ec3179.json), [файл2](evidence/5df3b205b78f0d97.jpg)

### UI42-SOURCE-COLOR
Подтверждённое отклонение атласа. Страницы: 42. Важность: незначительное.
Утрачено смысловое различие цветовых выделений

Адреса: a97001:p42:b003

**Наблюдение:**
חיובית and שלילית both use rgb(15,23,42) in raw HE and rgb(11,90,94) in NI, weight400. The source green-positive/red-negative distinction is absent from the educational row. נמתח/נלחץ use generic gold dotted term underlines rather than the original solid source underline.

**Исправление / интерпретация:**
Передать различие положительного/отрицательного результата и исходные смысловые выделения в учебной строке, сохранив доступность без зависимости только от цвета.

**Ограничения:**
Source color remains visible in raster. NI being green throughout does not preserve the distinct green/red semantic coloring.

Доказательства: [файл1](evidence/ae68af7fe98e1986.json), [файл2](evidence/a2cafaee3535a8f9.jpg)

### UI43-CIRCLED-NUMBERS
Подтверждённое отклонение атласа. Страницы: 43, 55. Важность: существенное.
Номера отображаются квадратами в проверенном браузере

Адреса: a97001:p43:b002; a97001:p43:b004; a97001:p43:b006; a97001:p55:b002

**Наблюдение:**
Correct Unicode ⑧/⑥/⑦ exists in DOM, but actual tested Chrome renders empty/missing-glyph boxes instead of the numbers. The failure repeats after reopening the page. The circled part number also appears as a missing-glyph box in the visible first heading.

**Исправление / интерпретация:**
Обеспечить видимое отображение номеров стержней/частей в проверенной конфигурации браузера; исходные Unicode-значения в данных сохраняются.

**Ограничения:**
Observed compatibility failure in this browser/environment. CSS font-family was collected, not actual chosen system glyph font. Other browsers/devices not tested. Do not call this data loss.
Same compatibility family as p43; exact source ref is supplied in the DOM coverage rather than guessed.

Доказательства: [файл1](evidence/679f6a3679d8fe9b.json), [файл2](evidence/5290a6a62c8b1ab5.jpg), [файл3](evidence/205244cdf2f1defe.json), [файл4](evidence/c4ad6e2f7aaced34.jpg), [файл5](evidence/fdab412ebf74dc95.json), [файл6](evidence/abdf32e7286dfc06.json), [файл7](evidence/cf5df804ae6d4a2c.jpg)

### UI50-SOURCE-CALLOUT
Подтверждённое отклонение атласа. Страницы: 50. Важность: незначительное.
Не сохранено выделение примечания

Адреса: a97001:p50:b005:s01

**Наблюдение:**
The parenthetical source callout is ordinary weight400, transparent background, no special text decoration. Source gray/bold emphasis is absent in the educational row.

**Исправление / интерпретация:**
Сохранить визуальное выделение замечания о таблице на следующей странице; сам текст уже присутствует.

**Ограничения:**
This concerns source emphasis, not missing words; text is present.

Доказательства: [файл1](evidence/ef30469fa36ec823.json), [файл2](evidence/762e2f6a8f6c8de6.jpg)

### UI53-PAGE-POSITION
Подтверждённое отклонение атласа. Страницы: 53. Важность: незначительное.
Сбой перехода и номера текущей страницы

Адреса: #atlas-p53; a97001:p53:b001

**Наблюдение:**
Direct page53 opening repeatedly lands near the end of53 and beginning of54. Smaller manual scroll steps eventually reveal the top of53; the toolbar then still shows52. Content is accessible, but positioning/current-page synchronization fails in the tested sequence.

**Исправление / интерпретация:**
Стабилизировать прямой переход к началу страницы 53 и синхронизацию номера после загрузки/прокрутки; не считать страницу недоступной.

**Ограничения:**
Manual-top attempt file records an intermediate failed scroll, not success. Final recovered overview is p53-overview.jpg with page53 content and toolbar52. Layout shifts were observed, but underlying cause is not proven. Not an access denial or unavailable page.

Доказательства: [файл1](evidence/cb8bb53d3c83587f.json), [файл2](evidence/a2d0f4cba566a452.jpg), [файл3](evidence/ba3c6318baa44d07.json), [файл4](evidence/8b0dc7020be5d582.jpg), [файл5](evidence/76bbc93158a68de7.json), [файл6](evidence/8eedb8b7024f21ff.json), [файл7](evidence/20ce00dd822787e1.jpg)

### UI62-VECTOR-ARROWS
Подтверждённое отклонение атласа. Страницы: 62. Важность: существенное.
Векторные стрелки отображаются квадратами

Адреса: a97001:p62:img01:label-01; a97001:p62:img01:label-02; a97001:p62:img01:label-03; a97001:p62:img01:label-04

**Наблюдение:**
A⃗, N⃗, W_x⃗ and f⃗ contain combining vector arrow U+20D7 in DOM. Actual visible labels render a missing-glyph box after the letter instead of a vector arrow.

**Исправление / интерпретация:**
Обеспечить отображение векторных стрелок в проверенной конфигурации; данные с U+20D7 и исходный растр уже сохранены.

**Ограничения:**
Browser/environment-specific rendering result. The source bitmap retains its vector arrows. Similar boxes occur in visible label overviews63–66; not every formula on those pages was inspected.

Доказательства: [файл1](evidence/735d1e89bfe3d221.json), [файл2](evidence/cdcb727547560af3.jpg), [файл3](evidence/52d197845d05ab55.json), [файл4](evidence/7edb26b5e343ef75.jpg)
